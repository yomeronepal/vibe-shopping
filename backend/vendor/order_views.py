from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Order

VALID_ORDER_STATUSES = {value for value, _ in Order.ORDER_STATUS_CHOICES}


class VendorOrderItemSerializer(serializers.Serializer):
    product_name = serializers.CharField(source='product.name')
    quantity = serializers.IntegerField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2)


class VendorOrderSerializer(serializers.ModelSerializer):
    items = VendorOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'total_amount', 'order_type', 'payment_method',
            'customer_name', 'customer_phone', 'customer_email', 'created_at', 'items',
        ]


def compose_invoice_text(order):
    """Build the plain-text invoice message for a customer DM."""
    lines = [f'Invoice #{order.id} — {order.tenant.name}', '']
    for item in order.items.select_related('product'):
        line_total = item.price * item.quantity
        lines.append(f'{item.quantity} x {item.product.name} — Rs. {line_total:,.0f}')
    lines.extend([
        '',
        f'Total: Rs. {float(order.total_amount):,.0f}',
        f'Payment: {order.get_payment_method_display()}',
        f'Status: {order.get_status_display()}',
        '',
        'Thank you for shopping with us!',
    ])
    return '\n'.join(lines)


def get_request_tenant(request):
    """Return the tenant for the authenticated user or None."""
    profile = getattr(request.user, 'vendor_profile', None)
    return profile.tenant if profile else None


class VendorOrderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List the tenant's orders, newest first."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        orders = (
            Order.objects.filter(tenant=tenant)
            .prefetch_related('items__product')
            .order_by('-created_at')
        )
        return Response(VendorOrderSerializer(orders, many=True).data)


class VendorOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, order_id):
        """Return a single order with its items."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        order = (
            Order.objects.filter(tenant=tenant, id=order_id)
            .prefetch_related('items__product')
            .first()
        )
        if not order:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(VendorOrderSerializer(order).data)

    def patch(self, request, order_id):
        """Update an order's status."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        order = Order.objects.filter(tenant=tenant, id=order_id).first()
        if not order:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        if new_status not in VALID_ORDER_STATUSES:
            return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = new_status
        order.save(update_fields=['status'])
        return Response(VendorOrderSerializer(order).data)


class VendorOrderInvoiceSendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        """DM the order's invoice to a chosen inbox conversation."""
        from inbox.models import Conversation
        from inbox.services.sending import ConversationSendError, send_conversation_text

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        order = (
            Order.objects.filter(tenant=tenant, id=order_id)
            .prefetch_related('items__product')
            .first()
        )
        if not order:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        conversation = (
            Conversation.objects.filter(tenant=tenant, id=request.data.get('conversation_id'))
            .select_related('customer', 'page')
            .first()
        )
        if not conversation:
            return Response(
                {'error': 'Choose a conversation to send the invoice to.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        text = compose_invoice_text(order)
        try:
            record = send_conversation_text(conversation, text)
        except ConversationSendError as exc:
            return Response({'error': str(exc)}, status=exc.status_code)
        return Response({'sent': True, 'message_id': record.id, 'text': text})
