from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, StockHistory, Tenant, VendorProfile


class StockHistoryTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def create_product(self, stock=6):
        response = self.client.post('/api/vendor/products/', {
            'name': 'Wool Hat', 'price': '300', 'stock': stock,
        })
        return Product.objects.get(id=response.data['id'])

    def test_initial_stock_recorded_on_create(self):
        product = self.create_product(stock=6)
        entry = StockHistory.objects.get(product=product)
        self.assertEqual(entry.delta, 6)
        self.assertEqual(entry.resulting_stock, 6)
        self.assertEqual(entry.reason, 'initial')

    def test_manual_edit_records_delta(self):
        product = self.create_product(stock=6)
        self.client.patch(f'/api/vendor/products/{product.id}/', {'stock': 10}, format='multipart')
        entry = StockHistory.objects.filter(product=product, reason='manual').first()
        self.assertEqual(entry.delta, 4)
        self.assertEqual(entry.resulting_stock, 10)

    def test_pos_order_records_deduction(self):
        product = self.create_product(stock=6)
        self.client.post('/api/vendor/orders/pos/', {
            'items': [{'product_id': product.id, 'quantity': 2}],
            'order_type': 'pos', 'customer_name': 'Ram',
        }, format='json')
        entry = StockHistory.objects.filter(product=product, reason='order').first()
        self.assertEqual(entry.delta, -2)
        self.assertEqual(entry.resulting_stock, 4)
        self.assertIn('Order #', entry.note)

    def test_history_endpoint_lists_entries(self):
        product = self.create_product(stock=6)
        self.client.patch(f'/api/vendor/products/{product.id}/', {'stock': 3}, format='multipart')
        response = self.client.get(f'/api/vendor/products/{product.id}/stock-history/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]['delta'], -3)
        self.assertEqual(response.data[0]['reason'], 'Manual adjustment')

    def test_history_is_tenant_scoped(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Product.objects.create(tenant=other, name='X', price=5)
        response = self.client.get(f'/api/vendor/products/{foreign.id}/stock-history/')
        self.assertEqual(response.status_code, 404)

    def test_no_entry_when_stock_unchanged(self):
        product = self.create_product(stock=6)
        self.client.patch(f'/api/vendor/products/{product.id}/', {'name': 'Renamed'}, format='multipart')
        self.assertEqual(StockHistory.objects.filter(product=product).count(), 1)
