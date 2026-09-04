from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from vendor.order_views import get_request_tenant
from vendor.team_views import is_owner

from .plans import plan_reply_limit, serialize_plans
from .services import get_subscription, replies_used_this_month


class BillingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """The owner's plan, usage, and renewal details."""
        if not is_owner(request):
            return Response(
                {'error': 'Only the owner can view billing.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        tenant = get_request_tenant(request)
        subscription = get_subscription(tenant)
        limit = plan_reply_limit(subscription.plan)
        return Response({
            'plan': subscription.plan,
            'status': subscription.status,
            'is_trial': subscription.is_trial,
            'period_end': subscription.current_period_end,
            'days_left': subscription.days_left,
            'usage': {
                'used': replies_used_this_month(tenant),
                'limit': limit,
            },
            'plans': serialize_plans(),
            'payment_instructions': getattr(settings, 'BILLING_PAYMENT_INSTRUCTIONS', ''),
        })
