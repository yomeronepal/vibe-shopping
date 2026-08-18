import logging
import uuid

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from inbox.models import CONVERSATION_STATUSES, Conversation, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

VALID_STATUSES = {value for value, _ in CONVERSATION_STATUSES}
WINDOW_CLOSED_ERROR = 'The 24-hour reply window for this conversation has closed.'
THREAD_PAGE_SIZE = 50


def get_request_tenant(request):
    """Return the tenant for the authenticated user or None."""
    profile = getattr(request.user, 'vendor_profile', None)
    return profile.tenant if profile else None


def get_tenant_conversation(request, conversation_id):
    """Return (tenant, conversation) with tenant scoping; Nones on miss."""
    tenant = get_request_tenant(request)
    if not tenant:
        return None, None
    conversation = Conversation.objects.filter(tenant=tenant, id=conversation_id).select_related(
        'customer', 'page'
    ).first()
    return tenant, conversation


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List the tenant's conversations, newest activity first."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        queryset = Conversation.objects.filter(tenant=tenant).select_related('customer', 'page')
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        platform_filter = request.query_params.get('platform')
        if platform_filter:
            queryset = queryset.filter(platform=platform_filter)
        return Response(ConversationSerializer(queryset, many=True).data)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id):
        """Update the conversation status."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        if new_status not in VALID_STATUSES:
            return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)
        conversation.status = new_status
        conversation.save()
        data = ConversationSerializer(conversation).data
        push_inbox_event(tenant.id, 'inbox.conversation_update', {'conversation': data})
        return Response(data)


class ConversationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        """Reset the unread counter."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        conversation.unread_count = 0
        conversation.save()
        data = ConversationSerializer(conversation).data
        push_inbox_event(tenant.id, 'inbox.conversation_update', {'conversation': data})
        return Response(data)


class MessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        """Return up to 50 thread messages, oldest first."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        queryset = conversation.messages.all()
        before = request.query_params.get('before')
        if before:
            queryset = queryset.filter(id__lt=before)
        window = list(queryset.order_by('-sent_at')[:THREAD_PAGE_SIZE])
        window.reverse()
        return Response(MessageSerializer(window, many=True).data)

    def post(self, request, conversation_id):
        """Send a reply through Meta and store it."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'error': 'Message text is required'}, status=status.HTTP_400_BAD_REQUEST)
        client = MetaGraphClient()
        try:
            message_id = client.send_message(
                conversation.page.page_id,
                conversation.page.get_access_token(),
                conversation.customer.platform_user_id,
                text,
            )
        except MetaGraphError as exc:
            if exc.code == 10:
                return Response({'error': WINDOW_CLOSED_ERROR}, status=status.HTTP_400_BAD_REQUEST)
            logger.warning('Inbox send failed: %s', exc)
            return Response(
                {'error': 'Could not send the message. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        record = Message.objects.create(
            conversation=conversation,
            direction='out',
            text=text,
            platform_message_id=message_id or f'local-{uuid.uuid4().hex}',
            sent_at=timezone.now(),
        )
        conversation.status = 'waiting_customer'
        conversation.unread_count = 0
        conversation.last_message_at = record.sent_at
        conversation.last_message_preview = text[:120]
        conversation.save()
        push_inbox_event(tenant.id, 'inbox.message', {
            'conversation': ConversationSerializer(conversation).data,
            'message': MessageSerializer(record).data,
        })
        return Response(MessageSerializer(record).data, status=status.HTTP_201_CREATED)
