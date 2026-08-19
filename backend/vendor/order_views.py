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
    size = serializers.CharField(required=False, allow_blank=True)
    color = serializers.CharField(required=False, allow_blank=True)


class VendorOrderSerializer(serializers.ModelSerializer):
    items = VendorOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'total_amount', 'order_type', 'payment_method',
            'customer_name', 'customer_phone', 'customer_email', 'metadata', 'created_at', 'items',
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
        """List the tenant's orders, newest first.

        Supports ?status= and ?q= (order id, customer name/phone,
        or product name).
        """
        from django.db.models import Q

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        orders = (
            Order.objects.filter(tenant=tenant)
            .prefetch_related('items__product')
            .order_by('-created_at')
        )
        status_filter = request.query_params.get('status')
        if status_filter:
            orders = orders.filter(status=status_filter)
        search = (request.query_params.get('q') or '').strip()
        if search:
            query = (
                Q(customer_name__icontains=search)
                | Q(customer_phone__icontains=search)
                | Q(items__product__name__icontains=search)
            )
            if search.isdigit():
                query = query | Q(id=int(search))
            orders = orders.filter(query).distinct()
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
        notified = notify_customer_of_status(order)
        data = VendorOrderSerializer(order).data
        data['customer_notified'] = notified
        return Response(data)


STATUS_NOTIFICATIONS = {
    'preparing': 'Your order #{id} is being prepared. We will update you soon!',
    'shipped': 'Good news! Your order #{id} has been shipped and is on its way.',
    'delivered': 'Your order #{id} has been delivered. Dhanyabad for shopping with us! We would love to hear how you liked it — just reply with your feedback.',
    'cancelled': 'Your order #{id} has been cancelled. Message us if you have any questions.',
    'returned': 'We have recorded the return of your order #{id}. Message us for anything else.',
}


def notify_customer_of_status(order):
    """DM the customer about the new status when the order came from chat."""
    template = STATUS_NOTIFICATIONS.get(order.status)
    conversation_id = (order.metadata or {}).get('conversation_id')
    if not template or not conversation_id:
        return False
    from inbox.models import Conversation
    from inbox.services.sending import ConversationSendError, send_conversation_text

    conversation = (
        Conversation.objects.filter(tenant=order.tenant, id=conversation_id)
        .select_related('customer', 'page')
        .first()
    )
    if conversation is None:
        return False
    try:
        send_conversation_text(conversation, template.format(id=order.id), sent_by_ai=True)
    except ConversationSendError:
        return False
    return True


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


class ProductStockHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, product_id):
        """Return the product's stock movements, newest first."""
        from core.models import Product, StockHistory

        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        product = Product.objects.filter(tenant=tenant, id=product_id).first()
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        entries = StockHistory.objects.filter(product=product)[:50]
        return Response([
            {
                'delta': entry.delta,
                'resulting_stock': entry.resulting_stock,
                'reason': entry.get_reason_display(),
                'note': entry.note,
                'created_at': entry.created_at,
            }
            for entry in entries
        ])
