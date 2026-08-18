import requests
from django.conf import settings

GRAPH_BASE_URL = 'https://graph.facebook.com/v21.0'


class MetaGraphError(Exception):
    """Raised when the Graph API returns an error payload."""

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def parse_graph_response(response):
    """Return the JSON body or raise MetaGraphError on Graph errors."""
    payload = response.json()
    error = payload.get('error')
    if error or response.status_code >= 400:
        error = error or {}
        raise MetaGraphError(
            error.get('message', 'Unknown Graph API error'),
            code=error.get('code'),
        )
    return payload


class MetaGraphClient:
    """The only module that talks to graph.facebook.com."""

    def __init__(self, app_id=None, app_secret=None):
        self.app_id = app_id or settings.META_APP_ID
        self.app_secret = app_secret or settings.META_APP_SECRET

    def get(self, path, params):
        try:
            response = requests.get(f'{GRAPH_BASE_URL}{path}', params=params, timeout=15)
        except requests.exceptions.RequestException:
            raise MetaGraphError('Could not reach Facebook')
        return parse_graph_response(response)

    def exchange_code(self, code, redirect_uri):
        """Exchange an OAuth code for a short-lived user token."""
        payload = self.get('/oauth/access_token', {
            'client_id': self.app_id,
            'client_secret': self.app_secret,
            'redirect_uri': redirect_uri,
            'code': code,
        })
        return payload['access_token']

    def get_long_lived_token(self, short_token):
        """Upgrade a short-lived token; returns access_token and expires_in."""
        payload = self.get('/oauth/access_token', {
            'grant_type': 'fb_exchange_token',
            'client_id': self.app_id,
            'client_secret': self.app_secret,
            'fb_exchange_token': short_token,
        })
        return {
            'access_token': payload['access_token'],
            'expires_in': payload.get('expires_in'),
        }

    def get_user_profile(self, user_token):
        """Return the authorizing Facebook user's id and name."""
        return self.get('/me', {'access_token': user_token, 'fields': 'id,name'})

    def list_pages(self, user_token):
        """Return the user's Pages with their page access tokens."""
        payload = self.get('/me/accounts', {
            'access_token': user_token,
            'fields': 'id,name,access_token',
        })
        return payload.get('data', [])

    def subscribe_page(self, page_id, page_token):
        """Subscribe the app to the Page's webhook fields."""
        try:
            response = requests.post(
                f'{GRAPH_BASE_URL}/{page_id}/subscribed_apps',
                params={
                    'access_token': page_token,
                    'subscribed_fields': 'messages,messaging_postbacks,feed',
                },
                timeout=15,
            )
        except requests.exceptions.RequestException:
            raise MetaGraphError('Could not reach Facebook')
        return bool(parse_graph_response(response).get('success'))

    def unsubscribe_page(self, page_id, page_token):
        """Remove the app's webhook subscription from the Page."""
        try:
            response = requests.delete(
                f'{GRAPH_BASE_URL}/{page_id}/subscribed_apps',
                params={'access_token': page_token},
                timeout=15,
            )
        except requests.exceptions.RequestException:
            raise MetaGraphError('Could not reach Facebook')
        return bool(parse_graph_response(response).get('success'))

    def get_instagram_account(self, page_id, page_token):
        """Return the Page's linked IG professional account or None."""
        payload = self.get(f'/{page_id}', {
            'access_token': page_token,
            'fields': 'instagram_business_account',
        })
        account = payload.get('instagram_business_account')
        if not account:
            return None
        detail = self.get(f"/{account['id']}", {
            'access_token': page_token,
            'fields': 'id,username',
        })
        return {'id': detail['id'], 'username': detail.get('username', '')}
