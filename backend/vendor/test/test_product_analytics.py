from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, SocialMediaPost, Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY)
class ProductAnalyticsTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            name='Store', status='connected',
        )
        self.page.set_access_token('pt1')
        self.page.save()
        self.product = Product.objects.create(tenant=self.tenant, name='Jacket', price=100)
        self.fb_post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            status='posted', platform_post_id='p1_777', caption='fb post',
        )
        self.ig_post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='instagram',
            status='posted', platform_post_id='m5', caption='ig post',
        )
        self.failed_post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            status='failed', caption='broken', error_message='boom',
        )

    @patch('vendor.product_analytics_views.MetaGraphClient')
    def test_analytics_returns_product_posts_and_totals(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.get_post_engagement.return_value = {'likes': 10, 'comments': 2, 'shares': 1}
        mock_client.get_instagram_media_engagement.return_value = {'likes': 5, 'comments': 1, 'shares': 0}
        response = self.client.get(f'/api/vendor/products/{self.product.id}/analytics/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['product']['name'], 'Jacket')
        self.assertEqual(len(response.data['posts']), 3)
        self.assertEqual(response.data['totals']['likes'], 15)
        self.assertEqual(response.data['totals']['comments'], 3)
        self.assertEqual(response.data['totals']['shares'], 1)
        self.assertEqual(response.data['totals']['published_posts'], 2)
        posted = [p for p in response.data['posts'] if p['status'] == 'posted']
        self.assertTrue(all(p['engagement'] for p in posted))

    @patch('vendor.product_analytics_views.MetaGraphClient')
    def test_engagement_cached_between_requests(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.get_post_engagement.return_value = {'likes': 1, 'comments': 0, 'shares': 0}
        mock_client.get_instagram_media_engagement.return_value = {'likes': 1, 'comments': 0, 'shares': 0}
        self.client.get(f'/api/vendor/products/{self.product.id}/analytics/')
        first_calls = mock_client.get_post_engagement.call_count
        self.client.get(f'/api/vendor/products/{self.product.id}/analytics/')
        self.assertEqual(mock_client.get_post_engagement.call_count, first_calls)

    @patch('vendor.product_analytics_views.MetaGraphClient')
    def test_fetch_failure_degrades_gracefully(self, mock_client_cls):
        from socials.services.meta_graph import MetaGraphError
        mock_client = mock_client_cls.return_value
        mock_client.get_post_engagement.side_effect = MetaGraphError('nope')
        mock_client.get_instagram_media_engagement.side_effect = MetaGraphError('nope')
        response = self.client.get(f'/api/vendor/products/{self.product.id}/analytics/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['totals']['likes'], 0)

    def test_cross_tenant_404(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Product.objects.create(tenant=other, name='X', price=1)
        response = self.client.get(f'/api/vendor/products/{foreign.id}/analytics/')
        self.assertEqual(response.status_code, 404)

    @patch('vendor.product_analytics_views.MetaGraphClient')
    def test_refresh_param_bypasses_cache(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.get_post_engagement.return_value = {'likes': 1, 'comments': 0, 'shares': 0}
        mock_client.get_instagram_media_engagement.return_value = {'likes': 0, 'comments': 0, 'shares': 0}
        self.client.get(f'/api/vendor/products/{self.product.id}/analytics/')
        first_calls = mock_client.get_post_engagement.call_count
        self.client.get(f'/api/vendor/products/{self.product.id}/analytics/?refresh=1')
        self.assertGreater(mock_client.get_post_engagement.call_count, first_calls)
