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
        self.assertIn('Linen Shirt | SKU', prompt)
        self.assertIn('Rs. 1200 — 4 in stock', prompt)
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


class OrderExtractionTests(AssistantTestBase):
    def extract(self, conversation_id=None):
        return self.client.post(
            f'/api/inbox/conversations/{conversation_id or self.convo.id}/extract-order/'
        )

    @patch(
        'inbox.services.assistant.call_gemini',
        return_value='{"order_detected": true, "items": [{"product_id": %d, "quantity": 2}], "customer_name": "Ram", "note": "Wants two shirts"}',
    )
    def test_extracts_validated_order(self, mock_call):
        product = Product.objects.get(name='Linen Shirt')
        mock_call.return_value = mock_call.return_value % product.id
        response = self.extract()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['order_detected'])
        item = response.data['items'][0]
        self.assertEqual(item['product_id'], product.id)
        self.assertEqual(item['quantity'], 2)
        self.assertEqual(item['price'], '1200')
        self.assertEqual(item['stock'], 4)
        self.assertEqual(response.data['customer_name'], 'Ram')
        self.assertIn(f'[id {product.id} | SKU {product.product_code}] Linen Shirt', mock_call.call_args[0][0])

    @patch(
        'inbox.services.assistant.call_gemini',
        return_value='```json\n{"order_detected": false, "items": [], "customer_name": "", "note": "Just asking"}\n```',
    )
    def test_handles_no_order_and_code_fences(self, mock_call):
        response = self.extract()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['order_detected'])
        self.assertEqual(response.data['items'], [])
        self.assertEqual(response.data['customer_name'], 'Sita')

    @patch(
        'inbox.services.assistant.call_gemini',
        return_value='{"order_detected": true, "items": [{"product_id": 999999, "quantity": 1}], "customer_name": "", "note": ""}',
    )
    def test_drops_unknown_products_and_downgrades_detection(self, mock_call):
        response = self.extract()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['order_detected'])
        self.assertEqual(response.data['items'], [])

    @patch('inbox.services.assistant.call_gemini', return_value='this is not json at all')
    def test_reports_unparseable_answer(self, mock_call):
        response = self.extract()
        self.assertEqual(response.status_code, 502)

    def test_extract_respects_disabled_assistant(self):
        self.tenant.metadata['aiAssistantEnabled'] = False
        self.tenant.save()
        response = self.extract()
        self.assertEqual(response.status_code, 400)


class SizeColorPromptTests(AssistantTestBase):
    def setUp(self):
        super().setUp()
        from core.models import ProductVariant
        shirt = Product.objects.get(name='Linen Shirt')
        shirt.stock_by_size = {'S': 2, 'M': 0, 'L': 4}
        shirt.save()
        ProductVariant.objects.create(
            product=shirt, color_name='Navy Blue', color_hex='#000080',
            stock_by_size={'M': 1, 'L': 3},
        )
        ProductVariant.objects.create(
            product=shirt, color_name='Maroon', color_hex='#800000',
            stock_by_size={},
        )

    def test_suggestion_prompt_includes_sizes_and_colors(self):
        prompt = build_suggestion_prompt(self.convo)
        self.assertIn('sizes [', prompt)
        for token in ('S:2', 'M:0', 'L:4', 'Navy Blue [', 'M:1', 'L:3', 'Maroon'):
            self.assertIn(token, prompt)
        self.assertIn('a count of 0 means out of stock', prompt)

    def test_order_prompt_includes_sizes_and_colors(self):
        from inbox.services.assistant import build_order_prompt
        prompt = build_order_prompt(self.convo)
        self.assertIn('sizes [', prompt)
        for token in ('S:2', 'M:0', 'L:4', 'Navy Blue ['):
            self.assertIn(token, prompt)

    def test_products_without_sizes_render_plain(self):
        Product.objects.filter(name='Linen Shirt').update(stock_by_size={})
        from core.models import ProductVariant
        ProductVariant.objects.all().delete()
        prompt = build_suggestion_prompt(self.convo)
        self.assertNotIn('sizes [', prompt)
        self.assertNotIn('colors:', prompt)


class SummarizeAndSignalTests(AssistantTestBase):
    @patch('inbox.services.assistant.call_gemini', return_value='- Sita asked about the linen shirt price')
    def test_summarize_endpoint(self, mock_call):
        response = self.client.post(f'/api/inbox/conversations/{self.convo.id}/summarize/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('linen shirt', response.data['summary'])
        self.assertIn('CONVERSATION', mock_call.call_args[0][0])

    def test_summarize_is_tenant_scoped(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        response = self.client.post('/api/inbox/conversations/999999/summarize/')
        self.assertEqual(response.status_code, 404)

    @patch(
        'inbox.services.assistant.call_gemini',
        return_value='{"reply": "A team member will help you shortly.", "ordering": false, "order_ready": false, "items": [], "collected": {}, "missing": [], "sentiment": "NEGATIVE", "needs_human": true}',
    )
    def test_advance_parses_sentiment_and_handoff(self, mock_call):
        from inbox.services.assistant import advance_order_conversation
        result = advance_order_conversation(self.convo)
        self.assertEqual(result['sentiment'], 'negative')
        self.assertTrue(result['needs_human'])

    @patch(
        'inbox.services.assistant.call_gemini',
        return_value='{"reply": "ok", "ordering": false, "order_ready": false, "items": [], "collected": {}, "missing": [], "sentiment": "confused", "needs_human": false}',
    )
    def test_advance_defaults_invalid_sentiment_to_neutral(self, mock_call):
        from inbox.services.assistant import advance_order_conversation
        result = advance_order_conversation(self.convo)
        self.assertEqual(result['sentiment'], 'neutral')

    def test_prompts_include_recommendation_rule(self):
        from inbox.services.assistant import build_order_flow_prompt
        self.assertIn('recommend 1-2 fitting products FROM THE CATALOG ONLY', build_suggestion_prompt(self.convo))
        self.assertIn('recommend 1-2 fitting products FROM THE CATALOG ONLY', build_order_flow_prompt(self.convo))


class AssistantVoiceSettingTests(AssistantTestBase):
    def test_default_tone_and_language(self):
        prompt = build_suggestion_prompt(self.convo)
        self.assertIn('warm and natural, like a friendly shop owner', prompt)
        self.assertIn('same language the customer used', prompt)

    def test_configured_tone_and_language(self):
        self.tenant.metadata.update({'aiTone': 'professional', 'aiLanguage': 'english'})
        self.tenant.save()
        self.convo.tenant.refresh_from_db()
        prompt = build_suggestion_prompt(self.convo)
        self.assertIn('polished and professional', prompt)
        self.assertIn('Always reply in clear English.', prompt)

    def test_order_flow_prompt_uses_settings(self):
        from inbox.services.assistant import build_order_flow_prompt
        self.tenant.metadata.update({'aiTone': 'casual', 'aiLanguage': 'nepali'})
        self.tenant.save()
        self.convo.tenant.refresh_from_db()
        prompt = build_order_flow_prompt(self.convo)
        self.assertIn('casual and playful', prompt)
        self.assertIn('romanized Nepali', prompt)

    def test_profile_round_trips_voice_settings(self):
        response = self.client.patch('/api/vendor/profile/', {
            'ai_tone': 'professional', 'ai_language': 'mixed',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['ai_tone'], 'professional')
        self.assertEqual(response.data['ai_language'], 'mixed')
        response = self.client.patch('/api/vendor/profile/', {
            'ai_tone': 'invalid-tone', 'ai_language': 'klingon',
        }, format='json')
        self.assertEqual(response.data['ai_tone'], '')
        self.assertEqual(response.data['ai_language'], '')


class RestrictedTopicsPromptTests(AssistantTestBase):
    def test_restricted_rule_in_prompts(self):
        from inbox.services.assistant import build_order_flow_prompt
        self.tenant.metadata['restrictedTopics'] = ['politics', 'competitor prices']
        self.tenant.save()
        self.convo.tenant.refresh_from_db()
        for prompt in (build_suggestion_prompt(self.convo), build_order_flow_prompt(self.convo)):
            self.assertIn('Never discuss these topics: politics, competitor prices', prompt)

    def test_no_rule_when_unset(self):
        prompt = build_suggestion_prompt(self.convo)
        self.assertNotIn('RESTRICTED', prompt)

    def test_document_knowledge_reaches_prompt(self):
        self.tenant.metadata['knowledgeDocs'] = [{'name': 'faq.txt', 'text': 'COD available everywhere.'}]
        self.tenant.save()
        self.convo.tenant.refresh_from_db()
        prompt = build_suggestion_prompt(self.convo)
        self.assertIn('COD available everywhere.', prompt)
