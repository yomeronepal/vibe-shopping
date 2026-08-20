from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Product, ProductVariant, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import (
    build_order_flow_prompt,
    format_availability_details,
    format_product_line,
    format_stock_label,
)
from inbox.services.chat_orders import create_chat_order
from socials.models import ConnectedPage, MetaConnection


class InventoryModeTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Mix Mart', subdomain='mixmart')
        self.user = User.objects.create_user(username='mix_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fbmix')
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='pmix',
            name='Mix', status='connected',
        )
        customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-mx', name='Ram',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=page, customer=customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )
        Message.objects.create(
            conversation=self.convo, direction='in', text='dry dates kati ho?',
            platform_message_id='mx1', sent_at=timezone.now(),
        )


class OptionAxisTests(InventoryModeTestBase):
    def test_custom_option_name_reaches_catalog_line(self):
        product = Product.objects.create(
            tenant=self.tenant, name='Dry Dates', price=650, stock=6,
            status='published', is_active=True,
            stock_by_size={'250g': 4, '500g': 2},
            metadata={'stockMode': 'options', 'optionName': 'Weight'},
        )
        line = format_product_line(product)
        self.assertIn('Weight [250g:4, 500g:2]', line)

    def test_missing_option_name_defaults_to_sizes(self):
        product = Product.objects.create(
            tenant=self.tenant, name='Plain Tee', price=500, stock=3,
            status='published', is_active=True, stock_by_size={'M': 3},
        )
        self.assertIn('sizes [M:3]', format_product_line(product))

    def test_lone_qty_variant_renders_count_only(self):
        product = Product.objects.create(
            tenant=self.tenant, name='Mech Keyboard', price=4500, stock=5,
            status='published', is_active=True,
            metadata={'stockMode': 'variants'},
        )
        ProductVariant.objects.create(
            product=product, color_name='Black', stock_by_size={'qty': 3},
        )
        details = format_availability_details(product)
        self.assertIn('Black [3]', details)
        self.assertNotIn('qty', details)


class MadeToOrderTests(InventoryModeTestBase):
    def make_cake(self):
        return Product.objects.create(
            tenant=self.tenant, name='Custom Birthday Cake', price=2500, stock=0,
            status='published', is_active=True,
            metadata={'stockMode': 'made_to_order'},
            description='Prepared in 2 days',
        )

    def test_stock_label_marks_made_to_order(self):
        cake = self.make_cake()
        self.assertEqual(format_stock_label(cake), 'MADE TO ORDER — always orderable')

    def test_order_created_despite_zero_stock(self):
        cake = self.make_cake()
        items = [{'product_id': cake.id, 'quantity': 2, 'size': '', 'color': ''}]
        order = create_chat_order(self.convo, items, {'Full name': 'Ram'})
        self.assertIsNotNone(order)
        self.assertEqual(float(order.total_amount), 5000.0)
        cake.refresh_from_db()
        self.assertEqual(cake.stock, 0)
        self.assertEqual(cake.stock_history.count(), 0)

    def test_prompt_carries_made_to_order_rule(self):
        self.make_cake()
        prompt = build_order_flow_prompt(self.convo)
        self.assertIn('MADE TO ORDER — always orderable', prompt)
        self.assertIn('prepared after ordering', prompt)
