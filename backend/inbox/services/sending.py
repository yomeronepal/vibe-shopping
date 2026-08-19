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


def deliver_via_meta(conversation, text):
    """Send the text through Meta; return the platform message id."""
    client = MetaGraphClient()
    try:
        return client.send_message(
            conversation.page.page_id,
            conversation.page.get_access_token(),
            conversation.customer.platform_user_id,
            text,
        )
    except MetaGraphError as exc:
        if exc.code == 10:
            raise ConversationSendError(WINDOW_CLOSED_ERROR, 400)
        logger.warning('Inbox send failed: %s', exc)
        raise ConversationSendError('Could not send the message. Please try again.', 502)


def send_conversation_text(conversation, text):
    """Send text to a conversation's customer, store it, and push updates.

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
        sent_at=timezone.now(),
    )
    Conversation.objects.filter(pk=conversation.pk).update(
        status='waiting_customer',
        unread_count=0,
        last_message_at=record.sent_at,
        last_message_preview=text[:120],
    )
    conversation.refresh_from_db()
    push_safely(conversation.tenant_id, 'inbox.message', {
        'conversation': ConversationSerializer(conversation).data,
        'message': MessageSerializer(record).data,
    })
    return record
