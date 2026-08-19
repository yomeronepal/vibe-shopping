from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile

FAKE_DETAILS = {
    'title': 'Black Cotton Polo (Kalo Cotton Polo)',
    'description': 'A breathable black cotton polo.',
    'tags': ['polo', 'black', 'cotton'],
    'vibe_tags': ['#Minimalist'],
    'weather_tags': [{'tag': 'Sunny', 'fit': 'Breathable cotton for warm days.'}],
    'category': 'Clothing',
    'subcategory': 'Polo Shirts',
    'social_caption': 'Black cotton polo, only Rs. 1500! DM to order. #polo #kathmandu',
}


class BriefGenerationTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def generate(self, payload):
        return self.client.post('/api/products/generate-details-from-text/', payload, format='json')

    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer.generate_from_brief',
        return_value={'success': True, 'data': FAKE_DETAILS},
    )
    def test_generates_details_from_brief(self, mock_generate, mock_init):
        response = self.generate({
            'brief': 'Black cotton polo t-shirt, sizes M to XL, very breathable',
            'price': 1500,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['title'], FAKE_DETAILS['title'])
        self.assertEqual(response.data['tags'], ['polo', 'black', 'cotton'])
        self.assertIn('DM to order', response.data['social_caption'])
        args, kwargs = mock_generate.call_args
        self.assertIn('Black cotton polo', args[0])
        self.assertEqual(kwargs['price'], 1500.0)

    def test_rejects_missing_or_tiny_brief(self):
        self.assertEqual(self.generate({}).status_code, 400)
        self.assertEqual(self.generate({'brief': 'polo'}).status_code, 400)

    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer.generate_from_brief',
        return_value={'success': False, 'error': 'The AI returned an unreadable answer. Try again.'},
    )
    def test_reports_generation_failure(self, mock_generate, mock_init):
        response = self.generate({'brief': 'A long enough product description here'})
        self.assertEqual(response.status_code, 502)
        self.assertIn('unreadable', response.data['error'])


class CaptionGenerationTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        from core.models import Product
        self.product = Product.objects.create(
            tenant=self.tenant, name='Pashmina Shawl', price=3500, stock=5,
            description='Pure Mustang wool', tags=['shawl', 'wool'],
            status='published', is_active=True,
        )

    def generate(self, payload):
        return self.client.post('/api/products/generate-caption/', payload, format='json')

    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer.generate_caption',
        return_value={'success': True, 'caption': 'Cozy up this winter! DM to order. #pashmina'},
    )
    def test_generates_caption_from_product(self, mock_caption, mock_init):
        response = self.generate({'product_id': self.product.id, 'platform': 'facebook'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('DM to order', response.data['caption'])
        context = mock_caption.call_args[0][0]
        self.assertIn('Pashmina Shawl', context)
        self.assertIn('Rs. 3500', context)
        self.assertIn('Pure Mustang wool', context)

    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer.generate_caption',
        return_value={'success': True, 'caption': 'Big sale this weekend! DM us. #sale'},
    )
    def test_generates_caption_from_free_text(self, mock_caption, mock_init):
        response = self.generate({'context': 'Weekend sale, 20 percent off everything'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('Weekend sale', mock_caption.call_args[0][0])

    def test_rejects_empty_request(self):
        self.assertEqual(self.generate({}).status_code, 400)

    def test_product_is_tenant_scoped(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        from core.models import Product
        foreign = Product.objects.create(tenant=other, name='Foreign', price=10)
        response = self.generate({'product_id': foreign.id})
        self.assertEqual(response.status_code, 404)


class BriefClaudeFallbackTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    @patch('core.services.claude_service.generate_text', return_value='{"title": "Claude Polo", "tags": ["polo"]}')
    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer._generate_text_with_retry',
        side_effect=Exception('429 RESOURCE_EXHAUSTED'),
    )
    def test_brief_falls_back_to_claude(self, mock_gemini, mock_init, mock_claude):
        response = self.client.post('/api/products/generate-details-from-text/', {
            'brief': 'Black cotton polo t-shirt, breathable fabric',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['title'], 'Claude Polo')

    @patch('core.services.claude_service.generate_text', return_value='Winter deals! DM us. #sale')
    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer._generate_text_with_retry',
        side_effect=Exception('429 RESOURCE_EXHAUSTED'),
    )
    def test_caption_falls_back_to_claude(self, mock_gemini, mock_init, mock_claude):
        response = self.client.post('/api/products/generate-caption/', {
            'context': 'Weekend winter sale on shawls',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Winter deals', response.data['caption'])


class ContentGeneratorTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Acme', subdomain='acme',
            metadata={'bio': 'Handmade fashion', 'brandVibe': ['#Chic', '#Local']},
        )
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_prompt_reflects_all_options(self):
        from core.services.gemini_service import build_caption_prompt
        prompt = build_caption_prompt(
            'Winter sale on shawls', platform='tiktok', content_type='promo',
            tone='promotional', language='nepali', brand='Store: Acme',
        )
        self.assertIn('promotional message', prompt)
        self.assertIn('tiktok', prompt)
        self.assertIn('High-energy promotional', prompt)
        self.assertIn('romanized Nepali (Nepali words in Latin script)', prompt)
        self.assertIn('BRAND VOICE', prompt)
        self.assertIn('Store: Acme', prompt)

    def test_prompt_defaults(self):
        from core.services.gemini_service import build_caption_prompt
        prompt = build_caption_prompt('New arrivals')
        self.assertIn('one social-media caption', prompt)
        self.assertIn('Warm and friendly', prompt)
        self.assertIn('English + romanized Nepali mix', prompt)
        self.assertNotIn('BRAND VOICE', prompt)

    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer.generate_caption',
        return_value={'success': True, 'caption': 'Naya announcement! #acme'},
    )
    def test_endpoint_passes_options_and_brand(self, mock_caption, mock_init):
        response = self.client.post('/api/products/generate-caption/', {
            'context': 'Dashain holiday closure notice',
            'content_type': 'announcement',
            'tone': 'professional',
            'language': 'english',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        kwargs = mock_caption.call_args[1]
        self.assertEqual(kwargs['content_type'], 'announcement')
        self.assertEqual(kwargs['tone'], 'professional')
        self.assertEqual(kwargs['language'], 'english')
        self.assertIn('Store: Acme', kwargs['brand'])
        self.assertIn('#Chic', kwargs['brand'])


class ProviderTrackingTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_claude_cost_calculated(self):
        from core.models import AITokenUsage
        row = AITokenUsage.objects.create(
            tenant=self.tenant, ai_provider='claude', operation_type='bot_reply',
            input_tokens=1_000_000, output_tokens=100_000,
        )
        self.assertAlmostEqual(float(row.estimated_cost), 1.0 + 0.5, places=4)

    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer.generate_from_brief',
        return_value={'success': True, 'data': {'title': 'X', 'tags': []}, 'ai_provider': 'claude'},
    )
    def test_brief_fallback_logged_as_claude(self, mock_generate, mock_init):
        from core.models import AITokenUsage
        response = self.client.post('/api/products/generate-details-from-text/', {
            'brief': 'A perfectly nice cotton kurta for summer',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        row = AITokenUsage.objects.get(tenant=self.tenant)
        self.assertEqual(row.ai_provider, 'claude')

    @patch('core.services.gemini_service.GeminiProductAnalyzer.__init__', return_value=None)
    @patch(
        'core.services.gemini_service.GeminiProductAnalyzer.generate_caption',
        return_value={'success': True, 'caption': 'Nice!', 'ai_provider': 'claude'},
    )
    def test_caption_fallback_logged_as_claude(self, mock_caption, mock_init):
        from core.models import AITokenUsage
        response = self.client.post('/api/products/generate-caption/', {
            'context': 'Summer kurta promo',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        row = AITokenUsage.objects.get(tenant=self.tenant)
        self.assertEqual(row.ai_provider, 'claude')
