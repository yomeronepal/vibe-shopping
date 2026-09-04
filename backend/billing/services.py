from datetime import timedelta

from django.utils import timezone

from .models import Subscription
from .plans import TRIAL_DAYS, TRIAL_PLAN, plan_reply_limit


def get_subscription(tenant):
    """The tenant's subscription, starting a fresh trial when missing."""
    subscription, _ = Subscription.objects.get_or_create(
        tenant=tenant,
        defaults={
            'plan': TRIAL_PLAN,
            'is_trial': True,
            'current_period_end': timezone.now() + timedelta(days=TRIAL_DAYS),
        },
    )
    return subscription


def replies_used_this_month(tenant):
    """Count of bot auto-replies logged this calendar month."""
    from core.models import AITokenUsage

    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return AITokenUsage.objects.filter(
        tenant=tenant, operation_type='bot_reply', created_at__gte=month_start,
    ).count()


def is_expired(tenant):
    """Whether the subscription is past its grace window."""
    return get_subscription(tenant).status == 'expired'


def ai_allowance(tenant):
    """Whether the AI may auto-reply, and the reason when it may not."""
    subscription = get_subscription(tenant)
    if subscription.status == 'expired':
        return False, 'subscription_expired'
    limit = plan_reply_limit(subscription.plan)
    if limit is not None and replies_used_this_month(tenant) >= limit:
        return False, 'monthly_cap_reached'
    return True, ''
