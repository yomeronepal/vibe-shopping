import json
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
    try:
        payload = response.json()
    except ValueError:
        raise MetaGraphError('Invalid response from Facebook')
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
        """Return the user's Pages with their page access tokens.

        Falls back to the token's granular scopes when /me/accounts
        omits granted Pages, as happens for New Pages Experience and
        business-portfolio Pages.
        """
        payload = self.get('/me/accounts', {
            'access_token': user_token,
            'fields': 'id,name,access_token',
        })
        pages = payload.get('data', [])
        if pages:
            return pages
        return self.list_granted_pages(user_token)

    def get_granular_target_ids(self, user_token, scope):
        """Return the asset ids the token grants for one scope."""
        info = self.get('/debug_token', {
            'input_token': user_token,
            'access_token': f'{self.app_id}|{self.app_secret}',
        })
        for entry in info.get('data', {}).get('granular_scopes', []):
            if entry.get('scope') == scope:
                return entry.get('target_ids', [])
        return []

    def get_granted_instagram_account(self, user_token):
        """Resolve the granted IG professional account from granular scopes."""
        ids = self.get_granular_target_ids(user_token, 'instagram_basic')
        if not ids:
            return None
        detail = self.get(f'/{ids[0]}', {
            'access_token': user_token,
            'fields': 'id,username',
        })
        return {'id': detail['id'], 'username': detail.get('username', '')}

    def list_granted_pages(self, user_token):
        """Resolve granted Pages from the token's granular scopes."""
        page_ids = self.get_granular_target_ids(user_token, 'pages_show_list')
        pages = []
        for page_id in page_ids:
            detail = self.get(f'/{page_id}', {
                'access_token': user_token,
                'fields': 'id,name,access_token',
            })
            if detail.get('access_token'):
                pages.append({
                    'id': detail['id'],
                    'name': detail.get('name', ''),
                    'access_token': detail['access_token'],
                })
        return pages

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

    def post(self, path, params, files=None):
        try:
            response = requests.post(
                f'{GRAPH_BASE_URL}{path}', params=params, files=files, timeout=60
            )
        except requests.exceptions.RequestException:
            raise MetaGraphError('Could not reach Facebook')
        return parse_graph_response(response)

    def publish_page_photo(self, page_id, page_token, image_file, caption):
        """Publish a photo post to a Page; returns post id and URL."""
        payload = self.post(
            f'/{page_id}/photos',
            {'access_token': page_token, 'caption': caption},
            files={'source': image_file},
        )
        post_id = payload.get('post_id') or payload.get('id', '')
        return {'post_id': post_id, 'post_url': f'https://www.facebook.com/{post_id}'}

    def get_instagram_permalink(self, media_id, page_token):
        """Best-effort fetch of the published media's permalink."""
        try:
            detail = self.get(f'/{media_id}', {
                'access_token': page_token,
                'fields': 'permalink',
            })
            return detail.get('permalink', '')
        except MetaGraphError:
            return ''

    def publish_instagram_photo(self, ig_user_id, page_token, image_url, caption):
        """Two-step Instagram publish; returns media id and permalink."""
        creation = self.post(f'/{ig_user_id}/media', {
            'access_token': page_token,
            'image_url': image_url,
            'caption': caption,
        })
        published = self.post(f'/{ig_user_id}/media_publish', {
            'access_token': page_token,
            'creation_id': creation['id'],
        })
        media_id = published.get('id', '')
        return {
            'post_id': media_id,
            'post_url': self.get_instagram_permalink(media_id, page_token),
        }

    def send_message(self, page_id, page_token, recipient_id, text):
        """Send a DM reply via the Page; returns the platform message id."""
        payload = self.post(f'/{page_id}/messages', {
            'access_token': page_token,
            'recipient': json.dumps({'id': recipient_id}),
            'message': json.dumps({'text': text}),
            'messaging_type': 'RESPONSE',
        })
        return payload.get('message_id', '')

    def publish_page_story(self, page_id, page_token, image_file):
        """Publish a photo story to a Page; returns story id and URL."""
        photo = self.post(
            f'/{page_id}/photos',
            {'access_token': page_token, 'published': 'false'},
            files={'source': image_file},
        )
        story = self.post(f'/{page_id}/photo_stories', {
            'access_token': page_token,
            'photo_id': photo.get('id', ''),
        })
        post_id = story.get('post_id', '')
        return {'post_id': post_id, 'post_url': f'https://www.facebook.com/{post_id}' if post_id else ''}

    def publish_instagram_story(self, ig_user_id, page_token, image_url):
        """Publish an Instagram story; returns media id and permalink."""
        creation = self.post(f'/{ig_user_id}/media', {
            'access_token': page_token,
            'media_type': 'STORIES',
            'image_url': image_url,
        })
        published = self.post(f'/{ig_user_id}/media_publish', {
            'access_token': page_token,
            'creation_id': creation['id'],
        })
        media_id = published.get('id', '')
        return {
            'post_id': media_id,
            'post_url': self.get_instagram_permalink(media_id, page_token),
        }
