from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection


class PageImportTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Import Shop', subdomain='importshop', metadata={})
        self.user = User.objects.create_user(username='import_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fbimp')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='pimp',
            name='Import', status='connected',
        )
        self.page.set_access_token('pt-imp')
        self.page.save()

    @patch('socials.views.download_page_picture', return_value='uploads/importshop/logo/page-logo.jpg')
    @patch('socials.services.meta_graph.MetaGraphClient.get')
    def test_import_fills_empty_fields(self, mock_get, mock_download):
        mock_get.return_value = {
            'about': 'Handmade goods from Bhaktapur',
            'phone': '9800000009',
            'single_line_address': 'Suryabinayak, Bhaktapur',
            'picture': {'data': {'url': 'https://cdn.example/pic.jpg'}},
        }
        response = self.client.post('/api/socials/pages/import-profile/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            sorted(response.data['imported']), ['address', 'bio', 'logo', 'phone'],
        )
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.metadata['bio'], 'Handmade goods from Bhaktapur')
        self.assertEqual(self.tenant.metadata['contact']['phone'], '9800000009')

    @patch('socials.services.meta_graph.MetaGraphClient.get')
    def test_import_never_overwrites_existing(self, mock_get):
        self.tenant.metadata = {'bio': 'My own bio', 'contact': {'phone': '981'}}
        self.tenant.save()
        mock_get.return_value = {'about': 'FB about', 'phone': '985'}
        response = self.client.post('/api/socials/pages/import-profile/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['imported'], [])
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.metadata['bio'], 'My own bio')

    def test_requires_connected_page(self):
        self.page.status = 'disconnected'
        self.page.save()
        response = self.client.post('/api/socials/pages/import-profile/')
        self.assertEqual(response.status_code, 400)
