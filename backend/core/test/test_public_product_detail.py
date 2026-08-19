from django.test import TestCase

from core.models import Product, Tenant


class PublicProductDetailTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.active = Product.objects.create(
            tenant=self.tenant, name='Jacket', price=100, is_active=True
        )
        self.inactive = Product.objects.create(
            tenant=self.tenant, name='Hidden', price=50, is_active=False
        )

    def test_detail_available_without_tenant_context(self):
        response = self.client.get(f'/api/public/products/{self.active.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['name'], 'Jacket')

    def test_inactive_product_hidden(self):
        response = self.client.get(f'/api/public/products/{self.inactive.id}/')
        self.assertEqual(response.status_code, 404)

    def test_list_without_tenant_stays_empty(self):
        response = self.client.get('/api/public/products/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        results = payload.get('results', payload)
        self.assertEqual(results, [])
