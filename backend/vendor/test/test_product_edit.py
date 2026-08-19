from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, SocialMediaPost, Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphError

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY)
class ProductEditTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.product = Product.objects.create(
            tenant=self.tenant, name='Old Name', description='Old desc',
            price=500, stock=3, status='published', is_active=True,
        )

    def test_patch_updates_core_fields(self):
        response = self.client.patch(
            f'/api/vendor/products/{self.product.id}/',
            {'name': 'New Name', 'description': 'New desc', 'price': '900', 'stock': 7},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, 'New Name')
        self.assertEqual(self.product.description, 'New desc')
        self.assertEqual(float(self.product.price), 900.0)
        self.assertEqual(self.product.stock, 7)

    def test_patch_updates_tags_as_lists(self):
        response = self.client.patch(
            f'/api/vendor/products/{self.product.id}/',
            {'tags': '["summer", "linen"]', 'vibe_tags': '["#Fresh"]'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.tags, ['summer', 'linen'])
        self.assertEqual(self.product.vibe_tags, ['#Fresh'])

    def test_patch_is_tenant_scoped(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Product.objects.create(tenant=other, name='Foreign', price=100)
        response = self.client.patch(
            f'/api/vendor/products/{foreign.id}/', {'name': 'Hacked'}, format='multipart',
        )
        self.assertEqual(response.status_code, 404)


@override_settings(FERNET_KEY=TEST_KEY)
class ProductSocialSyncTests(APITestCase):
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
        self.product = Product.objects.create(
            tenant=self.tenant, name='Silk Tie', description='Updated silk tie desc',
            price=700, status='published', is_active=True,
        )

    def make_post(self, **extra):
        defaults = {
            'tenant': self.tenant, 'product': self.product,
            'platform': 'facebook', 'caption': 'old caption',
            'status': 'posted', 'platform_post_id': 'fbpost1',
        }
        defaults.update(extra)
        return SocialMediaPost.objects.create(**defaults)

    @patch('socials.services.meta_graph.MetaGraphClient.update_page_post_caption', return_value=True)
    def test_sync_updates_facebook_posts(self, mock_update):
        post = self.make_post()
        response = self.client.post(f'/api/vendor/products/{self.product.id}/sync-social/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['status'], 'updated')
        mock_update.assert_called_once_with('fbpost1', 'pt1', 'Updated silk tie desc')
        post.refresh_from_db()
        self.assertEqual(post.caption, 'Updated silk tie desc')

    @patch('socials.services.meta_graph.MetaGraphClient.update_page_post_caption', return_value=True)
    def test_sync_accepts_custom_caption(self, mock_update):
        self.make_post()
        response = self.client.post(
            f'/api/vendor/products/{self.product.id}/sync-social/',
            {'caption': 'Flash sale!'},
        )
        self.assertEqual(response.status_code, 200)
        mock_update.assert_called_once_with('fbpost1', 'pt1', 'Flash sale!')

    @patch('socials.services.meta_graph.MetaGraphClient.update_page_post_caption')
    def test_sync_skips_instagram_stories_and_simulated(self, mock_update):
        self.make_post(platform='instagram', platform_post_id='ig1')
        self.make_post(post_format='story', platform_post_id='fbstory1')
        self.make_post(platform_post_id='local-abc')
        response = self.client.post(f'/api/vendor/products/{self.product.id}/sync-social/')
        self.assertEqual(response.status_code, 200)
        statuses = [r['status'] for r in response.data['results']]
        self.assertEqual(statuses, ['skipped', 'skipped', 'skipped'])
        mock_update.assert_not_called()

    @patch(
        'socials.services.meta_graph.MetaGraphClient.update_page_post_caption',
        side_effect=MetaGraphError('nope'),
    )
    def test_sync_reports_graph_failures(self, mock_update):
        post = self.make_post()
        response = self.client.post(f'/api/vendor/products/{self.product.id}/sync-social/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['status'], 'failed')
        post.refresh_from_db()
        self.assertEqual(post.caption, 'old caption')

    def test_sync_requires_connected_page(self):
        self.page.status = 'disconnected'
        self.page.save()
        response = self.client.post(f'/api/vendor/products/{self.product.id}/sync-social/')
        self.assertEqual(response.status_code, 400)
