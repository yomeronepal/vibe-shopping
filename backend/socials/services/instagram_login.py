import logging
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core import signing

from socials.services.meta_graph import (
    INSTAGRAM_GRAPH_BASE_URL,
    MetaGraphClient,
    MetaGraphError,
    parse_graph_response,
)

logger = logging.getLogger(__name__)

IG_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
IG_STATE_SALT = 'instagram-oauth-state'
IG_SCOPES = ','.join([
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish',
])


def instagram_login_configured():
    """Whether the Instagram Login app credentials are set."""
    return bool(settings.INSTAGRAM_LOGIN_APP_ID and settings.INSTAGRAM_LOGIN_APP_SECRET)


def build_instagram_connect_url(tenant):
    """Build the Instagram Business Login dialog URL with signed state."""
    state = signing.dumps({'tenant_id': tenant.id}, salt=IG_STATE_SALT)
    params = urlencode({
        'client_id': settings.INSTAGRAM_LOGIN_APP_ID,
        'redirect_uri': settings.INSTAGRAM_LOGIN_REDIRECT_URI,
        'scope': IG_SCOPES,
        'response_type': 'code',
        'state': state,
    })
    return f'{IG_AUTHORIZE_URL}?{params}'


def validate_instagram_state(state, tenant, max_age=600):
    """Return True when the signed state belongs to this tenant."""
    try:
        data = signing.loads(state, salt=IG_STATE_SALT, max_age=max_age)
    except signing.BadSignature:
        return False
    return data.get('tenant_id') == tenant.id


def instagram_root_get(endpoint, params):
    """GET an unversioned graph.instagram.com endpoint."""
    try:
        response = requests.get(
            f'https://graph.instagram.com/{endpoint}', params=params, timeout=15,
        )
    except requests.exceptions.RequestException:
        raise MetaGraphError('Could not reach Instagram')
    return parse_graph_response(response)


def exchange_instagram_code(code):
    """Exchange the OAuth code for a long-lived Instagram token.

    Returns {'access_token', 'expires_in', 'user_id'}.
    """
    try:
        response = requests.post(IG_TOKEN_URL, data={
            'client_id': settings.INSTAGRAM_LOGIN_APP_ID,
            'client_secret': settings.INSTAGRAM_LOGIN_APP_SECRET,
            'grant_type': 'authorization_code',
            'redirect_uri': settings.INSTAGRAM_LOGIN_REDIRECT_URI,
            'code': code,
        }, timeout=15)
    except requests.exceptions.RequestException:
        raise MetaGraphError('Could not reach Instagram')
    payload = parse_graph_response(response)
    short_token = payload['access_token']
    user_id = str(payload.get('user_id', ''))
    long_lived = instagram_root_get('access_token', {
        'grant_type': 'ig_exchange_token',
        'client_secret': settings.INSTAGRAM_LOGIN_APP_SECRET,
        'access_token': short_token,
    })
    return {
        'access_token': long_lived['access_token'],
        'expires_in': long_lived.get('expires_in'),
        'user_id': user_id,
    }


def fetch_instagram_profile(access_token):
    """Return the connected professional account's id, username, and name."""
    client = MetaGraphClient(base_url=INSTAGRAM_GRAPH_BASE_URL)
    payload = client.get('/me', {
        'access_token': access_token,
        'fields': 'user_id,username,name,profile_picture_url',
    })
    return {
        'id': str(payload.get('user_id') or payload.get('id', '')),
        'username': payload.get('username', ''),
        'name': payload.get('name') or payload.get('username', ''),
    }


def subscribe_instagram_webhooks(ig_user_id, access_token):
    """Subscribe the app to the account's message and comment webhooks."""
    client = MetaGraphClient(base_url=INSTAGRAM_GRAPH_BASE_URL)
    try:
        client.post(f'/{ig_user_id}/subscribed_apps', {
            'access_token': access_token,
            'subscribed_fields': 'messages,comments',
        })
        return True
    except MetaGraphError as exc:
        logger.warning('Instagram webhook subscription failed: %s', exc)
        return False


def refresh_instagram_token(access_token):
    """Extend a long-lived Instagram token; returns the new token or None."""
    try:
        payload = instagram_root_get('refresh_access_token', {
            'grant_type': 'ig_refresh_token',
            'access_token': access_token,
        })
        return payload.get('access_token')
    except MetaGraphError as exc:
        logger.warning('Instagram token refresh failed: %s', exc)
        return None
