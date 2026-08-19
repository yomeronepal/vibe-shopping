from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Order, OrderItem, Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphError
from vendor.order_views import compose_invoice_text

TEST_KEY = Fernet.generate_key().decode()
IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@override_settings(FERNET_KEY=TEST_KEY, CHANNEL_LAYERS=IN_MEMORY_LAYER)
class OrderInvoiceTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme Boutique', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.product = Product.objects.create(
            tenant=self.tenant, name='Linen Shirt', price=1200, stock=10,
            status='published', is_active=True,
        )
        self.order = Order.objects.create(
            tenant=self.tenant, total_amount=2400, status='pending_delivery',
            order_type='pos', payment_method='cash', customer_name='Sita',
        )
        OrderItem.objects.create(order=self.order, product=self.product, quantity=2, price=1200)


class VendorOrderCreateTests(OrderInvoiceTestBase):
    def test_pos_create_computes_totals_and_decrements_stock(self):
        response = self.client.post('/api/vendor/orders/pos/', {
            'items': [{'product_id': self.product.id, 'quantity': 3}],
            'order_type': 'pos',
            'payment_method': 'cash',
            'customer_name': 'Ram',
            'customer_phone': '9800000000',
            'status': 'pending_delivery',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(id=response.data['order_id'])
        self.assertEqual(float(order.total_amount), 3600.0)
        self.assertEqual(order.status, 'pending_delivery')
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)

    def test_pos_create_defaults_to_completed(self):
        response = self.client.post('/api/vendor/orders/pos/', {
            'items': [{'product_id': self.product.id, 'quantity': 1}],
            'order_type': 'pos',
            'customer_name': 'Ram',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Order.objects.get(id=response.data['order_id']).status, 'completed')

    def test_pos_create_rejects_insufficient_stock(self):
        response = self.client.post('/api/vendor/orders/pos/', {
            'items': [{'product_id': self.product.id, 'quantity': 99}],
            'order_type': 'pos',
            'customer_name': 'Ram',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_order_detail_returns_items(self):
        response = self.client.get(f'/api/vendor/orders/{self.order.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['items'][0]['product_name'], 'Linen Shirt')

    def test_order_detail_is_tenant_scoped(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Order.objects.create(tenant=other, total_amount=10)
        response = self.client.get(f'/api/vendor/orders/{foreign.id}/')
        self.assertEqual(response.status_code, 404)


class InvoiceTextTests(OrderInvoiceTestBase):
    def test_compose_invoice_text_contains_lines_and_total(self):
        text = compose_invoice_text(self.order)
        self.assertIn('Invoice #%d' % self.order.id, text)
        self.assertIn('Acme Boutique', text)
        self.assertIn('2 x Linen Shirt', text)
        self.assertIn('Total: Rs. 2,400', text)
        self.assertIn('Payment: Cash', text)


class SendInvoiceTests(OrderInvoiceTestBase):
    def setUp(self):
        super().setUp()
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            name='Store', status='connected',
        )
        self.page.set_access_token('pt1')
        self.page.save()
        customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )

    def send(self, order_id=None, conversation_id=None):
        return self.client.post(
            f'/api/vendor/orders/{order_id or self.order.id}/send-invoice/',
            {'conversation_id': conversation_id or self.convo.id},
            format='json',
        )

    @patch('socials.services.meta_graph.MetaGraphClient.send_message', return_value='mid1')
    def test_send_invoice_delivers_and_stores_message(self, mock_send):
        response = self.send()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['sent'])
        args = mock_send.call_args[0]
        self.assertEqual(args[0], 'p1')
        self.assertEqual(args[2], 'psid1')
        self.assertIn('Total: Rs. 2,400', args[3])
        message = Message.objects.get(conversation=self.convo, direction='out')
        self.assertIn('Invoice #%d' % self.order.id, message.text)

    def test_send_invoice_requires_conversation(self):
        response = self.client.post(
            f'/api/vendor/orders/{self.order.id}/send-invoice/', {}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_send_invoice_rejects_foreign_conversation(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign_customer = Customer.objects.create(
            tenant=other, platform='facebook', platform_user_id='psid2',
        )
        foreign_connection = MetaConnection.objects.create(tenant=other, fb_user_id='fb2')
        foreign_page = ConnectedPage.objects.create(
            tenant=other, connection=foreign_connection, page_id='p2',
            name='Other Store', status='connected',
        )
        foreign_convo = Conversation.objects.create(
            tenant=other, page=foreign_page, customer=foreign_customer, platform='facebook',
        )
        response = self.send(conversation_id=foreign_convo.id)
        self.assertEqual(response.status_code, 400)

    @patch(
        'socials.services.meta_graph.MetaGraphClient.send_message',
        side_effect=MetaGraphError('window closed', code=10),
    )
    def test_send_invoice_reports_closed_window(self, mock_send):
        response = self.send()
        self.assertEqual(response.status_code, 400)
        self.assertIn('24-hour', response.data['error'])
        self.assertFalse(Message.objects.filter(conversation=self.convo, direction='out').exists())
