from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import AssistantError, build_suggestion_prompt
from socials.models import ConnectedPage, MetaConnection


class AssistantTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Acme Boutique', subdomain='acme',
            metadata={
                'bio': 'Handmade fashion from Kathmandu',
                'niches': ['Fashion'],
                'aiKnowledge': 'Delivery inside the valley costs Rs. 100 and takes 2 days.',
                'contact': {'phone': '9800000000'},
            },
        )
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            name='Store', status='connected',
        )
        customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=page, customer=customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )
        Message.objects.create(
            conversation=self.convo, direction='in',
            text='How much is the linen shirt?',
            platform_message_id='m1', sent_at=timezone.now(),
        )
        Product.objects.create(
            tenant=self.tenant, name='Linen Shirt', price=1200, stock=4,
            description='Breathable summer shirt', status='published', is_active=True,
        )
        Product.objects.create(
            tenant=self.tenant, name='Hidden Draft', price=999, stock=4,
            status='draft', is_active=False,
        )


class SuggestionPromptTests(AssistantTestBase):
    def test_prompt_grounds_on_catalog_profile_and_history(self):
        prompt = build_suggestion_prompt(self.convo)
        self.assertIn('Linen Shirt — Rs. 1200 — 4 in stock', prompt)
        self.assertIn('Handmade fashion from Kathmandu', prompt)
        self.assertIn('Delivery inside the valley costs Rs. 100', prompt)
        self.assertIn('Customer: How much is the linen shirt?', prompt)
        self.assertIn('Phone: 9800000000', prompt)

    def test_prompt_excludes_unpublished_products(self):
        prompt = build_suggestion_prompt(self.convo)
        self.assertNotIn('Hidden Draft', prompt)

    def test_prompt_orders_history_oldest_first(self):
        Message.objects.create(
            conversation=self.convo, direction='out', text='Hello Sita!',
            platform_message_id='m2', sent_at=timezone.now(),
        )
        prompt = build_suggestion_prompt(self.convo)
        self.assertLess(
            prompt.index('Customer: How much is the linen shirt?'),
            prompt.index('Business: Hello Sita!'),
        )


class SuggestEndpointTests(AssistantTestBase):
    def suggest(self, conversation_id=None):
        return self.client.post(
            f'/api/inbox/conversations/{conversation_id or self.convo.id}/suggest/'
        )

    @patch('inbox.services.assistant.call_gemini', return_value='The linen shirt is Rs. 1200.')
    def test_returns_suggestion(self, mock_call):
        response = self.suggest()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['suggestion'], 'The linen shirt is Rs. 1200.')
        self.assertIn('Linen Shirt', mock_call.call_args[0][0])

    @patch('inbox.services.assistant.call_gemini', side_effect=AssistantError('AI unavailable'))
    def test_reports_ai_failure(self, mock_call):
        response = self.suggest()
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data['error'], 'AI unavailable')

    def test_respects_disabled_assistant(self):
        self.tenant.metadata['aiAssistantEnabled'] = False
        self.tenant.save()
        response = self.suggest()
        self.assertEqual(response.status_code, 400)

    def test_is_tenant_scoped(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        other_connection = MetaConnection.objects.create(tenant=other, fb_user_id='fb2')
        other_page = ConnectedPage.objects.create(
            tenant=other, connection=other_connection, page_id='p2',
            name='Other Store', status='connected',
        )
        other_customer = Customer.objects.create(
            tenant=other, platform='facebook', platform_user_id='psid2',
        )
        foreign = Conversation.objects.create(
            tenant=other, page=other_page, customer=other_customer, platform='facebook',
        )
        response = self.suggest(conversation_id=foreign.id)
        self.assertEqual(response.status_code, 404)


class AssistantSettingsTests(AssistantTestBase):
    def test_profile_returns_ai_fields(self):
        response = self.client.get('/api/vendor/profile/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Delivery inside the valley', response.data['ai_knowledge'])
        self.assertTrue(response.data['ai_assistant_enabled'])

    def test_profile_updates_ai_fields(self):
        response = self.client.patch('/api/vendor/profile/', {
            'ai_knowledge': 'We ship nationwide.',
            'ai_assistant_enabled': False,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.metadata['aiKnowledge'], 'We ship nationwide.')
        self.assertFalse(self.tenant.metadata['aiAssistantEnabled'])
