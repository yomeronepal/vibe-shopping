import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def auto_reply_to_message(message_id):
    """Send an AI reply to an inbound message when the bot is enabled.

    Skips silently when the bot is off, the conversation is paused,
    or a newer message has already arrived (that message's own task
    will answer with fuller context).
    """
    from inbox.models import Message
    from inbox.services.assistant import (
        AssistantError,
        is_auto_reply_enabled,
        suggest_reply,
    )
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
    latest = conversation.messages.order_by('-sent_at', '-id').first()
    if latest is None or latest.id != message.id:
        return 'superseded'
    try:
        reply = suggest_reply(conversation)
        send_conversation_text(conversation, reply, sent_by_ai=True)
    except (AssistantError, ConversationSendError) as exc:
        logger.warning('Auto-reply failed for conversation %s: %s', conversation.id, exc)
        return 'failed'
    return 'sent'
