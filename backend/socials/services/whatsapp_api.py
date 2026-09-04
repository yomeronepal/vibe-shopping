import logging

import requests

from socials.services.meta_graph import GRAPH_BASE_URL, MetaGraphError, parse_graph_response

logger = logging.getLogger(__name__)

BUTTON_TITLE_MAX = 20
BUTTON_BODY_MAX = 1024
MAX_BUTTONS = 3


def buttons_fit(text, quick_replies):
    """Whether the options can be sent as interactive reply buttons."""
    if not quick_replies or len(quick_replies) > MAX_BUTTONS:
        return False
    if len(text) > BUTTON_BODY_MAX:
        return False
    return all(len(label) <= BUTTON_TITLE_MAX for label in quick_replies)


def append_numbered_options(text, quick_replies):
    """Fall back to numbered choices inside the message body."""
    lines = [f'{index}. {label}' for index, label in enumerate(quick_replies, start=1)]
    return text + '\n\n' + '\n'.join(lines)


class WhatsAppClient:
    """The only module that talks to the WhatsApp Cloud API."""

    def __init__(self, base_url=None):
        self.base_url = base_url or GRAPH_BASE_URL

    def get(self, path, params):
        try:
            response = requests.get(f'{self.base_url}{path}', params=params, timeout=15)
        except requests.exceptions.RequestException:
            raise MetaGraphError('Could not reach WhatsApp')
        return parse_graph_response(response)

    def post_message(self, phone_number_id, token, payload):
        """Send one message payload; returns the WhatsApp message id."""
        body = {'messaging_product': 'whatsapp', **payload}
        try:
            response = requests.post(
                f'{self.base_url}/{phone_number_id}/messages',
                params={'access_token': token},
                json=body,
                timeout=15,
            )
        except requests.exceptions.RequestException:
            raise MetaGraphError('Could not reach WhatsApp')
        data = parse_graph_response(response)
        messages = data.get('messages') or [{}]
        return messages[0].get('id', '')

    def send_message(self, page_id, page_token, recipient_id, text, quick_replies=None):
        """Send text, upgrading short option lists to reply buttons."""
        quick_replies = quick_replies or []
        if buttons_fit(text, quick_replies):
            return self.post_message(page_id, page_token, {
                'to': recipient_id,
                'type': 'interactive',
                'interactive': {
                    'type': 'button',
                    'body': {'text': text},
                    'action': {'buttons': [
                        {'type': 'reply', 'reply': {'id': f'option-{index}', 'title': label}}
                        for index, label in enumerate(quick_replies, start=1)
                    ]},
                },
            })
        if quick_replies:
            text = append_numbered_options(text, quick_replies)
        return self.post_message(page_id, page_token, {
            'to': recipient_id,
            'type': 'text',
            'text': {'body': text, 'preview_url': True},
        })

    def send_image_attachment(self, page_id, page_token, recipient_id, image_url):
        """Send an image by public link."""
        return self.post_message(page_id, page_token, {
            'to': recipient_id,
            'type': 'image',
            'image': {'link': image_url},
        })

    def send_sender_action(self, page_id, page_token, recipient_id, action):
        """Messenger-style sender actions have no direct WhatsApp form."""
        return None

    def mark_read_typing(self, phone_number_id, token, message_id):
        """Mark an inbound message read and show the typing indicator."""
        body = {
            'messaging_product': 'whatsapp',
            'status': 'read',
            'message_id': message_id,
            'typing_indicator': {'type': 'text'},
        }
        try:
            response = requests.post(
                f'{self.base_url}/{phone_number_id}/messages',
                params={'access_token': token},
                json=body,
                timeout=15,
            )
        except requests.exceptions.RequestException:
            raise MetaGraphError('Could not reach WhatsApp')
        return parse_graph_response(response)

    def fetch_phone_details(self, phone_number_id, token):
        """Validate credentials and return the number's display details."""
        return self.get(f'/{phone_number_id}', {
            'access_token': token,
            'fields': 'display_phone_number,verified_name',
        })

    def fetch_media_bytes(self, media_id, token):
        """Download inbound media; returns (bytes, mime_type)."""
        detail = self.get(f'/{media_id}', {'access_token': token})
        url = detail.get('url', '')
        if not url:
            raise MetaGraphError('Media URL missing')
        try:
            response = requests.get(
                url, headers={'Authorization': f'Bearer {token}'}, timeout=30,
            )
        except requests.exceptions.RequestException:
            raise MetaGraphError('Could not download WhatsApp media')
        if response.status_code >= 400:
            raise MetaGraphError('WhatsApp media download failed')
        return response.content, detail.get('mime_type', 'image/jpeg')
