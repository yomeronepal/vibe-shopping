from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Order, OrderItem, Product, Tenant, VendorProfile


class VendorOrderApiTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.product = Product.objects.create(tenant=self.tenant, name='Red Jacket', price=100)
        self.order = Order.objects.create(
            tenant=self.tenant, total_amount=200, status='pending_delivery',
            customer_name='Sita', customer_phone='9800000000',
        )
        OrderItem.objects.create(order=self.order, product=self.product, quantity=2, price=100)

    def test_list_orders_scoped_to_tenant(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        Order.objects.create(tenant=other, total_amount=50)
        response = self.client.get('/api/vendor/orders/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        data = response.data[0]
        self.assertEqual(data['customer_name'], 'Sita')
        self.assertEqual(data['items'][0]['product_name'], 'Red Jacket')
        self.assertEqual(data['items'][0]['quantity'], 2)

    def test_update_order_status(self):
        response = self.client.patch(
            f'/api/vendor/orders/{self.order.id}/', {'status': 'shipped'}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'shipped')

    def test_update_invalid_status(self):
        response = self.client.patch(
            f'/api/vendor/orders/{self.order.id}/', {'status': 'nonsense'}, format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_cross_tenant_order_404(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Order.objects.create(tenant=other, total_amount=50)
        response = self.client.patch(
            f'/api/vendor/orders/{foreign.id}/', {'status': 'shipped'}, format='json'
        )
        self.assertEqual(response.status_code, 404)

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/vendor/orders/')
        self.assertEqual(response.status_code, 401)
