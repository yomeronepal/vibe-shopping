from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import format_order_product_line, format_product_line
from inbox.services.chat_orders import create_chat_order, update_chat_order
from socials.models import ConnectedPage, MetaConnection


class ServiceSellingTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Lens Studio', subdomain='lens')
        self.user = User.objects.create_user(username='lens_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fblens')
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='plens',
            name='Lens', status='connected',
        )
        customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-l', name='Bina',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=page, customer=customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )
        Message.objects.create(
            conversation=self.convo, direction='in', text='Wedding photography book garna man cha',
            platform_message_id='ml1', sent_at=timezone.now(),
        )
        self.shoot = Product.objects.create(
            tenant=self.tenant, name='Wedding Photography Package', price=25000,
            stock=0, item_type='service', status='published', is_active=True,
            description='Full-day coverage with edited album',
        )
        self.frame = Product.objects.create(
            tenant=self.tenant, name='Photo Frame', price=800, stock=4,
            status='published', is_active=True,
        )


class ServiceCatalogTests(ServiceSellingTestBase):
    def test_service_line_marked_bookable_not_out_of_stock(self):
        line = format_product_line(self.shoot)
        self.assertIn('SERVICE — always bookable', line)
        self.assertNotIn('OUT OF STOCK', line)

    def test_order_line_marked_bookable(self):
        line = format_order_product_line(self.shoot)
        self.assertIn('SERVICE — always bookable', line)

    def test_physical_line_still_shows_stock(self):
        line = format_product_line(self.frame)
        self.assertIn('4 in stock', line)


class ServiceOrderTests(ServiceSellingTestBase):
    def test_service_order_created_despite_zero_stock(self):
        items = [{'product_id': self.shoot.id, 'quantity': 1, 'size': '', 'color': ''}]
        order = create_chat_order(self.convo, items, {'Full name': 'Bina'})
        self.assertIsNotNone(order)
        self.assertEqual(float(order.total_amount), 25000.0)
        self.shoot.refresh_from_db()
        self.assertEqual(self.shoot.stock, 0)
        self.assertEqual(self.shoot.stock_history.count(), 0)

    def test_mixed_order_only_deducts_physical_stock(self):
        items = [
            {'product_id': self.shoot.id, 'quantity': 1, 'size': '', 'color': ''},
            {'product_id': self.frame.id, 'quantity': 2, 'size': '', 'color': ''},
        ]
        order = create_chat_order(self.convo, items, {})
        self.assertIsNotNone(order)
        self.assertEqual(float(order.total_amount), 26600.0)
        self.frame.refresh_from_db()
        self.shoot.refresh_from_db()
        self.assertEqual(self.frame.stock, 2)
        self.assertEqual(self.shoot.stock, 0)

    def test_service_order_revision_leaves_stock_alone(self):
        items = [{'product_id': self.shoot.id, 'quantity': 1, 'size': '', 'color': ''}]
        order = create_chat_order(self.convo, items, {'Full name': 'Bina'})
        revised = [{'product_id': self.shoot.id, 'quantity': 2, 'size': '', 'color': ''}]
        updated = update_chat_order(self.convo, order.id, revised, {})
        self.assertIsNotNone(updated)
        self.assertEqual(float(updated.total_amount), 50000.0)
        self.shoot.refresh_from_db()
        self.assertEqual(self.shoot.stock, 0)
        self.assertEqual(self.shoot.stock_history.count(), 0)
