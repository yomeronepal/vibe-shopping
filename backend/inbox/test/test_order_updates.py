from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Order, OrderItem, Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import advance_order_conversation, build_order_flow_prompt
from inbox.services.chat_orders import update_chat_order
from socials.models import ConnectedPage, MetaConnection


class OrderUpdateTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Change Store', subdomain='change')
        self.user = User.objects.create_user(username='change_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fbchg')
        page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='pchg',
            name='Change', status='connected',
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-c', name='Hari',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=page, customer=self.customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )
        Message.objects.create(
            conversation=self.convo, direction='in', text='Order update garna man lagyo',
            platform_message_id='mc1', sent_at=timezone.now(),
        )
        self.polo = Product.objects.create(
            tenant=self.tenant, name='Polo Shirt', price=1000, stock=10,
            status='published', is_active=True,
        )
        self.cap = Product.objects.create(
            tenant=self.tenant, name='Baseball Cap', price=400, stock=5,
            status='published', is_active=True,
        )
        self.order = Order.objects.create(
            tenant=self.tenant, user=None, total_amount=1000,
            status='pending_delivery', payment_method='cash', order_type='online',
            customer_name='Hari', customer_phone='9800000001',
            metadata={
                'source': 'chat_bot', 'conversation_id': self.convo.id,
                'platform': 'facebook',
                'collected': {'Full name': 'Hari', 'Phone number': '9800000001'},
            },
        )
        OrderItem.objects.create(
            order=self.order, product=self.polo, quantity=1, price=1000, size='M',
        )
        self.polo.stock = 9
        self.polo.save(update_fields=['stock'])


class PromptTests(OrderUpdateTestBase):
    def test_prompt_lists_recent_order_as_changeable(self):
        prompt = build_order_flow_prompt(self.convo)
        self.assertIn(f'[order {self.order.id}]', prompt)
        self.assertIn('1× Polo Shirt (size M)', prompt)
        self.assertIn('can still be changed', prompt)
        self.assertIn('update_order_id', prompt)

    def test_shipped_order_marked_human_only(self):
        self.order.status = 'shipped'
        self.order.save(update_fields=['status'])
        prompt = build_order_flow_prompt(self.convo)
        self.assertIn('changes need a human now', prompt)

    @patch('inbox.services.assistant.call_gemini')
    def test_advance_returns_update_order_id(self, mock_call):
        mock_call.return_value = (
            '{"reply": "Size L ma update garchhu!", "ordering": true, "order_ready": true,'
            f' "items": [{{"product_id": {self.polo.id}, "quantity": 1, "size": "L", "color": ""}}],'
            f' "update_order_id": {self.order.id},'
            ' "collected": {"Full name": "Hari", "Phone number": "9800000001", "Delivery address": "Patan"},'
            ' "missing": [], "sentiment": "positive", "needs_human": false}'
        )
        outcome = advance_order_conversation(self.convo)
        self.assertEqual(outcome['update_order_id'], self.order.id)
        self.assertTrue(outcome['order_ready'])


class UpdateChatOrderTests(OrderUpdateTestBase):
    def test_revises_items_and_restores_stock(self):
        items = [
            {'product_id': self.polo.id, 'quantity': 2, 'size': 'L', 'color': ''},
            {'product_id': self.cap.id, 'quantity': 1, 'size': '', 'color': 'Black'},
        ]
        updated = update_chat_order(
            self.convo, self.order.id, items, {'Delivery address': 'Patan'},
        )
        self.assertIsNotNone(updated)
        self.assertEqual(float(updated.total_amount), 2400.0)
        self.polo.refresh_from_db()
        self.cap.refresh_from_db()
        self.assertEqual(self.polo.stock, 8)
        self.assertEqual(self.cap.stock, 4)
        lines = list(updated.items.order_by('id'))
        self.assertEqual(lines[0].size, 'L')
        self.assertEqual(lines[0].quantity, 2)
        self.assertEqual(lines[1].color, 'Black')
        self.assertEqual(updated.metadata['collected']['Delivery address'], 'Patan')
        self.assertEqual(updated.metadata['collected']['Full name'], 'Hari')
        self.assertIn('updated_via_chat_at', updated.metadata)

    def test_rejects_shipped_order(self):
        self.order.status = 'shipped'
        self.order.save(update_fields=['status'])
        items = [{'product_id': self.polo.id, 'quantity': 2, 'size': 'L', 'color': ''}]
        self.assertIsNone(update_chat_order(self.convo, self.order.id, items, {}))
        self.polo.refresh_from_db()
        self.assertEqual(self.polo.stock, 9)

    def test_rejects_other_conversations_order(self):
        other_customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-x', name='Mina',
        )
        other_convo = Conversation.objects.create(
            tenant=self.tenant, page=self.convo.page, customer=other_customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )
        items = [{'product_id': self.polo.id, 'quantity': 1, 'size': 'S', 'color': ''}]
        self.assertIsNone(update_chat_order(other_convo, self.order.id, items, {}))

    def test_invalid_items_keep_order_untouched(self):
        items = [{'product_id': 424242, 'quantity': 1, 'size': '', 'color': ''}]
        self.assertIsNone(update_chat_order(self.convo, self.order.id, items, {}))
        self.order.refresh_from_db()
        self.assertEqual(float(self.order.total_amount), 1000.0)
        self.assertEqual(self.order.items.count(), 1)
        self.polo.refresh_from_db()
        self.assertEqual(self.polo.stock, 9)

    def test_quantity_clamped_to_available_stock(self):
        items = [{'product_id': self.cap.id, 'quantity': 50, 'size': '', 'color': ''}]
        updated = update_chat_order(self.convo, self.order.id, items, {})
        self.assertIsNotNone(updated)
        line = updated.items.first()
        self.assertEqual(line.quantity, 5)
        self.cap.refresh_from_db()
        self.assertEqual(self.cap.stock, 0)
        self.polo.refresh_from_db()
        self.assertEqual(self.polo.stock, 10)
