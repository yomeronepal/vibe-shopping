import logging
from datetime import datetime, timezone as dt_timezone

from inbox.models import Conversation, Customer, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from socials.models import ConnectedPage
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

PROFILE_FIELDS = 'name,profile_pic'


def fetch_customer_profile(page, user_id):
    """Best-effort Graph profile lookup; blank fields on failure."""
    client = MetaGraphClient()
    try:
        detail = client.get(f'/{user_id}', {
            'access_token': page.get_access_token(),
            'fields': PROFILE_FIELDS,
        })
        return {
            'name': detail.get('name') or detail.get('username', ''),
            'profile_pic_url': detail.get('profile_pic', ''),
        }
    except MetaGraphError as exc:
        logger.info('Customer profile fetch failed for %s: %s', user_id, exc)
        return {'name': '', 'profile_pic_url': ''}


def resolve_page(object_type, entry_id):
    """Map a webhook entry id to a connected page, or None."""
    if object_type == 'instagram':
        return ConnectedPage.objects.filter(
            instagram_account_id=entry_id, status='connected'
        ).first()
    return ConnectedPage.objects.filter(page_id=entry_id, status='connected').first()


def normalize_attachments(message):
    """Flatten Meta attachment payloads to [{type, url}]."""
    normalized = []
    for attachment in message.get('attachments', []) or []:
        url = (attachment.get('payload') or {}).get('url', '')
        normalized.append({'type': attachment.get('type', 'file'), 'url': url})
    return normalized


def build_preview(text, attachments):
    """Return the conversation list preview for a message."""
    if text:
        return text[:120]
    if attachments:
        return '[attachment]'
    return ''


def apply_inbound(conversation):
    conversation.unread_count += 1
    conversation.status = 'waiting_business'


def apply_outbound(conversation):
    conversation.status = 'waiting_customer'


def store_message(page, platform, messaging_event):
    """Persist one messaging event; returns the Message or None."""
    message = messaging_event.get('message') or {}
    mid = message.get('mid')
    if not mid:
        return None
    page_identity = page.instagram_account_id if platform == 'instagram' else page.page_id
    is_echo = bool(message.get('is_echo'))
    sender_id = (messaging_event.get('sender') or {}).get('id', '')
    recipient_id = (messaging_event.get('recipient') or {}).get('id', '')
    direction = 'out' if is_echo or sender_id == page_identity else 'in'
    customer_id = recipient_id if direction == 'out' else sender_id
    if not customer_id:
        return None
    customer, created = Customer.objects.get_or_create(
        tenant=page.tenant, platform=platform, platform_user_id=customer_id
    )
    if created:
        profile = fetch_customer_profile(page, customer_id)
        customer.name = profile['name']
        customer.profile_pic_url = profile['profile_pic_url']
        customer.save()
    conversation, _ = Conversation.objects.get_or_create(
        page=page, customer=customer,
        defaults={'tenant': page.tenant, 'platform': platform},
    )
    attachments = normalize_attachments(message)
    sent_at = datetime.fromtimestamp(
        messaging_event.get('timestamp', 0) / 1000, tz=dt_timezone.utc
    )
    record, created = Message.objects.get_or_create(
        platform_message_id=mid,
        defaults={
            'conversation': conversation,
            'direction': direction,
            'text': message.get('text', '') or '',
            'attachments': attachments,
            'sent_at': sent_at,
        },
    )
    if not created:
        return None
    if direction == 'in':
        apply_inbound(conversation)
    else:
        apply_outbound(conversation)
    conversation.last_message_at = sent_at
    conversation.last_message_preview = build_preview(record.text, attachments)
    conversation.save()
    push_inbox_event(page.tenant_id, 'inbox.message', {
        'conversation': ConversationSerializer(conversation).data,
        'message': MessageSerializer(record).data,
    })
    return record


def ingest_webhook_event(event):
    """Parse a stored webhook event into inbox rows; returns messages created."""
    payload = event.payload or {}
    object_type = payload.get('object', '')
    if object_type not in ('page', 'instagram'):
        return 0
    platform = 'instagram' if object_type == 'instagram' else 'facebook'
    created_count = 0
    for entry in payload.get('entry', []) or []:
        page = resolve_page(object_type, str(entry.get('id', '')))
        if not page:
            continue
        for messaging_event in entry.get('messaging', []) or []:
            try:
                record = store_message(page, platform, messaging_event)
            except Exception:
                logger.exception('Failed to ingest messaging event %s', event.id)
                continue
            if record:
                created_count += 1
    return created_count
