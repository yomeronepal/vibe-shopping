from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, VendorProfile


class ThemeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create tenant and vendor user
        self.tenant = Tenant.objects.create(
            name='Theme Test Shop',
            subdomain='theme-test',
            is_active=True
        )
        self.vendor_user = User.objects.create_user(
            username='theme_vendor',
            email='theme@test.com',
            password='testpass123'
        )
        VendorProfile.objects.create(
            user=self.vendor_user,
            tenant=self.tenant
        )

    def test_list_themes(self):
        """Test that themes can be listed publicly."""
        response = self.client.get('/api/vendor/themes/')
        
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 3)  # 3 themes defined
        
        # Check theme structure
        theme_ids = [t['id'] for t in response.data]
        self.assertIn('neon-vibe', theme_ids)
        self.assertIn('minimal', theme_ids)
        self.assertIn('warm-cozy', theme_ids)

    def test_get_theme_by_id(self):
        """Test retrieving a specific theme."""
        response = self.client.get('/api/vendor/themes/neon-vibe/')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], 'neon-vibe')
        self.assertEqual(response.data['name'], 'Neon Vibe')
        self.assertIn('colors', response.data)
        self.assertEqual(response.data['colors']['primary'], '#8A2BE2')

    def test_get_theme_not_found(self):
        """Test 404 for non-existent theme."""
        response = self.client.get('/api/vendor/themes/non-existent/')
        
        self.assertEqual(response.status_code, 404)

    def test_theme_has_required_fields(self):
        """Test that themes have all required fields."""
        response = self.client.get('/api/vendor/themes/')
        
        for theme in response.data:
            self.assertIn('id', theme)
            self.assertIn('name', theme)
            self.assertIn('description', theme)
            self.assertIn('colors', theme)
            self.assertIn('gradient', theme)
            self.assertIn('keywords', theme)
            
            # Check colors structure
            colors = theme['colors']
            self.assertIn('primary', colors)
            self.assertIn('accent', colors)
            self.assertIn('background', colors)
            self.assertIn('surface', colors)
            self.assertIn('text', colors)

    def test_logo_analysis_requires_auth(self):
        """Test that logo analysis requires authentication."""
        response = self.client.post('/api/vendor/onboarding/analyze-logo/')
        
        self.assertEqual(response.status_code, 401)

    def test_logo_analysis_requires_logo(self):
        """Test that logo analysis requires a logo file."""
        self.client.force_login(self.vendor_user)
        
        response = self.client.post('/api/vendor/onboarding/analyze-logo/')
        
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)
