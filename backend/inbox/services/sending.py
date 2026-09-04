import logging
import uuid

from django.utils import timezone

from inbox.models import Conversation, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from socials.services.meta_graph import INSTAGRAM_GRAPH_BASE_URL, MetaGraphClient, MetaGraphError
from socials.services.whatsapp_api import WhatsAppClient

logger = logging.getLogger(__name__)

WINDOW_CLOSED_ERROR = 'The 24-hour reply window for this conversation has closed.'


def client_for(page):
    """Return a Graph client on the right host for this connection."""
    connection_type = getattr(page, 'connection_type', '')
    if connection_type == 'whatsapp':
        return WhatsAppClient()
    if connection_type == 'instagram_direct':
        return MetaGraphClient(base_url=INSTAGRAM_GRAPH_BASE_URL)
    return MetaGraphClient()


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


def latest_inbound_mid(conversation):
    """The platform id of the newest customer message, or ''."""
    latest = (
        conversation.messages.filter(direction='in')
        .order_by('-sent_at', '-id')
        .first()
    )
    return latest.platform_message_id if latest else ''


def show_whatsapp_read_and_typing(conversation, page):
    """WhatsApp marks read and types against a specific message id."""
    mid = latest_inbound_mid(conversation)
    if not mid:
        return
    try:
        WhatsAppClient().mark_read_typing(page.page_id, page.get_access_token(), mid)
    except MetaGraphError as exc:
        logger.info('WhatsApp typing skipped for conversation %s: %s', conversation.id, exc)


def show_read_and_typing(conversation):
    """Mark the thread seen and show typing dots; never raises."""
    page = conversation.page
    if getattr(page, 'connection_type', '') == 'whatsapp':
        show_whatsapp_read_and_typing(conversation, page)
        return
    client = client_for(page)
    try:
        for action in ('mark_seen', 'typing_on'):
            client.send_sender_action(
                page.page_id, page.get_access_token(),
                conversation.customer.platform_user_id, action,
            )
    except MetaGraphError as exc:
        logger.info('Sender action skipped for conversation %s: %s', conversation.id, exc)


def deliver_via_meta(conversation, text, quick_replies=None):
    """Send the text through Meta; return the platform message id."""
    page = conversation.page
    client = client_for(page)
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
            quick_replies=quick_replies,
        )
    except MetaGraphError as exc:
        if exc.code in (10, 131047):
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


def store_card_message(conversation, products, message_id, photo_mids=None):
    """Record the card send in the thread and push it live."""
    names = ', '.join(product.name[:40] for product in products)
    metadata = {'type': 'product_cards', 'product_ids': [product.id for product in products]}
    if photo_mids:
        metadata['photo_mids'] = photo_mids
    record = Message.objects.create(
        conversation=conversation,
        direction='out',
        text=f'[Sent product photos: {names}]',
        platform_message_id=message_id or f'local-{uuid.uuid4().hex}',
        sent_by_ai=True,
        sent_at=timezone.now(),
        metadata=metadata,
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


def collect_card_images(products):
    """Pair each product with its labeled photo URL, skipping imageless ones."""
    from inbox.services.card_images import labeled_card_url

    pairs = []
    for product in products:
        image_url = labeled_card_url(product)
        if image_url:
            pairs.append((product, image_url))
    return pairs


def send_card_carousel(conversation, page, target, products):
    """Send rich template cards with tappable product links."""
    elements = [build_product_card(product) for product in products]
    try:
        message_id = client_for(page).send_generic_template(
            page.page_id, page.get_access_token(), target, elements,
        )
    except MetaGraphError as exc:
        logger.info('Product card send skipped for conversation %s: %s', conversation.id, exc)
        return None
    return store_card_message(conversation, products, message_id)


def send_card_photos(conversation, page, target, products):
    """Send labeled photo messages, remembering which mid shows which product."""
    client = client_for(page)
    message_id = ''
    sent = []
    photo_mids = {}
    for product, image_url in collect_card_images(products):
        try:
            mid = client.send_image_attachment(
                page.page_id, page.get_access_token(), target, image_url,
            )
        except MetaGraphError as exc:
            logger.info('Product photo send skipped for conversation %s: %s', conversation.id, exc)
            continue
        message_id = mid or message_id
        sent.append(product)
        if mid:
            photo_mids[mid] = {
                'id': product.id,
                'name': product.name[:60],
                'sku': product.product_code or '',
            }
    if not sent:
        return None
    return store_card_message(conversation, sent, message_id, photo_mids)


def send_product_cards(conversation, products):
    """Send product visuals after a reply; best-effort, DM only.

    With a public app URL configured, products go as rich cards whose
    images and buttons link to the product page. Without one, template
    images would not be tappable, so native photo messages are sent
    instead. Comment-origin threads whose one-shot private reply was
    just used cannot carry attachments, so those are skipped silently.
    """
    products = [product for product in products if product][:3]
    route, target = resolve_reply_route(conversation)
    if not products or route != 'dm':
        return None
    page = conversation.page
    if getattr(page, 'connection_type', '') == 'whatsapp':
        return send_card_photos(conversation, page, target, products)
    if build_product_page_url(products[0]):
        return send_card_carousel(conversation, page, target, products)
    return send_card_photos(conversation, page, target, products)


def send_conversation_text(conversation, text, sent_by_ai=False, quick_replies=None):
    """Send text to a conversation's customer, store it, and push updates.

    AI-sent replies keep the unread counter so the vendor still notices
    conversations the bot handled.

    Returns the stored Message.

    Raises:
        ConversationSendError: when Meta rejects or cannot be reached.
    """
    message_id = deliver_via_meta(conversation, text, quick_replies=quick_replies)
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
