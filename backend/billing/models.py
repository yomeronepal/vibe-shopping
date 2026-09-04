from datetime import timedelta

from django.db import models
from django.utils import timezone

from .plans import GRACE_DAYS, PLAN_CHOICES, TRIAL_PLAN

PAYMENT_METHODS = [
    ('esewa', 'eSewa'),
    ('khalti', 'Khalti'),
    ('bank', 'Bank transfer'),
    ('cash', 'Cash'),
]


class Subscription(models.Model):
    tenant = models.OneToOneField(
        'core.Tenant', on_delete=models.CASCADE, related_name='subscription',
    )
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default=TRIAL_PLAN)
    is_trial = models.BooleanField(default=True)
    current_period_end = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.tenant} — {self.plan} until {self.current_period_end:%Y-%m-%d}'

    @property
    def status(self):
        """Computed lifecycle state: active, grace, or expired."""
        now = timezone.now()
        if now < self.current_period_end:
            return 'active'
        if now < self.current_period_end + timedelta(days=GRACE_DAYS):
            return 'grace'
        return 'expired'

    @property
    def days_left(self):
        """Whole days until the period ends; 0 once it has passed."""
        remaining = self.current_period_end - timezone.now()
        return max(0, remaining.days)

    def apply_payment(self, days_granted, plan=''):
        """Extend the period from now or its end, whichever is later."""
        base = max(timezone.now(), self.current_period_end)
        self.current_period_end = base + timedelta(days=days_granted)
        if plan:
            self.plan = plan
        self.is_trial = False
        self.save(update_fields=['current_period_end', 'plan', 'is_trial', 'updated_at'])


class PaymentRecord(models.Model):
    subscription = models.ForeignKey(
        Subscription, on_delete=models.CASCADE, related_name='payments',
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=PAYMENT_METHODS, default='esewa')
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, blank=True)
    reference = models.CharField(max_length=255, blank=True)
    days_granted = models.PositiveIntegerField(default=30)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-recorded_at']

    def __str__(self):
        return f'Rs {self.amount} via {self.method} ({self.subscription.tenant})'

    def save(self, *args, **kwargs):
        """Record the payment and extend the subscription on creation."""
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating:
            self.subscription.apply_payment(self.days_granted, self.plan)
