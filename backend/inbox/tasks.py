import logging

from celery import shared_task

logger = logging.getLogger(__name__)

AUTO_REPLY_DEBOUNCE_SECONDS = 10


def is_latest_inbound(conversation, message):
    """Whether no newer customer message has arrived since this one."""
    latest = (
        conversation.messages.filter(direction='in')
        .order_by('-sent_at', '-id')
        .first()
    )
    return latest is not None and latest.id == message.id


def was_answered_after(conversation, message):
    """Whether an outbound reply was already sent after this message."""
    return conversation.messages.filter(
        direction='out', sent_at__gte=message.sent_at
    ).exists()


def apply_conversation_signals(conversation, outcome):
    """Persist sentiment and pause the bot when a human is needed."""
    from inbox.models import Conversation

    updates = {'sentiment': outcome.get('sentiment', '')}
    if outcome.get('needs_human'):
        updates['ai_paused'] = True
        logger.info('Bot handing conversation %s to a human', conversation.id)
    Conversation.objects.filter(pk=conversation.pk).update(**updates)
    conversation.refresh_from_db()


def track_order_intent(conversation, outcome, order):
    """Remember unfinished buying intent; clear it once an order exists."""
    from django.utils import timezone
    from inbox.models import Conversation

    if order is not None:
        Conversation.objects.filter(pk=conversation.pk).update(
            order_intent_at=None, followup_sent_at=None,
        )
    elif outcome.get('ordering'):
        Conversation.objects.filter(pk=conversation.pk).update(
            order_intent_at=timezone.now(), followup_sent_at=None,
        )


@shared_task
def auto_reply_to_message(message_id):
    """Answer an inbound message with the bot and place ready orders.

    Skips silently when the bot is off, the conversation is paused,
    or a newer message has already arrived (that message's own task
    will answer with fuller context). When the customer has chosen
    items and provided every field the vendor collects, the order is
    created automatically and the confirmation includes its number.
    """
    from inbox.models import Message
    from inbox.services.assistant import (
        AssistantError,
        advance_order_conversation,
        is_auto_reply_enabled,
    )
    from inbox.services.chat_orders import create_chat_order
    from inbox.services.sending import ConversationSendError, send_conversation_text

    message = (
        Message.objects.filter(id=message_id)
        .select_related('conversation__tenant', 'conversation__customer', 'conversation__page')
        .first()
    )
    if message is None or message.direction != 'in':
        return 'skipped'
    conversation = message.conversation
    if conversation.ai_paused or not is_auto_reply_enabled(conversation.tenant):
        return 'skipped'
    if not is_latest_inbound(conversation, message):
        return 'superseded'
    if was_answered_after(conversation, message):
        return 'already_answered'
    from inbox.services.sending import show_read_and_typing

    if message.source != 'comment':
        show_read_and_typing(conversation)
    try:
        outcome = advance_order_conversation(conversation)
    except AssistantError as exc:
        logger.warning('Auto-reply failed for conversation %s: %s', conversation.id, exc)
        return 'failed'
    if not is_latest_inbound(conversation, message) or was_answered_after(conversation, message):
        return 'superseded'
    apply_conversation_signals(conversation, outcome)
    form, confirming = build_order_details_form(conversation, outcome)
    reply = outcome['reply'] + form
    quick_replies = ['Confirm', 'Change garnu cha'] if confirming else outcome.get('quick_replies') or []
    order = None
    if outcome['order_ready']:
        from inbox.services.chat_orders import exceeds_order_cap

        if exceeds_order_cap(conversation.tenant, outcome['items']):
            from inbox.models import Conversation

            Conversation.objects.filter(pk=conversation.pk).update(ai_paused=True)
            reply = (
                f'{reply}\n\nYo order thulo bhayeko le hamro team member le '
                'chittai confirm garna tapailai contact garnu hunecha. Dhanyabad!'
            )
            logger.info('Order over auto-confirm cap; handing conversation %s to a human', conversation.id)
        else:
            order, note = resolve_ready_order(conversation, outcome)
            reply = f'{reply}{note}'
    track_order_intent(conversation, outcome, order)
    try:
        send_conversation_text(conversation, reply, sent_by_ai=True, quick_replies=quick_replies)
    except ConversationSendError as exc:
        logger.warning('Auto-reply send failed for conversation %s: %s', conversation.id, exc)
        return 'failed'
    if order is not None:
        send_order_item_cards(conversation, order)
    elif not outcome['order_ready']:
        send_recommendation_cards(conversation, outcome)
    return f'sent+order:{order.id}' if order else 'sent'


def send_order_item_cards(conversation, order):
    """Follow the confirmation with photos of the ordered products."""
    from inbox.services.sending import send_product_cards

    products = [item.product for item in order.items.select_related('product')[:3]]
    try:
        send_product_cards(conversation, products)
    except Exception:
        logger.warning('Order photo send failed for conversation %s', conversation.id, exc_info=True)


def lookup_customer_value(customer, field):
    """Map an order field label to the customer's stored contact info."""
    lowered = field.lower()
    if 'phone' in lowered or 'number' in lowered:
        return customer.phone or ''
    if 'email' in lowered:
        return customer.email or ''
    if 'address' in lowered or 'location' in lowered:
        return customer.location or ''
    if 'name' in lowered:
        return customer.name or ''
    return ''


def build_order_details_form(conversation, outcome):
    """Return (form text, confirming): prefilled known fields, blank unknowns."""
    if not outcome.get('ordering') or outcome.get('order_ready') or outcome.get('needs_human'):
        return '', False
    from inbox.services.assistant import get_order_fields

    fields = outcome.get('required_fields') or get_order_fields(conversation.tenant)
    collected = outcome.get('collected') or {}
    customer = conversation.customer
    lines = []
    blanks = 0
    for field in fields:
        value = str(collected.get(field) or '').strip() or lookup_customer_value(customer, field)
        if value.lower() == 'n/a':
            continue
        if not value:
            blanks += 1
        lines.append(f'{field}: {value}'.rstrip())
    if not lines:
        return '', False
    form = '\n'.join(lines)
    if blanks == 0:
        return (
            f'\n\nHami sanga bhayeko details 👇\n{form}\n'
            'Thik chha bhane "confirm" bhannus, change garnu parne bhaye copy garera milaera pathaunus.'
        ), True
    return (
        f'\n\nYo copy garera khali details bharera pathaunus 👇\n{form}'
    ), False


def order_word(outcome):
    """Say Booking for service-only carts, Order otherwise."""
    items = outcome.get('items') or []
    if items and all(item.get('item_type') == 'service' for item in items):
        return 'Booking'
    return 'Order'


def resolve_ready_order(conversation, outcome):
    """Place or revise the order; returns (order, reply note)."""
    from inbox.services.chat_orders import create_chat_order, update_chat_order

    word = order_word(outcome)
    if outcome.get('update_order_id'):
        order = update_chat_order(
            conversation, outcome['update_order_id'], outcome['items'], outcome['collected'],
        )
        if order is None:
            from inbox.models import Conversation

            Conversation.objects.filter(pk=conversation.pk).update(ai_paused=True)
            logger.info('Order revision needs a human; pausing conversation %s', conversation.id)
            return None, (
                '\n\nYo change ko lagi hamro team member le tapailai '
                'chittai contact garnu hunecha. Dhanyabad!'
            )
        return order, f'\n\n{word} #{order.id} updated — New total Rs. {order.total_amount:,.0f}. Dhanyabad!'
    order = create_chat_order(conversation, outcome['items'], outcome['collected'])
    if order is None:
        revised = revise_recent_duplicate(conversation, outcome)
        if revised is not None:
            return revised, f'\n\n{word} #{revised.id} updated — New total Rs. {revised.total_amount:,.0f}. Dhanyabad!'
        return None, ''
    return order, f'\n\n{word} #{order.id} — Total Rs. {order.total_amount:,.0f}. Dhanyabad!'


def order_matches_items(order, items):
    """Whether the order already holds exactly these lines."""
    existing = {
        (line.product_id, line.quantity, line.size or '', line.color or '')
        for line in order.items.all()
    }
    requested = {
        (item['product_id'], item['quantity'], item.get('size', ''), item.get('color', ''))
        for item in items
    }
    return existing == requested


def revise_recent_duplicate(conversation, outcome):
    """Turn a blocked duplicate into a revision when the items changed.

    A repeat of the exact same lines stays blocked (true duplicate);
    different lines mean the customer changed their mind about the
    just-placed order even if the model forgot update_order_id.
    """
    from inbox.services.chat_orders import (
        UPDATABLE_ORDER_STATUSES,
        find_recent_chat_order,
        update_chat_order,
    )

    recent = find_recent_chat_order(conversation, outcome['items'])
    if recent is None or recent.status not in UPDATABLE_ORDER_STATUSES:
        return None
    if order_matches_items(recent, outcome['items']):
        return None
    return update_chat_order(conversation, recent.id, outcome['items'], outcome['collected'])


def send_recommendation_cards(conversation, outcome):
    """Follow the reply with photo cards for recommended products."""
    products = outcome.get('recommended_products') or []
    if not products:
        return
    from inbox.services.sending import send_product_cards

    try:
        send_product_cards(conversation, products)
    except Exception:
        logger.warning('Product card send failed for conversation %s', conversation.id, exc_info=True)


DEFAULT_FOLLOWUP_MESSAGE = (
    'Namaste! Tapaile order garna khojnu bhayeko thiyo — hami yahi chhau. '
    'Kunai prashna cha bhane sodhnus, order complete garna help garchhau!'
)
FOLLOWUP_EXPIRY_HOURS = 48


@shared_task
def send_abandoned_order_followups():
    """Nudge customers who showed buying intent but never completed the order."""
    from datetime import timedelta

    from django.utils import timezone

    from inbox.models import Conversation
    from inbox.services.assistant import is_auto_reply_enabled
    from inbox.services.sending import ConversationSendError, send_conversation_text

    now = timezone.now()
    sent = 0
    candidates = (
        Conversation.objects.filter(
            order_intent_at__isnull=False,
            followup_sent_at__isnull=True,
            ai_paused=False,
        )
        .select_related('tenant', 'customer', 'page')
    )
    for conversation in candidates:
        tenant = conversation.tenant
        if not is_auto_reply_enabled(tenant):
            continue
        metadata = tenant.metadata or {}
        try:
            delay_hours = max(1, int(metadata.get('followupHours') or 6))
        except (TypeError, ValueError):
            delay_hours = 6
        if conversation.order_intent_at > now - timedelta(hours=delay_hours):
            continue
        if conversation.order_intent_at < now - timedelta(hours=FOLLOWUP_EXPIRY_HOURS):
            Conversation.objects.filter(pk=conversation.pk).update(order_intent_at=None)
            continue
        last = conversation.messages.order_by('-sent_at', '-id').first()
        if last is None or last.direction != 'out':
            continue
        message = str(metadata.get('followupMessage') or DEFAULT_FOLLOWUP_MESSAGE)[:500]
        try:
            send_conversation_text(conversation, message, sent_by_ai=True)
            sent += 1
        except ConversationSendError as exc:
            logger.info('Follow-up skipped for conversation %s: %s', conversation.id, exc)
        Conversation.objects.filter(pk=conversation.pk).update(followup_sent_at=now)
    return sent
