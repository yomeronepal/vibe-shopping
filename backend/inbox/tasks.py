import logging

from celery import shared_task

logger = logging.getLogger(__name__)

AUTO_REPLY_DEBOUNCE_SECONDS = 8


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
    try:
        outcome = advance_order_conversation(conversation)
    except AssistantError as exc:
        logger.warning('Auto-reply failed for conversation %s: %s', conversation.id, exc)
        return 'failed'
    if not is_latest_inbound(conversation, message) or was_answered_after(conversation, message):
        return 'superseded'
    reply = outcome['reply']
    order = None
    if outcome['order_ready']:
        order = create_chat_order(conversation, outcome['items'], outcome['collected'])
        if order is not None:
            reply = f'{reply}\n\nOrder #{order.id} — Total Rs. {order.total_amount:,.0f}. Dhanyabad!'
    try:
        send_conversation_text(conversation, reply, sent_by_ai=True)
    except ConversationSendError as exc:
        logger.warning('Auto-reply send failed for conversation %s: %s', conversation.id, exc)
        return 'failed'
    return f'sent+order:{order.id}' if order else 'sent'
