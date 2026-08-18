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
            'customer_name', 'customer_phone', 'created_at', 'items',
        ]


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
