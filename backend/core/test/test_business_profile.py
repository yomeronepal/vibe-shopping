from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile


class BusinessProfileTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_get_business_profile(self):
        response = self.client.get('/api/business/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Acme')
        self.assertEqual(response.data['subdomain'], 'acme')

    def test_patch_updates_name_and_metadata(self):
        response = self.client.patch(
            '/api/business/',
            {'name': 'Acme 2', 'metadata': {'phone': '9800000000'}},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.name, 'Acme 2')
        self.assertEqual(self.tenant.metadata['phone'], '9800000000')

    def test_patch_cannot_change_subdomain(self):
        self.client.patch('/api/business/', {'subdomain': 'hacked'}, format='json')
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.subdomain, 'acme')

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/business/')
        self.assertEqual(response.status_code, 401)

    def test_user_without_profile_gets_404(self):
        loner = User.objects.create_user(username='loner', password='pass12345')
        token = Token.objects.create(user=loner)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.get('/api/business/')
        self.assertEqual(response.status_code, 404)
