import hashlib
import hmac
import json
import logging
from datetime import date, timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Product, SocialMediaPost
from socials.models import MetaConnection, ConnectedPage, WebhookEvent
from socials.serializers import ConnectedPageSerializer, SocialMediaPostSerializer
from socials.services.meta_graph import MetaGraphClient, MetaGraphError
from socials.services.publisher import (
    PLATFORM_PUBLISHERS,
    TransientPublishError,
    publish_post_record,
    resolve_image_source,
)
from socials.tasks import process_webhook_event, publish_scheduled_post

logger = logging.getLogger(__name__)

OAUTH_STATE_SALT = 'meta-oauth-state'


def signature_is_valid(raw_body, header_value):
    """Check the X-Hub-Signature-256 HMAC against the app secret."""
    if not settings.META_APP_SECRET:
        return False
    if not header_value or not header_value.startswith('sha256='):
        return False
    expected = hmac.new(
        settings.META_APP_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header_value.split('=', 1)[1])


class MetaWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        """Answer Meta's webhook verification handshake."""
        mode = request.query_params.get('hub.mode')
        verify_token = request.query_params.get('hub.verify_token')
        challenge = request.query_params.get('hub.challenge', '')
        if (
            mode == 'subscribe'
            and settings.META_WEBHOOK_VERIFY_TOKEN
            and verify_token == settings.META_WEBHOOK_VERIFY_TOKEN
        ):
            return HttpResponse(challenge, content_type='text/plain')
        return Response({'error': 'Verification failed'}, status=status.HTTP_403_FORBIDDEN)

    def post(self, request):
        """Validate signature, persist the event, dispatch to Celery."""
        header_value = request.headers.get('X-Hub-Signature-256', '')
        if not signature_is_valid(request.body, header_value):
            logger.warning('Rejected Meta webhook with invalid signature')
            return Response({'error': 'Invalid signature'}, status=status.HTTP_403_FORBIDDEN)
        payload = json.loads(request.body.decode() or '{}')
        event = WebhookEvent.objects.create(
            object_type=payload.get('object', 'unknown'),
            payload=payload,
            signature_valid=True,
        )
        process_webhook_event.delay(event.id)
        return Response({'status': 'received'})
OAUTH_STATE_MAX_AGE = 600
OAUTH_SCOPES = ','.join([
    'pages_show_list',
    'pages_messaging',
    'pages_manage_metadata',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_messages',
    'instagram_manage_comments',
    'pages_manage_posts',
    'instagram_content_publish',
    'pages_read_user_content',
])


def get_request_tenant(request):
    """Return the tenant for the authenticated user or None."""
    profile = getattr(request.user, 'vendor_profile', None)
    return profile.tenant if profile else None


def build_connect_url(tenant):
    """Build the Facebook OAuth dialog URL with a signed state."""
    state = signing.dumps({'tenant_id': tenant.id}, salt=OAUTH_STATE_SALT)
    params = urlencode({
        'client_id': settings.META_APP_ID,
        'redirect_uri': settings.META_OAUTH_REDIRECT_URI,
        'scope': OAUTH_SCOPES,
        'response_type': 'code',
        'state': state,
    })
    return f'https://www.facebook.com/v21.0/dialog/oauth?{params}'


def validate_state(state, tenant):
    """Return True when the signed state belongs to this tenant."""
    try:
        data = signing.loads(state, salt=OAUTH_STATE_SALT, max_age=OAUTH_STATE_MAX_AGE)
    except signing.BadSignature:
        return False
    return data.get('tenant_id') == tenant.id


class ConnectUrlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the OAuth dialog URL for the user's tenant."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'url': build_connect_url(tenant)})


class OAuthCallbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Exchange the OAuth code, store the connection, return Pages."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        code = request.data.get('code')
        state = request.data.get('state')
        if not code or not state:
            return Response({'error': 'code and state are required'}, status=status.HTTP_400_BAD_REQUEST)
        if not validate_state(state, tenant):
            return Response({'error': 'Invalid or expired state'}, status=status.HTTP_400_BAD_REQUEST)
        client = MetaGraphClient()
        try:
            short_token = client.exchange_code(code, settings.META_OAUTH_REDIRECT_URI)
            long_lived = client.get_long_lived_token(short_token)
            profile = client.get_user_profile(long_lived['access_token'])
            pages = client.list_pages(long_lived['access_token'])
        except MetaGraphError as exc:
            logger.warning('Meta OAuth callback failed: %s', exc)
            return Response(
                {'error': 'Could not connect to Facebook. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        expires_at = None
        if long_lived.get('expires_in'):
            expires_at = timezone.now() + timedelta(seconds=long_lived['expires_in'])
        connection, _ = MetaConnection.objects.update_or_create(
            tenant=tenant,
            defaults={
                'fb_user_id': profile['id'],
                'token_expires_at': expires_at,
                'status': 'connected',
            },
        )
        connection.set_access_token(long_lived['access_token'])
        connection.save()
        return Response({
            'pages': [{'id': p['id'], 'name': p['name']} for p in pages],
        })


class PageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List the tenant's connected Pages."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        pages = ConnectedPage.objects.filter(tenant=tenant)
        return Response(ConnectedPageSerializer(pages, many=True).data)


class PageConnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, page_id):
        """Connect a Page: store its token, subscribe webhooks, link IG."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        connection = MetaConnection.objects.filter(tenant=tenant, status='connected').first()
        if not connection:
            return Response(
                {'error': 'Connect your Facebook account first'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ConnectedPage.objects.filter(page_id=page_id).exclude(tenant=tenant).exists():
            return Response(
                {'error': 'This Page is already connected to another business'},
                status=status.HTTP_409_CONFLICT,
            )
        client = MetaGraphClient()
        try:
            pages = client.list_pages(connection.get_access_token())
            target = next((p for p in pages if p['id'] == page_id), None)
            if not target:
                return Response({'error': 'Page not found'}, status=status.HTTP_404_NOT_FOUND)
            client.subscribe_page(page_id, target['access_token'])
            instagram = client.get_instagram_account(page_id, target['access_token'])
            if not instagram:
                instagram = client.get_granted_instagram_account(connection.get_access_token())
        except MetaGraphError as exc:
            if exc.code == 190:
                connection.status = 'expired'
                connection.save()
                return Response(
                    {'error': 'Facebook session expired. Please reconnect.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            logger.warning('Meta page connect failed: %s', exc)
            return Response(
                {'error': 'Could not connect the Page. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        page, _ = ConnectedPage.objects.update_or_create(
            page_id=page_id,
            defaults={
                'tenant': tenant,
                'connection': connection,
                'name': target['name'],
                'instagram_account_id': instagram['id'] if instagram else '',
                'instagram_username': instagram['username'] if instagram else '',
                'status': 'connected',
            },
        )
        page.set_access_token(target['access_token'])
        page.save()
        return Response(ConnectedPageSerializer(page).data, status=status.HTTP_201_CREATED)


class PageDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, page_id):
        """Unsubscribe webhooks and mark the Page disconnected."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        page = ConnectedPage.objects.filter(tenant=tenant, page_id=page_id).first()
        if not page:
            return Response({'error': 'Page not found'}, status=status.HTTP_404_NOT_FOUND)
        client = MetaGraphClient()
        try:
            client.unsubscribe_page(page_id, page.get_access_token())
        except MetaGraphError:
            pass
        page.status = 'disconnected'
        page.save()
        return Response(ConnectedPageSerializer(page).data)


EDIT_GUARD_ERROR = 'Only drafts and scheduled posts can be edited'
POST_STATUSES = {'draft', 'scheduled', 'pending', 'posted', 'failed'}


def parse_platforms(data):
    """Return the platforms list from JSON or multipart payloads."""
    if hasattr(data, 'getlist'):
        values = data.getlist('platforms')
        if values:
            return values
    value = data.get('platforms')
    return value if isinstance(value, list) else ([value] if value else [])


def parse_schedule_datetime(raw):
    """Parse an ISO datetime; returns (datetime|None, error|None)."""
    if not raw:
        return None, None
    try:
        parsed = drf_serializers.DateTimeField().to_internal_value(raw)
    except drf_serializers.ValidationError:
        return None, 'Invalid scheduled_for datetime'
    if parsed <= timezone.now():
        return None, 'scheduled_for must be in the future'
    return parsed, None


def get_tenant_post(request, post_id):
    """Return (tenant, post) tenant-scoped; Nones on miss."""
    tenant = get_request_tenant(request)
    if not tenant:
        return None, None
    post = SocialMediaPost.objects.filter(tenant=tenant, id=post_id).first()
    return tenant, post


class PublishPostView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List posts for the calendar within a date range."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        queryset = SocialMediaPost.objects.filter(tenant=tenant).annotate(
            display_date=Coalesce('scheduled_for', 'created_at')
        )
        try:
            start = request.query_params.get('from')
            end = request.query_params.get('to')
            if start:
                queryset = queryset.filter(display_date__date__gte=date.fromisoformat(start))
            if end:
                queryset = queryset.filter(display_date__date__lte=date.fromisoformat(end))
        except ValueError:
            return Response({'error': 'Invalid date range'}, status=status.HTTP_400_BAD_REQUEST)
        status_filter = request.query_params.get('status')
        if status_filter:
            if status_filter not in POST_STATUSES:
                return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(status=status_filter)
        queryset = queryset.select_related('product').order_by('-display_date')
        return Response(SocialMediaPostSerializer(queryset, many=True).data)

    def post(self, request):
        """Publish, schedule, or draft a post to the selected platforms."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        platforms = parse_platforms(request.data)
        if not platforms or any(p not in PLATFORM_PUBLISHERS for p in platforms):
            return Response(
                {'error': 'platforms must contain facebook and/or instagram'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        product = None
        product_id = request.data.get('product_id')
        if product_id:
            product = Product.objects.filter(tenant=tenant, id=product_id).first()
            if not product:
                return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        image_file = request.FILES.get('image')
        caption = (
            request.data.get('caption')
            or (product.description if product else '')
            or (product.name if product else '')
        )
        save_as_draft = request.data.get('save_as') == 'draft'
        post_format = request.data.get('post_format') or 'feed'
        if post_format not in ('feed', 'story'):
            return Response(
                {'error': 'post_format must be feed or story'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        scheduled_for, schedule_error = parse_schedule_datetime(request.data.get('scheduled_for'))
        if schedule_error:
            return Response({'error': schedule_error}, status=status.HTTP_400_BAD_REQUEST)
        is_create_mode = save_as_draft or bool(scheduled_for)
        if is_create_mode:
            return self.create_posts(
                tenant, platforms, product, caption, image_file, save_as_draft, scheduled_for, post_format
            )
        return self.publish_immediately(tenant, platforms, product, caption, image_file, post_format)

    def create_posts(self, tenant, platforms, product, caption, image_file, save_as_draft, scheduled_for, post_format):
        """Persist draft or scheduled records without publishing them."""
        if not product and not image_file:
            return Response(
                {'error': 'Provide a product or an image'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        records = []
        for platform in platforms:
            if image_file:
                image_file.seek(0)
            records.append(SocialMediaPost.objects.create(
                tenant=tenant, product=product, platform=platform,
                caption=caption, image=image_file,
                status='draft' if save_as_draft else 'scheduled',
                scheduled_for=scheduled_for,
                post_format=post_format,
            ))
        return Response(
            SocialMediaPostSerializer(records, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    def publish_immediately(self, tenant, platforms, product, caption, image_file, post_format):
        """Publish now, preserving the original immediate-publish behavior."""
        if not product and not image_file:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        page = ConnectedPage.objects.filter(tenant=tenant, status='connected').first()
        if not page:
            return Response(
                {'error': 'Connect a Facebook Page first'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not resolve_image_source(image_file, product):
            return Response(
                {'error': 'Product has no image to post'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        results = [
            self.publish_one(platform, product, tenant, caption, image_file, post_format)
            for platform in platforms
        ]
        return Response({'results': results})

    def publish_one(self, platform, product, tenant, caption, image_file, post_format='feed'):
        """Create and publish one record, tolerating transient failures."""
        if image_file:
            image_file.seek(0)
        record = SocialMediaPost.objects.create(
            product=product, tenant=tenant, platform=platform, caption=caption,
            image=image_file, post_format=post_format,
        )
        try:
            publish_post_record(record)
        except TransientPublishError:
            logger.warning('Immediate publish %s failed on network error', record.id, exc_info=True)
            record.status = 'failed'
            record.error_message = 'Could not reach Facebook. Please try again.'
            record.save()
        return {
            'platform': platform,
            'status': record.status,
            'post_url': record.post_url,
            'error': record.error_message or None,
        }


class PostDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, post_id):
        """Edit a draft or scheduled post."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        scheduled_for, schedule_error = parse_schedule_datetime(request.data.get('scheduled_for'))
        if schedule_error:
            return Response({'error': schedule_error}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            post = SocialMediaPost.objects.select_for_update().filter(
                tenant=tenant, id=post_id
            ).first()
            if not post:
                return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
            if post.status not in ('draft', 'scheduled'):
                return Response({'error': EDIT_GUARD_ERROR}, status=status.HTTP_400_BAD_REQUEST)
            if 'caption' in request.data:
                post.caption = request.data.get('caption') or ''
            if request.FILES.get('image'):
                post.image = request.FILES['image']
            if scheduled_for:
                post.scheduled_for = scheduled_for
                post.status = 'scheduled'
            post.save()
        return Response(SocialMediaPostSerializer(post).data)

    def delete(self, request, post_id):
        """Delete a draft or scheduled post."""
        tenant, post = get_tenant_post(request, post_id)
        if not post:
            return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
        if post.status not in ('draft', 'scheduled'):
            return Response(
                {'error': 'Only drafts and scheduled posts can be deleted'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        post.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PostRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        """Re-queue a failed post."""
        tenant, post = get_tenant_post(request, post_id)
        if not post:
            return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
        if post.status != 'failed':
            return Response(
                {'error': 'Only failed posts can be retried'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        post.status = 'pending'
        post.error_message = ''
        post.save()
        publish_scheduled_post.delay(post.id)
        return Response(SocialMediaPostSerializer(post).data)
