import hashlib
import hmac
import json
import logging
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.http import HttpResponse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from socials.models import MetaConnection, ConnectedPage, WebhookEvent
from socials.serializers import ConnectedPageSerializer
from socials.services.meta_graph import MetaGraphClient, MetaGraphError
from socials.tasks import process_webhook_event

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
