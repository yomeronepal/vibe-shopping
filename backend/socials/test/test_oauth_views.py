from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.core import signing
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from socials.models import MetaConnection
from socials.views import OAUTH_STATE_SALT

TEST_KEY = Fernet.generate_key().decode()


@override_settings(
    FERNET_KEY=TEST_KEY,
    META_APP_ID='app123',
    META_APP_SECRET='secret123',
    META_OAUTH_REDIRECT_URI='http://localhost:5173/vendor/settings/meta-callback',
)
class OAuthViewTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_connect_url_contains_app_id_and_signed_state(self):
        response = self.client.get('/api/socials/connect-url/')
        self.assertEqual(response.status_code, 200)
        url = response.data['url']
        self.assertIn('client_id=app123', url)
        self.assertIn('facebook.com', url)
        self.assertIn('state=', url)

    def test_connect_url_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/socials/connect-url/')
        self.assertEqual(response.status_code, 401)

    @patch('socials.views.MetaGraphClient')
    def test_callback_saves_connection_and_returns_pages(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.exchange_code.return_value = 'short-token'
        mock_client.get_long_lived_token.return_value = {
            'access_token': 'long-token', 'expires_in': 5184000
        }
        mock_client.get_user_profile.return_value = {'id': 'fb123', 'name': 'Owner'}
        mock_client.list_pages.return_value = [
            {'id': 'p1', 'name': 'Acme Store', 'access_token': 'pt1'}
        ]
        state = signing.dumps({'tenant_id': self.tenant.id}, salt=OAUTH_STATE_SALT)
        response = self.client.post(
            '/api/socials/oauth/callback/',
            {'code': 'the-code', 'state': state},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['pages'], [{'id': 'p1', 'name': 'Acme Store'}])
        connection = MetaConnection.objects.get(tenant=self.tenant)
        self.assertEqual(connection.fb_user_id, 'fb123')
        self.assertEqual(connection.get_access_token(), 'long-token')
        self.assertEqual(connection.status, 'connected')

    def test_callback_rejects_bad_state(self):
        response = self.client.post(
            '/api/socials/oauth/callback/',
            {'code': 'the-code', 'state': 'tampered'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_callback_rejects_state_for_other_tenant(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        state = signing.dumps({'tenant_id': other.id}, salt=OAUTH_STATE_SALT)
        response = self.client.post(
            '/api/socials/oauth/callback/',
            {'code': 'the-code', 'state': state},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
