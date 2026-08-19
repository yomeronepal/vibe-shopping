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
