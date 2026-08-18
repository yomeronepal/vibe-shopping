from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphError

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY, META_APP_ID='app123', META_APP_SECRET='s')
class PageViewTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.connection = MetaConnection.objects.create(
            tenant=self.tenant, fb_user_id='fb123', status='connected'
        )
        self.connection.set_access_token('long-token')
        self.connection.save()

    @patch('socials.views.MetaGraphClient')
    def test_connect_page_stores_token_and_instagram(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.list_pages.return_value = [
            {'id': 'p1', 'name': 'Acme Store', 'access_token': 'pt1'}
        ]
        mock_client.subscribe_page.return_value = True
        mock_client.get_instagram_account.return_value = {
            'id': 'ig1', 'username': 'acme_store'
        }
        response = self.client.post('/api/socials/pages/p1/connect/')
        self.assertEqual(response.status_code, 201)
        page = ConnectedPage.objects.get(page_id='p1')
        self.assertEqual(page.get_access_token(), 'pt1')
        self.assertEqual(page.instagram_username, 'acme_store')
        self.assertEqual(page.status, 'connected')
        self.assertNotIn('access_token_encrypted', response.data)

    @patch('socials.views.MetaGraphClient')
    def test_connect_unknown_page_returns_404(self, mock_client_cls):
        mock_client_cls.return_value.list_pages.return_value = []
        response = self.client.post('/api/socials/pages/nope/connect/')
        self.assertEqual(response.status_code, 404)

    def test_connect_without_connection_returns_400(self):
        self.connection.delete()
        response = self.client.post('/api/socials/pages/p1/connect/')
        self.assertEqual(response.status_code, 400)

    def test_list_pages_scoped_to_tenant(self):
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=self.connection,
            page_id='p1', name='Acme Store'
        )
        other_tenant = Tenant.objects.create(name='Other', subdomain='other')
        other_conn = MetaConnection.objects.create(tenant=other_tenant, fb_user_id='x')
        ConnectedPage.objects.create(
            tenant=other_tenant, connection=other_conn, page_id='p2', name='Other'
        )
        response = self.client.get('/api/socials/pages/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['page_id'], 'p1')

    @patch('socials.views.MetaGraphClient')
    def test_disconnect_page(self, mock_client_cls):
        mock_client_cls.return_value.unsubscribe_page.return_value = True
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=self.connection,
            page_id='p1', name='Acme Store'
        )
        page.set_access_token('pt1')
        page.save()
        response = self.client.post('/api/socials/pages/p1/disconnect/')
        self.assertEqual(response.status_code, 200)
        page.refresh_from_db()
        self.assertEqual(page.status, 'disconnected')

    @patch('socials.views.MetaGraphClient')
    def test_connect_page_returns_502_on_graph_error(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.list_pages.return_value = [
            {'id': 'p1', 'name': 'Acme Store', 'access_token': 'pt1'}
        ]
        mock_client.subscribe_page.side_effect = MetaGraphError('boom', code=1)
        response = self.client.post('/api/socials/pages/p1/connect/')
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('detail', response.data)
        self.assertNotIn('boom', str(response.data))
