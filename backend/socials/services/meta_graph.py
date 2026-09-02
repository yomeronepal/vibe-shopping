import json
import requests
from django.conf import settings

GRAPH_BASE_URL = 'https://graph.facebook.com/v21.0'
INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com/v21.0'


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


def graph_client_for(page):
    """Return a client on the right Graph host for this connection."""
    if getattr(page, 'connection_type', '') == 'instagram_direct':
        return MetaGraphClient(base_url=INSTAGRAM_GRAPH_BASE_URL)
    return MetaGraphClient()


class MetaGraphClient:
    """The only module that talks to graph.facebook.com."""

    def __init__(self, app_id=None, app_secret=None, base_url=None):
        self.app_id = app_id or settings.META_APP_ID
        self.app_secret = app_secret or settings.META_APP_SECRET
        self.base_url = base_url or GRAPH_BASE_URL

    def get(self, path, params):
        try:
            response = requests.get(f'{self.base_url}{path}', params=params, timeout=15)
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
                f'{self.base_url}/{page_id}/subscribed_apps',
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
                f'{self.base_url}/{page_id}/subscribed_apps',
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
                f'{self.base_url}{path}', params=params, files=files, timeout=60
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

    def list_ad_accounts(self, user_token):
        """Return the user's ad accounts with status and currency."""
        payload = self.get('/me/adaccounts', {
            'access_token': user_token,
            'fields': 'id,account_id,name,currency,account_status',
        })
        return payload.get('data', [])

    def create_boost_campaign(self, ad_account_id, user_token, name):
        """Create an engagement campaign shell; returns the campaign id."""
        payload = self.post(f'/{ad_account_id}/campaigns', {
            'access_token': user_token,
            'name': name,
            'objective': 'OUTCOME_ENGAGEMENT',
            'status': 'ACTIVE',
            'special_ad_categories': json.dumps([]),
        })
        return payload.get('id', '')

    def create_boost_adset(self, ad_account_id, user_token, campaign_id, page_id,
                           name, daily_budget_minor, targeting, end_time):
        """Create the budgeted, targeted ad set aimed at Messenger chats."""
        payload = self.post(f'/{ad_account_id}/adsets', {
            'access_token': user_token,
            'name': name,
            'campaign_id': campaign_id,
            'daily_budget': daily_budget_minor,
            'billing_event': 'IMPRESSIONS',
            'optimization_goal': 'CONVERSATIONS',
            'destination_type': 'MESSENGER',
            'promoted_object': json.dumps({'page_id': page_id}),
            'targeting': json.dumps(targeting),
            'end_time': end_time,
            'status': 'ACTIVE',
        })
        return payload.get('id', '')

    def create_boost_ad(self, ad_account_id, user_token, adset_id, name, story_id):
        """Create the ad from the existing page post; returns the ad id."""
        payload = self.post(f'/{ad_account_id}/ads', {
            'access_token': user_token,
            'name': name,
            'adset_id': adset_id,
            'creative': json.dumps({'object_story_id': story_id}),
            'status': 'ACTIVE',
        })
        return payload.get('id', '')

    def get_campaign_insights(self, campaign_id, user_token):
        """Return spend, reach, and action counts for a campaign."""
        payload = self.get(f'/{campaign_id}/insights', {
            'access_token': user_token,
            'fields': 'spend,impressions,reach,actions',
        })
        rows = payload.get('data', [])
        return rows[0] if rows else {}

    def set_campaign_status(self, campaign_id, user_token, status_value):
        """Pause or resume a campaign."""
        return self.post(f'/{campaign_id}', {
            'access_token': user_token,
            'status': status_value,
        })

    def send_message(self, page_id, page_token, recipient_id, text, quick_replies=None):
        """Send a DM reply via the Page; returns the platform message id.

        quick_replies is an optional list of short strings shown as
        tappable chips under the message.
        """
        message = {'text': text}
        if quick_replies:
            message['quick_replies'] = [
                {'content_type': 'text', 'title': title[:20], 'payload': title[:20]}
                for title in quick_replies[:13]
            ]
        payload = self.post(f'/{page_id}/messages', {
            'access_token': page_token,
            'recipient': json.dumps({'id': recipient_id}),
            'message': json.dumps(message),
            'messaging_type': 'RESPONSE',
        })
        return payload.get('message_id', '')

    def send_sender_action(self, page_id, page_token, recipient_id, action):
        """Send mark_seen / typing_on / typing_off for the conversation."""
        return self.post(f'/{page_id}/messages', {
            'access_token': page_token,
            'recipient': json.dumps({'id': recipient_id}),
            'sender_action': action,
        })

    def set_messenger_profile(self, page_id, page_token, profile):
        """Configure the page's greeting, get-started, and menu."""
        return self.post(f'/{page_id}/messenger_profile', {
            'access_token': page_token,
            **{key: json.dumps(value) for key, value in profile.items()},
        })

    def send_image_attachment(self, page_id, page_token, recipient_id, image_url):
        """Send a native photo DM Meta re-hosts; returns the message id."""
        payload = self.post(f'/{page_id}/messages', {
            'access_token': page_token,
            'recipient': json.dumps({'id': recipient_id}),
            'message': json.dumps({
                'attachment': {
                    'type': 'image',
                    'payload': {'url': image_url, 'is_reusable': True},
                },
            }),
            'messaging_type': 'RESPONSE',
        })
        return payload.get('message_id', '')

    def send_generic_template(self, page_id, page_token, recipient_id, elements):
        """Send a product card carousel DM; returns the platform message id."""
        payload = self.post(f'/{page_id}/messages', {
            'access_token': page_token,
            'recipient': json.dumps({'id': recipient_id}),
            'message': json.dumps({
                'attachment': {
                    'type': 'template',
                    'payload': {'template_type': 'generic', 'elements': elements},
                },
            }),
            'messaging_type': 'RESPONSE',
        })
        return payload.get('message_id', '')

    def send_private_reply(self, sender_id, page_token, comment_id, text):
        """Privately message the author of a comment; returns the message id.

        Works for both Facebook Pages (sender_id = page id) and
        Instagram professional accounts (sender_id = IG account id).
        Meta allows one private reply per comment, within 7 days.
        """
        payload = self.post(f'/{sender_id}/messages', {
            'access_token': page_token,
            'recipient': json.dumps({'comment_id': comment_id}),
            'message': json.dumps({'text': text}),
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

    def update_page_post_caption(self, post_id, page_token, message):
        """Update the caption of an existing Page post."""
        payload = self.post(f'/{post_id}', {
            'access_token': page_token,
            'message': message,
        })
        return bool(payload.get('success'))

    def get_post_engagement(self, post_id, page_token):
        """Return likes, comments, and shares for a Page post."""
        payload = self.get(f'/{post_id}', {
            'access_token': page_token,
            'fields': 'reactions.summary(true),comments.summary(true),shares',
        })
        return {
            'likes': (payload.get('reactions') or {}).get('summary', {}).get('total_count', 0),
            'comments': (payload.get('comments') or {}).get('summary', {}).get('total_count', 0),
            'shares': (payload.get('shares') or {}).get('count', 0),
        }

    def get_instagram_media_engagement(self, media_id, page_token):
        """Return likes and comments for an IG media object."""
        payload = self.get(f'/{media_id}', {
            'access_token': page_token,
            'fields': 'like_count,comments_count',
        })
        return {
            'likes': payload.get('like_count', 0),
            'comments': payload.get('comments_count', 0),
            'shares': 0,
        }
