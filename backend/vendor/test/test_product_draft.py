from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, Tenant, VendorProfile


class ProductDraftTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def create_product(self, **extra):
        payload = {'name': 'Linen Shirt', 'price': '1200', 'stock': 4, **extra}
        return self.client.post('/api/vendor/products/', payload)

    def test_create_defaults_to_published_and_visible(self):
        response = self.create_product()
        self.assertEqual(response.status_code, 201)
        product = Product.objects.get(id=response.data['id'])
        self.assertEqual(product.status, 'published')
        self.assertTrue(product.is_active)

    def test_create_draft_is_hidden_from_storefront(self):
        response = self.create_product(status='draft')
        self.assertEqual(response.status_code, 201)
        product = Product.objects.get(id=response.data['id'])
        self.assertEqual(product.status, 'draft')
        self.assertFalse(product.is_active)

    def test_create_rejects_unknown_status(self):
        response = self.create_product(status='archived')
        self.assertEqual(response.status_code, 400)

    def test_draft_allows_missing_image(self):
        response = self.create_product(status='draft')
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(Product.objects.get(id=response.data['id']).image.name or None)

    def test_publish_action_activates_draft(self):
        product = Product.objects.create(
            tenant=self.tenant, name='Draft Cap', price=500,
            status='draft', is_active=False,
        )
        response = self.client.post(f'/api/vendor/products/{product.id}/publish/')
        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.status, 'published')
        self.assertTrue(product.is_active)

    def test_publish_action_is_tenant_scoped(self):
        other_tenant = Tenant.objects.create(name='Other', subdomain='other')
        product = Product.objects.create(
            tenant=other_tenant, name='Foreign', price=500,
            status='draft', is_active=False,
        )
        response = self.client.post(f'/api/vendor/products/{product.id}/publish/')
        self.assertEqual(response.status_code, 404)

    def test_drafts_appear_in_vendor_list(self):
        self.create_product(status='draft', name='Hidden Gem')
        response = self.client.get('/api/vendor/products/')
        items = response.data.get('results', response.data)
        names = [item['name'] for item in items]
        self.assertIn('Hidden Gem', names)
