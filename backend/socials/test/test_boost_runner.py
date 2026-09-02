from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, SocialMediaPost, Tenant, VendorProfile
from socials.models import BoostCampaign, ConnectedPage, MetaConnection
from socials.services.boost_runner import (
    BoostError,
    evaluate_boost,
    launch_boost,
    parse_insights,
    preflight_issues,
)


class BoostRunnerTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Ad Shop', subdomain='adshop', metadata={})
        self.user = User.objects.create_user(username='ad_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.connection = MetaConnection.objects.create(
            tenant=self.tenant, fb_user_id='fbad', status='connected',
        )
        self.connection.set_access_token('user-token-1')
        self.connection.save()
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=self.connection, page_id='pad',
            name='Ad Page', status='connected',
        )
        self.product = Product.objects.create(
            tenant=self.tenant, name='Boosted Tee', price=1500, stock=10,
            status='published', is_active=True,
        )
        self.post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            status='posted', post_url='https://fb.com/x', platform_post_id='pad_123',
        )

    def make_boost(self, **kwargs):
        defaults = {
            'tenant': self.tenant, 'post': self.post, 'ad_account_id': 'act_1',
            'campaign_id': 'c1', 'adset_id': 's1', 'ad_id': 'a1',
            'daily_budget': 300, 'days': 5, 'status': 'active',
            'ends_at': timezone.now() + timezone.timedelta(days=5),
        }
        defaults.update(kwargs)
        return BoostCampaign.objects.create(**defaults)


class PreflightTests(BoostRunnerTestBase):
    def test_clean_plan_passes(self):
        self.assertEqual(preflight_issues(self.tenant, self.post, 300, 5), [])

    def test_low_stock_blocks(self):
        self.product.stock = 2
        self.product.save()
        issues = preflight_issues(self.tenant, self.post, 300, 5)
        self.assertTrue(any('stock' in issue for issue in issues))

    def test_duplicate_active_boost_blocks(self):
        self.make_boost()
        issues = preflight_issues(self.tenant, self.post, 300, 5)
        self.assertTrue(any('already has an active boost' in issue for issue in issues))

    def test_monthly_cap_blocks(self):
        self.tenant.metadata['adMonthlyCap'] = 1000
        self.tenant.save()
        issues = preflight_issues(self.tenant, self.post, 300, 5)
        self.assertTrue(any('monthly boost cap' in issue for issue in issues))

    def test_tiny_budget_blocks(self):
        issues = preflight_issues(self.tenant, self.post, 50, 5)
        self.assertTrue(any('at least' in issue for issue in issues))


class LaunchTests(BoostRunnerTestBase):
    @patch('socials.services.boost_runner.MetaGraphClient')
    def test_launch_creates_chain_and_row(self, mock_client_cls):
        client = mock_client_cls.return_value
        client.create_boost_campaign.return_value = 'camp-1'
        client.create_boost_adset.return_value = 'set-1'
        client.create_boost_ad.return_value = 'ad-1'
        boost = launch_boost(self.tenant, self.post, 'act_9', 300, 5)
        self.assertEqual(boost.campaign_id, 'camp-1')
        self.assertEqual(boost.adset_id, 'set-1')
        self.assertEqual(boost.ad_id, 'ad-1')
        adset_args = client.create_boost_adset.call_args[0]
        self.assertEqual(adset_args[5], 30000)
        self.assertEqual(adset_args[6]['geo_locations'], {'countries': ['NP']})

    def test_launch_refused_on_guardrail(self):
        self.make_boost()
        with self.assertRaises(BoostError):
            launch_boost(self.tenant, self.post, 'act_9', 300, 5)


class GuardrailTests(BoostRunnerTestBase):
    def test_parse_insights_reads_conversations(self):
        raw = {
            'spend': '640.5', 'impressions': '9000', 'reach': '4000',
            'actions': [{'action_type': 'onsite_conversion.messaging_conversation_started_7d', 'value': '8'}],
        }
        insights = parse_insights(raw)
        self.assertEqual(insights['conversations_started'], 8)
        self.assertEqual(insights['cost_per_conversation'], 80.1)

    def test_auto_pause_when_spend_without_chats(self):
        boost = self.make_boost()
        outcome = evaluate_boost(boost, {'spend': 800, 'conversations_started': 0})
        self.assertEqual(outcome, 'auto_paused')
        self.assertIn('without a single new conversation', boost.status_note)

    def test_auto_pause_when_chat_costs_more_than_product(self):
        boost = self.make_boost()
        outcome = evaluate_boost(boost, {
            'spend': 4000, 'conversations_started': 2, 'cost_per_conversation': 2000,
        })
        self.assertEqual(outcome, 'auto_paused')
        self.assertIn('more than the', boost.status_note)

    def test_healthy_boost_stays_active(self):
        boost = self.make_boost()
        outcome = evaluate_boost(boost, {
            'spend': 900, 'conversations_started': 12, 'cost_per_conversation': 75,
        })
        self.assertEqual(outcome, 'ok')
        self.assertEqual(boost.status, 'active')

    def test_finished_boost_completes(self):
        boost = self.make_boost(ends_at=timezone.now() - timezone.timedelta(hours=1))
        outcome = evaluate_boost(boost, {'spend': 100, 'conversations_started': 3})
        self.assertEqual(outcome, 'completed')


class BoostApiTests(BoostRunnerTestBase):
    @patch('socials.services.boost_runner.MetaGraphClient')
    def test_endpoint_launches_and_lists(self, mock_client_cls):
        client = mock_client_cls.return_value
        client.create_boost_campaign.return_value = 'camp-2'
        client.create_boost_adset.return_value = 'set-2'
        client.create_boost_ad.return_value = 'ad-2'
        response = self.client.post('/api/socials/boosts/', {
            'post_id': self.post.id, 'ad_account_id': 'act_5',
            'daily_budget': 250, 'days': 4,
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['product_name'], 'Boosted Tee')
        listing = self.client.get('/api/socials/boosts/')
        self.assertEqual(len(listing.data), 1)

    def test_endpoint_reports_guardrail_error(self):
        response = self.client.post('/api/socials/boosts/', {
            'post_id': self.post.id, 'ad_account_id': 'act_5',
            'daily_budget': 10, 'days': 4,
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('at least', response.data['error'])
