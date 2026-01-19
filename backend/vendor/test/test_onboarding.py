from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from core.models import Tenant, VendorProfile
from django.core.files.uploadedfile import SimpleUploadedFile


class OnboardingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create tenant and vendor user
        self.tenant = Tenant.objects.create(
            name='Test Shop',
            subdomain='test-shop',
            is_active=False
        )
        self.vendor_user = User.objects.create_user(
            username='vendor_test',
            email='vendor@test.com',
            password='testpass123'
        )
        VendorProfile.objects.create(
            user=self.vendor_user,
            tenant=self.tenant
        )

    def test_get_onboarding_status_new_vendor(self):
        """Test that a fresh vendor starts at step 1."""
        self.client.force_login(self.vendor_user)
        
        response = self.client.get('/api/vendor/onboarding/status/')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['current_step'], 1)
        self.assertFalse(response.data['profile_complete'])
        self.assertEqual(response.data['kyc_status'], 'pending')
        self.assertFalse(response.data['is_complete'])

    def test_save_profile_complete(self):
        """Test that profile data is saved to tenant metadata."""
        self.client.force_login(self.vendor_user)
        
        response = self.client.post('/api/vendor/onboarding/profile/', {
            'bio': 'This is my awesome shop',
            'category': 'Fashion & Apparel',
            'brand_vibes': '["Minimal", "Luxury"]',
            'ai_persona': '75'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['message'], 'Profile saved successfully')
        
        # Verify data in database
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.metadata.get('bio'), 'This is my awesome shop')
        self.assertEqual(self.tenant.metadata.get('niches'), ['Fashion & Apparel'])

    def test_save_profile_with_logo_upload(self):
        """Test that logo file is saved during profile step."""
        self.client.force_login(self.vendor_user)
        
        # Create a minimal valid PNG file (1x1 transparent pixel)
        import io
        from PIL import Image
        
        img = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
        img_io = io.BytesIO()
        img.save(img_io, format='PNG')
        img_io.seek(0)
        
        logo = SimpleUploadedFile('logo.png', img_io.read(), content_type='image/png')
        
        response = self.client.post('/api/vendor/onboarding/profile/', {
            'bio': 'Test shop with logo',
            'logo': logo
        }, format='multipart')
        
        self.assertEqual(response.status_code, 200)
        
        # Verify logo path is saved
        self.tenant.refresh_from_db()
        self.assertIn('logo', self.tenant.metadata)

    def test_submit_kyc_documents(self):
        """Test that KYC data is saved correctly."""
        self.client.force_login(self.vendor_user)
        
        response = self.client.post('/api/vendor/onboarding/kyc/', {
            'pan_vat_number': '600123456',
            'business_reg_no': '12345-678-90'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['kyc_status'], 'submitted')
        
        # Verify data in database
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.metadata.get('panVatNumber'), '600123456')
        kyc_data = self.tenant.metadata.get('onboarding', {}).get('kyc', {})
        self.assertEqual(kyc_data.get('status'), 'submitted')

    def test_complete_onboarding_activates_tenant(self):
        """Test that completing onboarding activates the tenant."""
        self.client.force_login(self.vendor_user)
        
        # Ensure tenant is inactive
        self.assertFalse(self.tenant.is_active)
        
        response = self.client.post('/api/vendor/onboarding/complete/', {
            'theme': 'neon-vibe'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['tenant_active'])
        
        # Verify tenant is now active
        self.tenant.refresh_from_db()
        self.assertTrue(self.tenant.is_active)
        self.assertEqual(self.tenant.metadata.get('shopTheme'), 'neon-vibe')
        self.assertTrue(self.tenant.metadata.get('onboarding', {}).get('is_complete'))

    def test_skip_socials(self):
        """Test that social media connection can be skipped."""
        self.client.force_login(self.vendor_user)
        
        response = self.client.post('/api/vendor/onboarding/skip-socials/')
        
        self.assertEqual(response.status_code, 200)
        
        # Verify flag is set
        self.tenant.refresh_from_db()
        self.assertTrue(self.tenant.metadata.get('onboarding', {}).get('socials_skipped'))

    def test_onboarding_requires_authentication(self):
        """Test that unauthenticated users cannot access onboarding."""
        response = self.client.get('/api/vendor/onboarding/status/')
        self.assertEqual(response.status_code, 401)

    def test_full_onboarding_flow(self):
        """Test the complete onboarding flow from start to finish."""
        self.client.force_login(self.vendor_user)
        
        # Step 1: Profile
        response = self.client.post('/api/vendor/onboarding/profile/', {
            'bio': 'My amazing store',
            'category': 'Fashion & Apparel',
            'brand_vibes': '["Streetwear", "Bold"]',
            'ai_persona': '80'
        })
        self.assertEqual(response.status_code, 200)
        
        # Step 2: KYC
        response = self.client.post('/api/vendor/onboarding/kyc/', {
            'pan_vat_number': '600111222'
        })
        self.assertEqual(response.status_code, 200)
        
        # Step 3: Skip socials
        response = self.client.post('/api/vendor/onboarding/skip-socials/')
        self.assertEqual(response.status_code, 200)
        
        # Step 4: Complete
        response = self.client.post('/api/vendor/onboarding/complete/', {
            'theme': 'minimal'
        })
        self.assertEqual(response.status_code, 200)
        
        # Verify final status
        response = self.client.get('/api/vendor/onboarding/status/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_complete'])
        self.assertEqual(response.data['current_step'], 4)
        
        # Verify tenant is active
        self.tenant.refresh_from_db()
        self.assertTrue(self.tenant.is_active)
