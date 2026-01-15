from django.test import TestCase
from rest_framework.test import APIClient
from core.models import Product, Tenant, VendorProfile
from django.contrib.auth.models import User
from core.tasks import detect_vibe
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch

class CopyGenerationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Copy Store', subdomain='copy', is_active=True)
        self.user = User.objects.create_user(username='copy_user', email='c@c.com', password='pw')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant)
        self.client.force_login(self.user)
        
        img_data = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
        image = SimpleUploadedFile('test.gif', img_data, 'image/gif')
        self.product = Product.objects.create(tenant=self.tenant, name='Old Title', image=image, price=10.0)

    def test_generate_copy_endpoint(self):
        with patch('core.tasks.detect_vibe.delay') as mock_task:
            resp = self.client.post(f'/api/vendor/products/{self.product.id}/generate-copy/')
            self.assertEqual(resp.status_code, 202)
            mock_task.assert_called_with(self.product.id)

    def test_generate_copy_logic(self):
        mock_response = {
            'success': True,
            'data': {
                'title': 'Red Sari (Rato Sari)',
                'description': 'Beautiful sari. Ramro cha.',
                'tags': ['sari'],
                'seo_keywords': ['red sari', 'rato sari']
            }
        }
        
        with patch('core.services.gemini_service.GeminiProductAnalyzer.analyze_product_image', return_value=mock_response):
            detect_vibe(self.product.id)
            
            self.product.refresh_from_db()
            self.assertEqual(self.product.ai_generated_title, 'Red Sari (Rato Sari)')
            self.assertEqual(self.product.ai_generated_description, 'Beautiful sari. Ramro cha.')
