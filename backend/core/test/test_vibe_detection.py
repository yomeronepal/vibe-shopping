from django.test import TestCase
from core.models import Product, Tenant, VendorProfile
from django.contrib.auth.models import User
from core.tasks import detect_vibe
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile

class VibeDetectionTests(TestCase):
    def test_detect_vibe_task_success(self):
        print("Starting Vibe Detection Unit Test...")
        
        # Setup Tenant/User
        tenant = Tenant.objects.create(name='Vibe Vendor Test', subdomain='vibe-test', is_active=True)
        user = User.objects.create_user(username='vibe_test_user', email='v@v.com', password='pw')
        VendorProfile.objects.create(user=user, tenant=tenant)

        # Valid 1x1 GIF
        valid_image_data = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
        image = SimpleUploadedFile(name='vibe_test.gif', content=valid_image_data, content_type='image/gif')

        # Create Product
        product = Product.objects.create(
            tenant=tenant,
            name='Vibe Test Product',
            price=50.00,
            image=image,
            status='draft'
        )

        # Mock the Analyzer response
        mock_data = {
            'success': True,
            'data': {
                'vibe_tags': ['Cyberpunk', 'Neon'],
                'confidence_score': 0.98,
                'suggested_price_range': '45-60',
                'tags': ['shirt', 'cool']
            }
        }

        with patch('core.services.gemini_service.GeminiProductAnalyzer.analyze_product_image', return_value=mock_data):
            # Run task synchronously
            detect_vibe(product.id)
            
            # Reload
            product.refresh_from_db()
            meta = product.metadata
            
            # Assertions
            self.assertEqual(meta.get('vibe_tags'), ['Cyberpunk', 'Neon'])
            self.assertEqual(meta.get('confidence_score'), 0.98)
            self.assertEqual(meta.get('suggested_price_range'), '45-60')
            
            # Check tags directly on product field, not in metadata
            self.assertIn('shirt', product.tags)
            self.assertIn('cool', product.tags)

