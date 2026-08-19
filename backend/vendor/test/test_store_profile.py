import json

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile

GIF_BYTES = (
    b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff'
    b'\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00'
    b'\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
)


class StoreProfileTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Acme Boutique', subdomain='acme',
            metadata={'bio': 'Old bio', 'niches': ['Fashion'], 'brandVibe': ['#Chic']},
        )
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_get_returns_profile_fields(self):
        response = self.client.get('/api/vendor/profile/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['store_name'], 'Acme Boutique')
        self.assertEqual(response.data['subdomain'], 'acme')
        self.assertEqual(response.data['bio'], 'Old bio')
        self.assertEqual(response.data['category'], 'Fashion')
        self.assertEqual(response.data['brand_vibes'], ['#Chic'])

    def test_patch_updates_name_bio_and_contact(self):
        response = self.client.patch('/api/vendor/profile/', {
            'store_name': 'Acme Luxe',
            'bio': 'New bio',
            'category': 'Streetwear',
            'brand_vibes': json.dumps(['#Bold', '#Urban']),
            'phone': '9800000000',
            'email': 'shop@acme.com',
            'address': 'Thamel, Kathmandu',
        }, format='multipart')
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.name, 'Acme Luxe')
        self.assertEqual(self.tenant.metadata['bio'], 'New bio')
        self.assertEqual(self.tenant.metadata['niches'], ['Streetwear'])
        self.assertEqual(self.tenant.metadata['brandVibe'], ['#Bold', '#Urban'])
        self.assertEqual(self.tenant.metadata['contact']['phone'], '9800000000')
        self.assertEqual(self.tenant.metadata['contact']['address'], 'Thamel, Kathmandu')
        self.assertEqual(response.data['store_name'], 'Acme Luxe')

    def test_patch_ignores_blank_store_name(self):
        response = self.client.patch(
            '/api/vendor/profile/', {'store_name': '   '}, format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.name, 'Acme Boutique')

    def test_patch_partial_update_keeps_other_fields(self):
        response = self.client.patch(
            '/api/vendor/profile/', {'phone': '9811111111'}, format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.metadata['bio'], 'Old bio')
        self.assertEqual(self.tenant.metadata['contact']['phone'], '9811111111')

    def test_patch_saves_logo(self):
        logo = SimpleUploadedFile('logo.gif', GIF_BYTES, content_type='image/gif')
        response = self.client.patch(
            '/api/vendor/profile/', {'logo': logo}, format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertIn('uploads/acme/logo/', self.tenant.metadata['logo'])
        self.assertTrue(response.data['logo'])

    def test_patch_tolerates_invalid_vibes_json(self):
        response = self.client.patch(
            '/api/vendor/profile/', {'brand_vibes': 'not-json'}, format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.metadata['brandVibe'], [])

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.get('/api/vendor/profile/')
        self.assertEqual(response.status_code, 401)
