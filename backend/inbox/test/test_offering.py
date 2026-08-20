from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Order, Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import (
    build_order_flow_prompt,
    get_booking_fields,
    resolve_required_fields,
)
from inbox.tasks import auto_reply_to_message
from socials.models import ConnectedPage, MetaConnection


class OfferingTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Lens Lab', subdomain='lenslab',
            metadata={'offering': 'both', 'aiAutoReply': True},
        )
        self.user = User.objects.create_user(username='lens_lab', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fbll')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='pll',
            name='LensLab', status='connected',
        )
        self.page.set_access_token('pt-ll')
        self.page.save()
        customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-ll', name='Nabin',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )
        self.inbound = Message.objects.create(
            conversation=self.convo, direction='in', text='shoot book garna man cha',
            platform_message_id='mll-1', sent_at=timezone.now(),
        )
        self.shoot = Product.objects.create(
            tenant=self.tenant, name='Event Photography', price=8000, stock=0,
            item_type='service', status='published', is_active=True,
        )
        self.frame = Product.objects.create(
            tenant=self.tenant, name='Photo Frame', price=900, stock=5,
            status='published', is_active=True,
        )


class FieldResolutionTests(OfferingTestBase):
    def test_service_items_use_booking_fields(self):
        items = [{'product_id': self.shoot.id, 'item_type': 'service'}]
        self.assertEqual(
            resolve_required_fields(self.tenant, items),
            ['Full name', 'Phone number', 'Preferred date & time'],
        )

    def test_physical_items_use_order_fields(self):
        items = [{'product_id': self.frame.id, 'item_type': 'physical'}]
        self.assertEqual(
            resolve_required_fields(self.tenant, items),
            ['Full name', 'Phone number', 'Delivery address'],
        )

    def test_mixed_cart_merges_both_sets(self):
        items = [
            {'product_id': self.shoot.id, 'item_type': 'service'},
            {'product_id': self.frame.id, 'item_type': 'physical'},
        ]
        self.assertEqual(
            resolve_required_fields(self.tenant, items),
            ['Full name', 'Phone number', 'Delivery address', 'Preferred date & time'],
        )

    def test_no_items_follow_offering(self):
        self.tenant.metadata['offering'] = 'services'
        self.assertEqual(resolve_required_fields(self.tenant, []), get_booking_fields(self.tenant))

    def test_custom_booking_fields_respected(self):
        self.tenant.metadata['serviceFields'] = ['Full name', 'Event date', 'Venue']
        items = [{'product_id': self.shoot.id, 'item_type': 'service'}]
        self.assertEqual(
            resolve_required_fields(self.tenant, items),
            ['Full name', 'Event date', 'Venue'],
        )


class OfferingPromptTests(OfferingTestBase):
    def test_both_offering_lists_both_field_sets(self):
        prompt = build_order_flow_prompt(self.convo)
        self.assertIn('BEFORE PLACING A PRODUCT ORDER', prompt)
        self.assertIn('BEFORE BOOKING A SERVICE', prompt)
        self.assertIn('sells products AND offers bookable services', prompt)

    def test_services_offering_hides_order_fields(self):
        self.tenant.metadata['offering'] = 'services'
        self.tenant.save()
        prompt = build_order_flow_prompt(self.convo)
        self.assertNotIn('BEFORE PLACING A PRODUCT ORDER', prompt)
        self.assertIn('BEFORE BOOKING A SERVICE', prompt)


class BookingLanguageTests(OfferingTestBase):
    @patch('socials.services.meta_graph.MetaGraphClient.send_sender_action')
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-book-1')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_service_confirmation_says_booking(self, mock_advance, mock_deliver, mock_action):
        mock_advance.return_value = {
            'reply': 'Booking confirm garchhu!', 'ordering': True, 'order_ready': True,
            'items': [{'product_id': self.shoot.id, 'quantity': 1, 'size': '', 'color': '',
                       'item_type': 'service', 'name': 'Event Photography', 'sku': '',
                       'price': '8000', 'stock': 0}],
            'collected': {'Full name': 'Nabin', 'Phone number': '981',
                          'Preferred date & time': 'Saturday 10am'},
            'missing': [], 'sentiment': 'positive', 'needs_human': False,
            'recommended_products': [], 'update_order_id': None, 'quick_replies': [],
            'required_fields': ['Full name', 'Phone number', 'Preferred date & time'],
        }
        result = auto_reply_to_message(self.inbound.id)
        self.assertIn('sent+order:', result)
        order = Order.objects.get(tenant=self.tenant)
        sent = Message.objects.filter(direction='out').order_by('-sent_at').first()
        self.assertIn(f'Booking #{order.id}', sent.text)
        self.assertEqual(order.metadata['collected']['Preferred date & time'], 'Saturday 10am')
