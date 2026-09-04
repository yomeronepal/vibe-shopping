from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from billing.models import PaymentRecord
from billing.services import ai_allowance, get_subscription
from core.models import AITokenUsage, Tenant, VendorProfile


class BillingTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Bill Shop', subdomain='billshop', metadata={})
        self.owner = User.objects.create_user(username='bill_owner', password='pass12345')
        VendorProfile.objects.create(user=self.owner, tenant=self.tenant, role='owner')
        self.token = Token.objects.create(user=self.owner)

    def authenticate(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def expire_subscription(self, days_past=10):
        subscription = get_subscription(self.tenant)
        subscription.current_period_end = timezone.now() - timedelta(days=days_past)
        subscription.save(update_fields=['current_period_end'])
        return subscription

    def log_bot_replies(self, count):
        AITokenUsage.objects.bulk_create([
            AITokenUsage(tenant=self.tenant, ai_provider='gemini', operation_type='bot_reply')
            for _ in range(count)
        ])


class SubscriptionLifecycleTests(BillingTestBase):
    def test_first_access_starts_a_growth_trial(self):
        subscription = get_subscription(self.tenant)
        self.assertEqual(subscription.plan, 'growth')
        self.assertTrue(subscription.is_trial)
        self.assertEqual(subscription.status, 'active')
        self.assertIn(subscription.days_left, (13, 14))

    def test_grace_then_expired_after_period_end(self):
        subscription = self.expire_subscription(days_past=1)
        self.assertEqual(subscription.status, 'grace')
        subscription = self.expire_subscription(days_past=4)
        self.assertEqual(subscription.status, 'expired')

    def test_payment_extends_period_and_clears_trial(self):
        subscription = self.expire_subscription(days_past=10)
        PaymentRecord.objects.create(
            subscription=subscription, amount=2999, method='esewa', plan='starter',
        )
        subscription.refresh_from_db()
        self.assertEqual(subscription.plan, 'starter')
        self.assertFalse(subscription.is_trial)
        self.assertEqual(subscription.status, 'active')
        self.assertGreaterEqual(subscription.days_left, 29)

    def test_early_renewal_stacks_on_current_period(self):
        subscription = get_subscription(self.tenant)
        original_end = subscription.current_period_end
        PaymentRecord.objects.create(
            subscription=subscription, amount=5999, method='bank', days_granted=30,
        )
        subscription.refresh_from_db()
        self.assertEqual(subscription.current_period_end, original_end + timedelta(days=30))


class AiAllowanceTests(BillingTestBase):
    def test_trial_and_grace_allow_replies(self):
        allowed, _ = ai_allowance(self.tenant)
        self.assertTrue(allowed)
        self.expire_subscription(days_past=1)
        allowed, _ = ai_allowance(self.tenant)
        self.assertTrue(allowed)

    def test_expired_blocks_replies(self):
        self.expire_subscription(days_past=10)
        allowed, reason = ai_allowance(self.tenant)
        self.assertFalse(allowed)
        self.assertEqual(reason, 'subscription_expired')

    def test_monthly_cap_blocks_replies(self):
        subscription = get_subscription(self.tenant)
        subscription.plan = 'starter'
        subscription.save(update_fields=['plan'])
        self.log_bot_replies(500)
        allowed, reason = ai_allowance(self.tenant)
        self.assertFalse(allowed)
        self.assertEqual(reason, 'monthly_cap_reached')

    def test_pro_plan_is_unlimited(self):
        subscription = get_subscription(self.tenant)
        subscription.plan = 'pro'
        subscription.save(update_fields=['plan'])
        self.log_bot_replies(600)
        allowed, _ = ai_allowance(self.tenant)
        self.assertTrue(allowed)


class BillingEndpointTests(BillingTestBase):
    def test_owner_sees_plan_usage_and_instructions(self):
        self.authenticate(self.token)
        self.log_bot_replies(3)
        response = self.client.get('/api/vendor/billing/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['plan'], 'growth')
        self.assertTrue(response.data['is_trial'])
        self.assertEqual(response.data['usage'], {'used': 3, 'limit': 2000})
        self.assertEqual(len(response.data['plans']), 3)
        self.assertTrue(response.data['payment_instructions'])

    def test_staff_cannot_view_billing(self):
        staff = User.objects.create_user(username='bill_staff', password='pass12345')
        VendorProfile.objects.create(user=staff, tenant=self.tenant, role='staff')
        self.authenticate(Token.objects.create(user=staff))
        response = self.client.get('/api/vendor/billing/')
        self.assertEqual(response.status_code, 403)
