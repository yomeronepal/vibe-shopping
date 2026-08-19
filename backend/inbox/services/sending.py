import logging
import uuid

from django.utils import timezone

from inbox.models import Conversation, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

WINDOW_CLOSED_ERROR = 'The 24-hour reply window for this conversation has closed.'


class ConversationSendError(Exception):
    """Raised when a message cannot be delivered to the customer."""

    def __init__(self, message, status_code):
        super().__init__(message)
        self.status_code = status_code


def push_safely(tenant_id, event_type, payload):
    """Push a realtime event; log and continue on infrastructure failure."""
    try:
        push_inbox_event(tenant_id, event_type, payload)
    except Exception:
        logger.warning('Inbox push failed for tenant %s', tenant_id, exc_info=True)


def resolve_reply_route(conversation):
    """Decide how the next reply reaches the customer.

    A comment that has not been answered yet is answered privately via
    Meta's one-shot private reply; everything else goes as a normal DM.
    """
    latest_in = (
        conversation.messages.filter(direction='in')
        .order_by('-sent_at', '-id')
        .first()
    )
    if latest_in and latest_in.source == 'comment':
        answered = conversation.messages.filter(
            direction='out', sent_at__gte=latest_in.sent_at
        ).exists()
        if not answered:
            return 'comment', latest_in.platform_message_id
    return 'dm', conversation.customer.platform_user_id


def deliver_via_meta(conversation, text):
    """Send the text through Meta; return the platform message id."""
    client = MetaGraphClient()
    page = conversation.page
    route, target = resolve_reply_route(conversation)
    try:
        if route == 'comment':
            sender_id = page.instagram_account_id if conversation.platform == 'instagram' else page.page_id
            return client.send_private_reply(sender_id, page.get_access_token(), target, text)
        return client.send_message(
            page.page_id,
            page.get_access_token(),
            target,
            text,
        )
    except MetaGraphError as exc:
        if exc.code == 10:
            raise ConversationSendError(WINDOW_CLOSED_ERROR, 400)
        logger.warning('Inbox send failed: %s', exc)
        raise ConversationSendError('Could not send the message. Please try again.', 502)


def build_product_page_url(product):
    """Return the public product page link, or empty when not configured."""
    from django.conf import settings

    base = (getattr(settings, 'PUBLIC_APP_BASE_URL', '') or '').rstrip('/')
    return f'{base}/product/{product.id}' if base else ''


def build_product_card(product):
    """Render one generic-template element for a product."""
    from inbox.services.assistant import format_price
    from socials.services.publisher import build_public_image_url

    subtitle = f'Rs. {format_price(product.price)}'
    if product.product_code:
        subtitle += f' · SKU {product.product_code}'
    element = {'title': product.name[:80], 'subtitle': subtitle[:80]}
    image_field = product.processed_image or product.image
    if image_field:
        image_url = build_public_image_url(image_field)
        if image_url:
            element['image_url'] = image_url
    link = build_product_page_url(product)
    if link:
        element['default_action'] = {'type': 'web_url', 'url': link}
        element['buttons'] = [{'type': 'web_url', 'url': link, 'title': 'View product'}]
    return element


def store_card_message(conversation, products, message_id):
    """Record the card send in the thread and push it live."""
    names = ', '.join(product.name[:40] for product in products)
    record = Message.objects.create(
        conversation=conversation,
        direction='out',
        text=f'[Sent product cards: {names}]',
        platform_message_id=message_id or f'local-{uuid.uuid4().hex}',
        sent_by_ai=True,
        sent_at=timezone.now(),
        metadata={'type': 'product_cards', 'product_ids': [product.id for product in products]},
    )
    Conversation.objects.filter(pk=conversation.pk).update(
        last_message_at=record.sent_at,
        last_message_preview=record.text[:120],
    )
    conversation.refresh_from_db()
    push_safely(conversation.tenant_id, 'inbox.message', {
        'conversation': ConversationSerializer(conversation).data,
        'message': MessageSerializer(record).data,
    })
    return record


def send_product_cards(conversation, products):
    """Send photo cards for products after a reply; best-effort, DM only.

    Comment-origin threads whose one-shot private reply was just used
    cannot carry attachments, so those are skipped silently.
    """
    products = [product for product in products if product][:3]
    route, target = resolve_reply_route(conversation)
    if not products or route != 'dm':
        return None
    elements = [build_product_card(product) for product in products]
    page = conversation.page
    try:
        message_id = MetaGraphClient().send_generic_template(
            page.page_id, page.get_access_token(), target, elements,
        )
    except MetaGraphError as exc:
        logger.info('Product card send skipped for conversation %s: %s', conversation.id, exc)
        return None
    return store_card_message(conversation, products, message_id)


def send_conversation_text(conversation, text, sent_by_ai=False):
    """Send text to a conversation's customer, store it, and push updates.

    AI-sent replies keep the unread counter so the vendor still notices
    conversations the bot handled.

    Returns the stored Message.

    Raises:
        ConversationSendError: when Meta rejects or cannot be reached.
    """
    message_id = deliver_via_meta(conversation, text)
    record = Message.objects.create(
        conversation=conversation,
        direction='out',
        text=text,
        platform_message_id=message_id or f'local-{uuid.uuid4().hex}',
        sent_by_ai=sent_by_ai,
        sent_at=timezone.now(),
    )
    update_fields = {
        'status': 'waiting_customer',
        'last_message_at': record.sent_at,
        'last_message_preview': text[:120],
    }
    if not sent_by_ai:
        update_fields['unread_count'] = 0
    Conversation.objects.filter(pk=conversation.pk).update(**update_fields)
    conversation.refresh_from_db()
    push_safely(conversation.tenant_id, 'inbox.message', {
        'conversation': ConversationSerializer(conversation).data,
        'message': MessageSerializer(record).data,
    })
    return record
