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
