from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Order, OrderItem, Product, SocialMediaPost, Tenant, VendorProfile


class ProductArchiveDeleteTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.product = Product.objects.create(
            tenant=self.tenant, name='Wool Scarf', price=800,
            status='published', is_active=True,
        )

    def test_archive_hides_product_from_storefront(self):
        response = self.client.post(f'/api/vendor/products/{self.product.id}/archive/')
        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, 'archived')
        self.assertFalse(self.product.is_active)

    def test_archive_is_tenant_scoped(self):
        other_tenant = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Product.objects.create(tenant=other_tenant, name='Foreign', price=100)
        response = self.client.post(f'/api/vendor/products/{foreign.id}/archive/')
        self.assertEqual(response.status_code, 404)

    def test_publish_restores_archived_product(self):
        self.product.status = 'archived'
        self.product.is_active = False
        self.product.save()
        response = self.client.post(f'/api/vendor/products/{self.product.id}/publish/')
        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, 'published')
        self.assertTrue(self.product.is_active)

    def test_delete_removes_product_and_detaches_posts(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product,
            platform='facebook', caption='Old promo', status='posted',
        )
        response = self.client.delete(f'/api/vendor/products/{self.product.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Product.objects.filter(id=self.product.id).exists())
        post.refresh_from_db()
        self.assertIsNone(post.product)

    def test_delete_blocked_when_product_has_orders(self):
        order = Order.objects.create(tenant=self.tenant, total_amount=800)
        OrderItem.objects.create(order=order, product=self.product, quantity=1, price=800)
        response = self.client.delete(f'/api/vendor/products/{self.product.id}/')
        self.assertEqual(response.status_code, 409)
        self.assertIn('order history', response.data['error'])
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())
        self.assertTrue(OrderItem.objects.filter(product=self.product).exists())

    def test_delete_is_tenant_scoped(self):
        other_tenant = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Product.objects.create(tenant=other_tenant, name='Foreign', price=100)
        response = self.client.delete(f'/api/vendor/products/{foreign.id}/')
        self.assertEqual(response.status_code, 404)
        self.assertTrue(Product.objects.filter(id=foreign.id).exists())
