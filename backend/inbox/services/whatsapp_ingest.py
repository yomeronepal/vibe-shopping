import logging

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from socials.models import ConnectedPage
from socials.services.meta_graph import MetaGraphError
from socials.services.whatsapp_api import WhatsAppClient

logger = logging.getLogger(__name__)

MIME_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}

SKIPPED_TYPES = ('reaction', 'unsupported', 'system')

PLACEHOLDER_TEXTS = {
    'audio': '[Voice message]',
    'video': '[Video]',
    'document': '[Document]',
    'sticker': '[Sticker]',
    'location': '[Location]',
    'contacts': '[Contact card]',
}


def resolve_whatsapp_page(value):
    """Map a webhook value to the connected WhatsApp number, or None."""
    phone_number_id = (value.get('metadata') or {}).get('phone_number_id', '')
    if not phone_number_id:
        return None
    return ConnectedPage.objects.filter(
        page_id=phone_number_id, connection_type='whatsapp', status='connected',
    ).first()


def public_media_url(name):
    """A customer-viewable URL for a stored media file."""
    url = default_storage.url(name)
    base = (getattr(settings, 'PUBLIC_MEDIA_BASE_URL', '') or '').rstrip('/')
    return f'{base}{url}' if base and url.startswith('/') else url


def store_inbound_media(page, media_id):
    """Download and store inbound media; returns its URL or ''."""
    try:
        content, mime_type = WhatsAppClient().fetch_media_bytes(
            media_id, page.get_access_token(),
        )
    except MetaGraphError as exc:
        logger.info('WhatsApp media fetch failed for %s: %s', media_id, exc)
        return ''
    extension = MIME_EXTENSIONS.get(mime_type, 'bin')
    name = default_storage.save(
        f'whatsapp_media/{media_id}.{extension}', ContentFile(content),
    )
    return public_media_url(name)


def extract_message_content(page, message):
    """Return (text, attachments) for one WhatsApp message, or None to skip."""
    message_type = message.get('type', '')
    if message_type in SKIPPED_TYPES:
        return None
    if message_type == 'text':
        return (message.get('text') or {}).get('body', ''), []
    if message_type == 'interactive':
        interactive = message.get('interactive') or {}
        reply = interactive.get('button_reply') or interactive.get('list_reply') or {}
        title = reply.get('title', '')
        return (title, []) if title else None
    if message_type == 'button':
        title = (message.get('button') or {}).get('text', '')
        return (title, []) if title else None
    if message_type == 'image':
        image = message.get('image') or {}
        url = store_inbound_media(page, image.get('id', ''))
        attachments = [{'type': 'image', 'url': url}] if url else []
        return image.get('caption', '') or '', attachments
    placeholder = PLACEHOLDER_TEXTS.get(message_type)
    return (placeholder, []) if placeholder else None


def as_messaging_event(page, message):
    """Translate a WhatsApp message into the Messenger event shape."""
    content = extract_message_content(page, message)
    if content is None:
        return None
    text, attachments = content
    if not text and not attachments:
        return None
    translated = {'mid': message.get('id', ''), 'text': text}
    if attachments:
        translated['attachments'] = [
            {'type': item['type'], 'payload': {'url': item['url']}}
            for item in attachments
        ]
    context_id = (message.get('context') or {}).get('id', '')
    if context_id:
        translated['reply_to'] = {'mid': context_id}
    timestamp = message.get('timestamp')
    return {
        'sender': {'id': message.get('from', '')},
        'recipient': {'id': page.page_id},
        'timestamp': int(timestamp) * 1000 if timestamp else None,
        'message': translated,
    }


def apply_contact_details(record, contacts):
    """Fill the customer's name and phone from webhook contact info."""
    customer = record.conversation.customer
    wa_id = customer.platform_user_id
    updates = []
    if not customer.name and contacts.get(wa_id):
        customer.name = contacts[wa_id]
        updates.append('name')
    if not customer.phone:
        customer.phone = f'+{wa_id}'
        updates.append('phone')
    if updates:
        customer.save(update_fields=updates)


def ingest_whatsapp_entry(entry):
    """Store the messages in one WhatsApp webhook entry; returns the count."""
    from inbox.services.ingest import store_message

    created = 0
    for change in entry.get('changes', []) or []:
        if not isinstance(change, dict) or change.get('field') != 'messages':
            continue
        value = change.get('value') or {}
        page = resolve_whatsapp_page(value)
        if not page:
            continue
        contacts = {
            contact.get('wa_id', ''): (contact.get('profile') or {}).get('name', '')
            for contact in value.get('contacts', []) or []
        }
        for message in value.get('messages', []) or []:
            try:
                event = as_messaging_event(page, message)
                if not event:
                    continue
                record = store_message(page, 'whatsapp', event)
            except (KeyError, TypeError, ValueError, AttributeError):
                logger.exception('Failed to ingest WhatsApp message')
                continue
            if record:
                apply_contact_details(record, contacts)
                created += 1
    return created
