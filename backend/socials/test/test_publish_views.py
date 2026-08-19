from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, SocialMediaPost, Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphError

TEST_KEY = Fernet.generate_key().decode()

PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0'
    b'\x00\x00\x00\x03\x00\x01_\x1d\x8b\xdb\x00\x00\x00\x00IEND\xaeB`\x82'
)


@override_settings(FERNET_KEY=TEST_KEY, PUBLIC_MEDIA_BASE_URL='https://pub.example.com')
class PublishPostViewTests(APITestCase):
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
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=self.connection,
            page_id='p1', name='Acme Store',
            instagram_account_id='ig1', instagram_username='acme_shop',
        )
        self.page.set_access_token('pt1')
        self.page.save()
        self.product = Product.objects.create(
            tenant=self.tenant, name='Red Jacket', description='Warm jacket',
            price=100, image=SimpleUploadedFile('jacket.png', PNG_BYTES, 'image/png'),
        )

    @patch('socials.services.publisher.MetaGraphClient')
    def test_publish_to_both_platforms(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.publish_page_photo.return_value = {
            'post_id': 'p1_777', 'post_url': 'https://www.facebook.com/p1_777'
        }
        mock_client.publish_instagram_photo.return_value = {
            'post_id': 'media9', 'post_url': 'https://www.instagram.com/p/xyz/'
        }
        response = self.client.post('/api/socials/posts/', {
            'product_id': self.product.id,
            'platforms': ['facebook', 'instagram'],
            'caption': 'New drop',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        results = {r['platform']: r for r in response.data['results']}
        self.assertEqual(results['facebook']['status'], 'posted')
        self.assertEqual(results['instagram']['status'], 'posted')
        self.assertEqual(SocialMediaPost.objects.filter(status='posted').count(), 2)
        ig_call = mock_client.publish_instagram_photo.call_args
        self.assertTrue(ig_call.args[2].startswith('https://pub.example.com/'))

    @patch('socials.services.publisher.MetaGraphClient')
    def test_platform_failure_recorded_not_fatal(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.publish_page_photo.return_value = {
            'post_id': 'p1_777', 'post_url': 'https://www.facebook.com/p1_777'
        }
        mock_client.publish_instagram_photo.side_effect = MetaGraphError('boom', code=1)
        response = self.client.post('/api/socials/posts/', {
            'product_id': self.product.id,
            'platforms': ['facebook', 'instagram'],
            'caption': 'New drop',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        results = {r['platform']: r for r in response.data['results']}
        self.assertEqual(results['facebook']['status'], 'posted')
        self.assertEqual(results['instagram']['status'], 'failed')
        failed = SocialMediaPost.objects.get(platform='instagram')
        self.assertEqual(failed.status, 'failed')
        self.assertTrue(failed.error_message)

    @override_settings(PUBLIC_MEDIA_BASE_URL='')
    @patch('socials.services.publisher.MetaGraphClient')
    def test_instagram_without_public_url_fails_actionably(self, mock_client_cls):
        response = self.client.post('/api/socials/posts/', {
            'product_id': self.product.id,
            'platforms': ['instagram'],
            'caption': 'New drop',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        result = response.data['results'][0]
        self.assertEqual(result['status'], 'failed')
        self.assertIn('PUBLIC_MEDIA_BASE_URL', result['error'])
        mock_client_cls.return_value.publish_instagram_photo.assert_not_called()

    def test_requires_valid_platforms(self):
        response = self.client.post('/api/socials/posts/', {
            'product_id': self.product.id, 'platforms': ['tiktok'],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_unknown_product_404(self):
        response = self.client.post('/api/socials/posts/', {
            'product_id': 99999, 'platforms': ['facebook'],
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_no_connected_page_400(self):
        self.page.delete()
        response = self.client.post('/api/socials/posts/', {
            'product_id': self.product.id, 'platforms': ['facebook'],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_other_tenant_product_404(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Product.objects.create(tenant=other, name='X', price=1)
        response = self.client.post('/api/socials/posts/', {
            'product_id': foreign.id, 'platforms': ['facebook'],
        }, format='json')
        self.assertEqual(response.status_code, 404)
