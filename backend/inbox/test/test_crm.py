from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Order, OrderItem, Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer
from inbox.services.crm import apply_collected_contact, build_customer_card
from socials.models import ConnectedPage, MetaConnection


class CrmTestBase(APITestCase):
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
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer,
            platform='facebook', last_message_at=timezone.now(),
        )
        self.product = Product.objects.create(
            tenant=self.tenant, name='Pashmina', price=3500, stock=5,
            status='published', is_active=True,
        )

    def make_order(self, total=3500, status='completed', conversation=True, phone=''):
        order = Order.objects.create(
            tenant=self.tenant, total_amount=total, status=status,
            customer_phone=phone,
            metadata={'source': 'chat_bot', 'conversation_id': self.convo.id} if conversation else {},
        )
        OrderItem.objects.create(order=order, product=self.product, quantity=1, price=total)
        return order


class CustomerCardTests(CrmTestBase):
    def test_card_metrics(self):
        self.make_order(3500)
        self.make_order(1500)
        self.make_order(999, status='cancelled')
        card = build_customer_card(self.customer)
        self.assertEqual(card['order_count'], 2)
        self.assertEqual(card['total_spent'], 5000.0)
        self.assertEqual(card['status'], 'repeat customer')
        self.assertIn('Pashmina', card['product_interests'])
        self.assertIsNotNone(card['last_purchase_at'])
        self.assertIsNotNone(card['last_active_at'])

    def test_orders_linked_by_phone(self):
        self.customer.phone = '9800000000'
        self.customer.save()
        self.make_order(700, conversation=False, phone='9800000000')
        card = build_customer_card(self.customer)
        self.assertEqual(card['order_count'], 1)

    def test_prospect_status_without_orders(self):
        card = build_customer_card(self.customer)
        self.assertEqual(card['status'], 'prospect')
        self.assertEqual(card['total_spent'], 0)


class CustomerApiTests(CrmTestBase):
    def test_get_card(self):
        response = self.client.get(f'/api/inbox/customers/{self.customer.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Sita')

    def test_patch_contact_and_tags(self):
        response = self.client.patch(f'/api/inbox/customers/{self.customer.id}/', {
            'phone': '9800000001', 'email': 'sita@example.com',
            'location': 'Patan', 'notes': 'Prefers COD',
            'tags': ['VIP', 'VIP', ''],
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.phone, '9800000001')
        self.assertEqual(self.customer.notes, 'Prefers COD')
        self.assertEqual(self.customer.tags, ['VIP'])

    def test_tenant_scoped(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = Customer.objects.create(
            tenant=other, platform='facebook', platform_user_id='psid2',
        )
        response = self.client.get(f'/api/inbox/customers/{foreign.id}/')
        self.assertEqual(response.status_code, 404)


class AutoPopulateTests(CrmTestBase):
    def test_collected_fields_fill_empty_contact(self):
        updates = apply_collected_contact(self.customer, {
            'Full name': 'Sita Sharma',
            'Phone number': '9812345678',
            'Delivery address': 'Radhe Radhe, Bhaktapur',
            'Email': 'sita@mail.com',
        })
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.phone, '9812345678')
        self.assertEqual(self.customer.location, 'Radhe Radhe, Bhaktapur')
        self.assertEqual(self.customer.email, 'sita@mail.com')
        self.assertIn('phone', updates)

    def test_existing_values_not_overwritten(self):
        self.customer.phone = '9811111111'
        self.customer.save()
        apply_collected_contact(self.customer, {'Phone number': '9822222222'})
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.phone, '9811111111')


class CustomerListTests(CrmTestBase):
    def setUp(self):
        super().setUp()
        Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid2',
            name='Ram Thapa', phone='9811111111', location='Pokhara',
        )

    def test_lists_customers_with_metrics(self):
        self.make_order(3500)
        response = self.client.get('/api/inbox/customers/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        sita = next(c for c in response.data if c['name'] == 'Sita')
        self.assertEqual(sita['total_spent'], 3500.0)
        self.assertEqual(len(sita['recent_orders']), 1)
        self.assertIn('Pashmina', sita['recent_orders'][0]['summary'])

    def test_search_by_phone_and_location(self):
        response = self.client.get('/api/inbox/customers/?q=9811')
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Ram Thapa')
        response = self.client.get('/api/inbox/customers/?q=pokhara')
        self.assertEqual(len(response.data), 1)

    def test_tenant_scoped_list(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        Customer.objects.create(tenant=other, platform='facebook', platform_user_id='x1')
        response = self.client.get('/api/inbox/customers/')
        self.assertEqual(len(response.data), 2)
