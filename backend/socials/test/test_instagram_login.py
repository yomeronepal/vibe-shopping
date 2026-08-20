from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection
from socials.services.instagram_login import build_instagram_connect_url, validate_instagram_state
from socials.services.meta_graph import INSTAGRAM_GRAPH_BASE_URL, GRAPH_BASE_URL, graph_client_for


IG_SETTINGS = {
    'INSTAGRAM_LOGIN_APP_ID': 'ig-app-1',
    'INSTAGRAM_LOGIN_APP_SECRET': 'ig-secret-1',
}


class InstagramLoginTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='IG Only Store', subdomain='igonly', metadata={})
        self.user = User.objects.create_user(username='ig_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')


class ConnectUrlTests(InstagramLoginTestBase):
    def test_unconfigured_returns_setup_guidance(self):
        response = self.client.get('/api/socials/instagram/connect-url/')
        self.assertEqual(response.status_code, 501)
        self.assertIn('Instagram Login is not configured', response.data['error'])

    @override_settings(**IG_SETTINGS)
    def test_configured_returns_authorize_url(self):
        response = self.client.get('/api/socials/instagram/connect-url/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('instagram.com/oauth/authorize', response.data['url'])
        self.assertIn('instagram_business_manage_messages', response.data['url'])

    @override_settings(**IG_SETTINGS)
    def test_state_round_trips_for_tenant(self):
        url = build_instagram_connect_url(self.tenant)
        state = url.split('state=')[1]
        from urllib.parse import unquote
        self.assertTrue(validate_instagram_state(unquote(state), self.tenant))


class CallbackTests(InstagramLoginTestBase):
    @override_settings(**IG_SETTINGS)
    @patch('socials.services.instagram_login.subscribe_instagram_webhooks', return_value=True)
    @patch('socials.views.exchange_instagram_code' if False else 'socials.services.instagram_login.exchange_instagram_code')
    @patch('socials.services.instagram_login.fetch_instagram_profile')
    def test_callback_creates_direct_connection(self, mock_profile, mock_exchange, mock_subscribe):
        mock_exchange.return_value = {'access_token': 'ig-long-token', 'expires_in': 5183944, 'user_id': '178414'}
        mock_profile.return_value = {'id': '178414', 'username': 'igonlystore', 'name': 'IG Only Store'}
        state_url = build_instagram_connect_url(self.tenant)
        from urllib.parse import unquote
        state = unquote(state_url.split('state=')[1])
        response = self.client.post('/api/socials/instagram/oauth/callback/', {'code': 'authcode', 'state': state})
        self.assertEqual(response.status_code, 201)
        page = ConnectedPage.objects.get(tenant=self.tenant)
        self.assertEqual(page.connection_type, 'instagram_direct')
        self.assertEqual(page.page_id, '178414')
        self.assertEqual(page.instagram_account_id, '178414')
        self.assertEqual(page.instagram_username, 'igonlystore')
        self.assertEqual(page.get_access_token(), 'ig-long-token')
        mock_subscribe.assert_called_once_with('178414', 'ig-long-token')

    @override_settings(**IG_SETTINGS)
    def test_callback_rejects_bad_state(self):
        response = self.client.post('/api/socials/instagram/oauth/callback/', {'code': 'x', 'state': 'garbage'})
        self.assertEqual(response.status_code, 400)


class HostRoutingTests(InstagramLoginTestBase):
    def make_page(self, connection_type):
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id=f'u-{connection_type}')
        return ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection,
            page_id=f'p-{connection_type}', name='X',
            connection_type=connection_type,
            instagram_account_id='999' if connection_type == 'instagram_direct' else '',
            status='connected',
        )

    def test_instagram_direct_uses_instagram_host(self):
        page = self.make_page('instagram_direct')
        self.assertEqual(graph_client_for(page).base_url, INSTAGRAM_GRAPH_BASE_URL)

    def test_facebook_page_uses_facebook_host(self):
        page = self.make_page('facebook_page')
        self.assertEqual(graph_client_for(page).base_url, GRAPH_BASE_URL)

    def test_webhook_resolver_finds_direct_account(self):
        from inbox.services.ingest import resolve_page

        page = self.make_page('instagram_direct')
        self.assertEqual(resolve_page('instagram', '999').id, page.id)


class TokenRefreshTests(InstagramLoginTestBase):
    @patch('socials.services.instagram_login.refresh_instagram_token', return_value='new-token')
    def test_refresh_task_updates_direct_pages(self, mock_refresh):
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='ig-1')
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='ig-page-1',
            name='IG', connection_type='instagram_direct', status='connected',
        )
        page.set_access_token('old-token')
        page.save()
        from socials.tasks import refresh_instagram_tokens

        result = refresh_instagram_tokens()
        self.assertEqual(result, 1)
        page.refresh_from_db()
        self.assertEqual(page.get_access_token(), 'new-token')
