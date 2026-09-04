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
    'ads_management',
    'ads_read',
    'business_management',
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
        from vendor.team_views import is_owner
        if not is_owner(request):
            return Response({'error': 'Only the owner can do this.'}, status=status.HTTP_403_FORBIDDEN)
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
            fb_user_id=profile['id'],
            defaults={
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
        connection = (
            MetaConnection.objects.filter(tenant=tenant, status='connected')
            .exclude(fb_user_id__startswith='ig-')
            .exclude(fb_user_id__startswith='wa-')
            .order_by('-updated_at')
            .first()
        )
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
        from socials.services.messenger_profile import setup_messenger_profile
        setup_messenger_profile(page)
        return Response(ConnectedPageSerializer(page).data, status=status.HTTP_201_CREATED)


class AdAccountListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List the vendor's active ad accounts for boosting."""
        from socials.services.boost_runner import BoostError, list_ad_accounts

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            return Response({'accounts': list_ad_accounts(tenant)})
        except BoostError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class BoostListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List the tenant's boosts, newest first."""
        from socials.models import BoostCampaign
        from socials.serializers import BoostCampaignSerializer

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        boosts = BoostCampaign.objects.filter(tenant=tenant).select_related('post__product').order_by('-created_at')[:30]
        return Response(BoostCampaignSerializer(boosts, many=True).data)

    def post(self, request):
        """Launch a boost after guardrail checks."""
        from core.models import SocialMediaPost
        from socials.serializers import BoostCampaignSerializer
        from socials.services.boost_runner import BoostError, launch_boost

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        from vendor.team_views import is_owner
        if not is_owner(request):
            return Response({'error': 'Only the owner can do this.'}, status=status.HTTP_403_FORBIDDEN)
        post = SocialMediaPost.objects.filter(
            tenant=tenant, id=request.data.get('post_id'),
        ).select_related('product').first()
        if post is None:
            return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            boost = launch_boost(
                tenant, post,
                ad_account_id=str(request.data.get('ad_account_id') or ''),
                daily_budget=int(request.data.get('daily_budget') or 0),
                days=int(request.data.get('days') or 0),
                age_min=request.data.get('age_min') or 18,
                age_max=request.data.get('age_max') or 44,
            )
        except (BoostError, TypeError, ValueError) as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BoostCampaignSerializer(boost).data, status=status.HTTP_201_CREATED)


class BoostActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, boost_id, action):
        """Pause or resume one boost."""
        from socials.models import BoostCampaign
        from socials.serializers import BoostCampaignSerializer
        from socials.services.boost_runner import BoostError, set_boost_status

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        from vendor.team_views import is_owner
        if not is_owner(request):
            return Response({'error': 'Only the owner can do this.'}, status=status.HTTP_403_FORBIDDEN)
        boost = BoostCampaign.objects.filter(tenant=tenant, id=boost_id).first()
        if boost is None:
            return Response({'error': 'Boost not found'}, status=status.HTTP_404_NOT_FOUND)
        if action not in ('pause', 'resume'):
            return Response({'error': 'Unknown action'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            boost = set_boost_status(boost, action)
        except BoostError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BoostCampaignSerializer(boost).data)


class BoostAdvisorView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return AI boost recommendations for recent posts.

        Cached for 12 hours; pass ?refresh=1 to recompute now.
        """
        from socials.services.boost_advisor import get_boost_advice

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        refresh = request.query_params.get('refresh') == '1'
        return Response(get_boost_advice(tenant, refresh=refresh))


class InstagramRedirectBridgeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        """Forward Instagram's HTTPS redirect to the local frontend callback.

        Instagram Login only accepts HTTPS redirect URIs, so the OAuth
        dialog lands here (public tunnel) and the browser is bounced to
        the frontend callback with the same query string.
        """
        from urllib.parse import urlencode

        from django.http import HttpResponseRedirect

        params = {
            key: request.query_params[key]
            for key in ('code', 'state', 'error', 'error_description')
            if key in request.query_params
        }
        target = settings.INSTAGRAM_LOGIN_FRONTEND_CALLBACK
        return HttpResponseRedirect(f'{target}?{urlencode(params)}')


class InstagramConnectUrlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the Instagram Business Login URL, or setup guidance."""
        from socials.services.instagram_login import (
            build_instagram_connect_url,
            instagram_login_configured,
        )

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        from vendor.team_views import is_owner
        if not is_owner(request):
            return Response({'error': 'Only the owner can do this.'}, status=status.HTTP_403_FORBIDDEN)
        if not instagram_login_configured():
            return Response(
                {'error': 'Instagram Login is not configured yet. Add the Instagram product '
                          'to the Meta app and set INSTAGRAM_LOGIN_APP_ID / INSTAGRAM_LOGIN_APP_SECRET.'},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )
        return Response({'url': build_instagram_connect_url(tenant)})


class InstagramOAuthCallbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Finish Instagram Login: store the account as a direct connection."""
        from socials.services.instagram_login import (
            exchange_instagram_code,
            fetch_instagram_profile,
            subscribe_instagram_webhooks,
            validate_instagram_state,
        )

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        code = request.data.get('code')
        state = request.data.get('state')
        if not code or not state:
            return Response({'error': 'code and state are required'}, status=status.HTTP_400_BAD_REQUEST)
        if not validate_instagram_state(state, tenant):
            return Response({'error': 'Invalid or expired state'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = exchange_instagram_code(code)
            profile = fetch_instagram_profile(token['access_token'])
        except MetaGraphError as exc:
            logger.warning('Instagram OAuth callback failed: %s', exc)
            return Response(
                {'error': 'Could not connect to Instagram. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        ig_id = profile['id'] or token['user_id']
        expires_at = None
        if token.get('expires_in'):
            expires_at = timezone.now() + timedelta(seconds=token['expires_in'])
        connection, _ = MetaConnection.objects.update_or_create(
            tenant=tenant,
            fb_user_id=f'ig-{ig_id}',
            defaults={'token_expires_at': expires_at, 'status': 'connected'},
        )
        connection.set_access_token(token['access_token'])
        connection.save()
        page, _ = ConnectedPage.objects.update_or_create(
            page_id=ig_id,
            defaults={
                'tenant': tenant,
                'connection': connection,
                'name': profile['name'] or f"@{profile['username']}",
                'instagram_account_id': ig_id,
                'instagram_username': profile['username'],
                'connection_type': 'instagram_direct',
                'status': 'connected',
            },
        )
        page.set_access_token(token['access_token'])
        page.save()
        subscribe_instagram_webhooks(ig_id, token['access_token'])
        return Response(ConnectedPageSerializer(page).data, status=status.HTTP_201_CREATED)


class PageProfileImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Copy the connected Page's public profile onto the store.

        Fills only fields the vendor has not set yet: bio from the
        Page about text, contact phone and address, and the Page
        picture as the store logo.
        """
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        page = ConnectedPage.objects.filter(tenant=tenant, status='connected').first()
        if page is None:
            return Response({'error': 'Connect a Facebook Page first.'}, status=status.HTTP_400_BAD_REQUEST)
        client = MetaGraphClient()
        try:
            payload = client.get(f'/{page.page_id}', {
                'access_token': page.get_access_token(),
                'fields': 'about,phone,single_line_address,picture.width(400){url}',
            })
        except MetaGraphError as exc:
            logger.warning('Page profile import failed: %s', exc)
            return Response({'error': 'Could not read the Page profile.'}, status=status.HTTP_502_BAD_GATEWAY)
        imported = apply_page_profile(tenant, payload)
        return Response({'imported': imported})


def apply_page_profile(tenant, payload):
    """Merge Page profile data into empty tenant fields; returns what changed."""
    metadata = tenant.metadata or {}
    contact = metadata.get('contact', {})
    imported = []
    if payload.get('about') and not metadata.get('bio'):
        metadata['bio'] = payload['about'][:1000]
        imported.append('bio')
    if payload.get('phone') and not contact.get('phone'):
        contact['phone'] = payload['phone'][:30]
        imported.append('phone')
    if payload.get('single_line_address') and not contact.get('address'):
        contact['address'] = payload['single_line_address'][:255]
        imported.append('address')
    metadata['contact'] = contact
    picture_url = ((payload.get('picture') or {}).get('data') or {}).get('url', '')
    if picture_url and not metadata.get('logo'):
        logo_path = download_page_picture(tenant, picture_url)
        if logo_path:
            metadata['logo'] = logo_path
            imported.append('logo')
    tenant.metadata = metadata
    tenant.save(update_fields=['metadata'])
    return imported


def download_page_picture(tenant, url):
    """Save the Page picture as the store logo; empty string on failure."""
    import requests as http
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    try:
        response = http.get(url, timeout=10)
        response.raise_for_status()
    except http.exceptions.RequestException:
        logger.info('Page picture download failed for tenant %s', tenant.id)
        return ''
    slug = tenant.subdomain or 'default'
    return default_storage.save(
        f'uploads/{slug}/logo/page-logo.jpg', ContentFile(response.content),
    )


def store_whatsapp_connection(tenant, phone_number_id, access_token, details):
    """Persist the connected number; returns the ConnectedPage."""
    display = details.get('display_phone_number', '')
    verified_name = details.get('verified_name', '')
    connection, _ = MetaConnection.objects.update_or_create(
        tenant=tenant,
        fb_user_id=f'wa-{phone_number_id}',
        defaults={'status': 'connected'},
    )
    connection.set_access_token(access_token)
    connection.save()
    page, _ = ConnectedPage.objects.update_or_create(
        page_id=phone_number_id,
        defaults={
            'tenant': tenant,
            'connection': connection,
            'name': verified_name or display or 'WhatsApp Business',
            'connection_type': 'whatsapp',
            'status': 'connected',
        },
    )
    page.set_access_token(access_token)
    page.save()
    return page


def whatsapp_owner_tenant(request):
    """Return (tenant, error_response) after the owner guard."""
    from vendor.team_views import is_owner

    tenant = get_request_tenant(request)
    if not tenant:
        return None, Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
    if not is_owner(request):
        return None, Response(
            {'error': 'Only the owner can connect accounts.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return tenant, None


class WhatsAppConnectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Connect a WhatsApp Business number from pasted credentials."""
        from socials.services.whatsapp_api import WhatsAppClient

        tenant, error = whatsapp_owner_tenant(request)
        if error:
            return error
        phone_number_id = str(request.data.get('phone_number_id') or '').strip()
        access_token = str(request.data.get('access_token') or '').strip()
        if not phone_number_id or not access_token:
            return Response(
                {'error': 'Both the phone number ID and access token are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            details = WhatsAppClient().fetch_phone_details(phone_number_id, access_token)
        except MetaGraphError as exc:
            logger.warning('WhatsApp connect validation failed: %s', exc)
            return Response(
                {'error': 'WhatsApp did not accept these credentials. Check the phone number ID and token.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        page = store_whatsapp_connection(tenant, phone_number_id, access_token, details)
        return Response(ConnectedPageSerializer(page).data, status=status.HTTP_201_CREATED)


class WhatsAppConnectConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Embedded-signup launch config, or 501 when not set up."""
        if not settings.META_APP_ID or not settings.WHATSAPP_EMBEDDED_CONFIG_ID:
            return Response(
                {'error': 'WhatsApp embedded signup is not configured.'},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )
        return Response({
            'app_id': settings.META_APP_ID,
            'config_id': settings.WHATSAPP_EMBEDDED_CONFIG_ID,
        })


def register_whatsapp_number(tenant, phone_number_id, token):
    """Best-effort Cloud API registration for a fresh number."""
    import secrets

    from socials.services.whatsapp_api import WhatsAppClient

    pin = f'{secrets.randbelow(1000000):06d}'
    try:
        WhatsAppClient().register_phone(phone_number_id, token, pin)
    except MetaGraphError as exc:
        logger.info('WhatsApp number registration skipped for %s: %s', phone_number_id, exc)
        return
    tenant.metadata['whatsappPin'] = pin
    tenant.save(update_fields=['metadata'])


class WhatsAppOAuthView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Finish embedded signup: exchange the code and store the number."""
        from socials.services.whatsapp_api import WhatsAppClient, exchange_business_code

        tenant, error = whatsapp_owner_tenant(request)
        if error:
            return error
        code = str(request.data.get('code') or '').strip()
        phone_number_id = str(request.data.get('phone_number_id') or '').strip()
        waba_id = str(request.data.get('waba_id') or '').strip()
        if not code or not phone_number_id or not waba_id:
            return Response(
                {'error': 'The signup popup did not return the number details. Try again, or connect manually.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        client = WhatsAppClient()
        try:
            access_token = exchange_business_code(code)
            details = client.fetch_phone_details(phone_number_id, access_token)
        except MetaGraphError as exc:
            logger.warning('WhatsApp embedded signup failed: %s', exc)
            return Response(
                {'error': 'Could not complete the WhatsApp connection. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        try:
            client.subscribe_waba(waba_id, access_token)
        except MetaGraphError as exc:
            logger.warning('WhatsApp webhook subscription failed for %s: %s', waba_id, exc)
        register_whatsapp_number(tenant, phone_number_id, access_token)
        page = store_whatsapp_connection(tenant, phone_number_id, access_token, details)
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
        if post.status not in ('draft', 'scheduled', 'failed'):
            return Response(
                {'error': 'Only drafts, scheduled, and failed posts can be deleted'},
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
