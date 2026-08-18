import logging
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from socials.models import MetaConnection
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

OAUTH_STATE_SALT = 'meta-oauth-state'
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
