import logging

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from inbox.models import CONVERSATION_STATUSES, Conversation
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from inbox.services.sending import ConversationSendError, send_conversation_text

logger = logging.getLogger(__name__)

VALID_STATUSES = {value for value, _ in CONVERSATION_STATUSES}
THREAD_PAGE_SIZE = 50


def push_safely(tenant_id, event_type, payload):
    """Push a realtime event; log and continue on infrastructure failure."""
    try:
        push_inbox_event(tenant_id, event_type, payload)
    except Exception:
        logger.warning('Inbox push failed for tenant %s', tenant_id, exc_info=True)


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
        """List the tenant's conversations, newest activity first.

        Supports ?status=, ?platform=, and ?q= which searches the
        customer name and full message history.
        """
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
        search = (request.query_params.get('q') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(customer__name__icontains=search)
                | Q(customer__phone__icontains=search)
                | Q(messages__text__icontains=search)
                | Q(tags__icontains=search)
            ).distinct()
        from vendor.order_views import paginated_list_response

        return paginated_list_response(
            request, queryset, lambda qs: ConversationSerializer(qs, many=True).data, page_size=30,
        )


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id):
        """Update the conversation status or pause the AI bot."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        updates = {}
        if 'status' in request.data:
            new_status = request.data.get('status')
            if new_status not in VALID_STATUSES:
                return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)
            updates['status'] = new_status
        if 'ai_paused' in request.data:
            updates['ai_paused'] = bool(request.data.get('ai_paused'))
        if 'tags' in request.data:
            tags = request.data.get('tags')
            if not isinstance(tags, list):
                return Response({'error': 'tags must be a list'}, status=status.HTTP_400_BAD_REQUEST)
            cleaned = [str(tag).strip()[:30] for tag in tags if str(tag).strip()]
            updates['tags'] = list(dict.fromkeys(cleaned))[:10]
        if not updates:
            return Response({'error': 'Nothing to update'}, status=status.HTTP_400_BAD_REQUEST)
        Conversation.objects.filter(pk=conversation.pk).update(**updates)
        conversation.refresh_from_db()
        data = ConversationSerializer(conversation).data
        push_safely(tenant.id, 'inbox.conversation_update', {'conversation': data})
        return Response(data)


class ConversationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        """Reset the unread counter."""
        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        Conversation.objects.filter(pk=conversation.pk).update(unread_count=0)
        conversation.refresh_from_db()
        data = ConversationSerializer(conversation).data
        push_safely(tenant.id, 'inbox.conversation_update', {'conversation': data})
        return Response(data)


def apply_human_takeover(tenant, conversation):
    """Pause the bot for this chat when a human replies while it is active."""
    from inbox.services.assistant import is_auto_reply_enabled

    if conversation.ai_paused or not is_auto_reply_enabled(tenant):
        return False
    Conversation.objects.filter(pk=conversation.pk).update(ai_paused=True)
    conversation.refresh_from_db()
    push_safely(tenant.id, 'inbox.conversation_update', {
        'conversation': ConversationSerializer(conversation).data,
    })
    return True


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
            if not before.isdigit():
                return Response({'error': 'Invalid before cursor'}, status=status.HTTP_400_BAD_REQUEST)
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
        try:
            record = send_conversation_text(conversation, text)
        except ConversationSendError as exc:
            return Response({'error': str(exc)}, status=exc.status_code)
        took_over = apply_human_takeover(tenant, conversation)
        data = MessageSerializer(record).data
        data['human_takeover'] = took_over
        return Response(data, status=status.HTTP_201_CREATED)


class SuggestReplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        """Draft an AI reply suggestion grounded in the tenant's data."""
        from inbox.services.assistant import (
            AssistantError,
            is_assistant_enabled,
            suggest_reply,
        )

        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_assistant_enabled(tenant):
            return Response(
                {'error': 'The AI assistant is turned off in Settings.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            suggestion = suggest_reply(conversation)
        except AssistantError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'suggestion': suggestion})


class SummarizeConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        """Return a short AI summary of the conversation."""
        from inbox.services.assistant import AssistantError, summarize_conversation

        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            summary = summarize_conversation(conversation)
        except AssistantError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'summary': summary})


class ExtractOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        """Extract a draft order from the conversation with AI."""
        from inbox.services.assistant import (
            AssistantError,
            extract_order,
            is_assistant_enabled,
        )

        tenant, conversation = get_tenant_conversation(request, conversation_id)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_assistant_enabled(tenant):
            return Response(
                {'error': 'The AI assistant is turned off in Settings.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            extraction = extract_order(conversation)
        except AssistantError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(extraction)


class CustomerDetailView(APIView):
    permission_classes = [IsAuthenticated]

    EDITABLE_FIELDS = ('name', 'phone', 'email', 'location', 'notes')

    def get_customer(self, request, customer_id):
        from inbox.models import Customer

        tenant = get_request_tenant(request)
        if not tenant:
            return None
        return Customer.objects.filter(tenant=tenant, id=customer_id).first()

    def get(self, request, customer_id):
        """Return the customer's CRM card with purchase metrics."""
        from inbox.services.crm import build_customer_card

        customer = self.get_customer(request, customer_id)
        if not customer:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(build_customer_card(customer))

    def patch(self, request, customer_id):
        """Update the customer's contact details, notes, or tags."""
        from inbox.services.crm import build_customer_card

        customer = self.get_customer(request, customer_id)
        if not customer:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)
        updates = []
        for field in self.EDITABLE_FIELDS:
            if field in request.data:
                setattr(customer, field, str(request.data.get(field) or '').strip())
                updates.append(field)
        if 'tags' in request.data:
            tags = request.data.get('tags')
            if not isinstance(tags, list):
                return Response({'error': 'tags must be a list'}, status=status.HTTP_400_BAD_REQUEST)
            cleaned = [str(tag).strip()[:30] for tag in tags if str(tag).strip()]
            customer.tags = list(dict.fromkeys(cleaned))[:10]
            updates.append('tags')
        if not updates:
            return Response({'error': 'Nothing to update'}, status=status.HTTP_400_BAD_REQUEST)
        customer.save(update_fields=updates)
        return Response(build_customer_card(customer))


class CustomerListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List the tenant's customers with CRM metrics.

        Supports ?q= matching name, phone, email, or location.
        """
        from django.db.models import Q
        from inbox.models import Customer
        from inbox.services.crm import build_customer_card

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        customers = Customer.objects.filter(tenant=tenant).order_by('-created_at')
        search = (request.query_params.get('q') or '').strip()
        if search:
            customers = customers.filter(
                Q(name__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
                | Q(location__icontains=search)
                | Q(notes__icontains=search)
            )
        from vendor.order_views import paginated_list_response

        return paginated_list_response(
            request, customers,
            lambda qs: [build_customer_card(customer) for customer in qs], page_size=30,
        )


class CampaignSendView(APIView):
    permission_classes = [IsAuthenticated]

    AUDIENCES = ('all', 'buyers', 'prospects')

    def post(self, request):
        """DM a campaign message to an audience of customers.

        Meta only delivers within each customer's messaging window, so
        closed-window sends are reported as skipped, not errors.
        """
        from inbox.models import Customer
        from inbox.services.crm import orders_for_customer
        from inbox.services.sending import ConversationSendError, send_conversation_text

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        message = str(request.data.get('message') or '').strip()
        if len(message) < 5:
            return Response({'error': 'Write the message first.'}, status=status.HTTP_400_BAD_REQUEST)
        audience = request.data.get('audience', 'all')
        if audience not in self.AUDIENCES:
            return Response({'error': 'Invalid audience'}, status=status.HTTP_400_BAD_REQUEST)
        sent = 0
        skipped = 0
        for customer in Customer.objects.filter(tenant=tenant)[:200]:
            has_orders = orders_for_customer(customer).exists()
            if audience == 'buyers' and not has_orders:
                continue
            if audience == 'prospects' and has_orders:
                continue
            conversation = (
                customer.conversations.select_related('customer', 'page')
                .order_by('-last_message_at')
                .first()
            )
            if conversation is None or conversation.ai_paused:
                skipped += 1
                continue
            try:
                send_conversation_text(conversation, message[:900], sent_by_ai=True)
                sent += 1
            except ConversationSendError:
                skipped += 1
        return Response({'sent': sent, 'skipped': skipped})
