import json
from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import advance_order_conversation
from inbox.services.ingest import postback_as_message, store_message
from inbox.tasks import auto_reply_to_message
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphClient


class ChatUxTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='UX Store', subdomain='uxstore', metadata={'aiAutoReply': True},
        )
        self.user = User.objects.create_user(username='ux_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fbux')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='pux',
            name='UX', status='connected',
        )
        self.page.set_access_token('pt-ux')
        self.page.save()
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-ux', name='Maya',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )
        self.product = Product.objects.create(
            tenant=self.tenant, name='Canvas Shoes', price=1800, stock=6,
            status='published', is_active=True, stock_by_size={'40': 3, '41': 3},
        )


class QuickReplyPayloadTests(ChatUxTestBase):
    def test_send_message_includes_quick_reply_chips(self):
        client = MetaGraphClient()
        with patch.object(MetaGraphClient, 'post', return_value={'message_id': 'm1'}) as mock_post:
            client.send_message('pux', 'token', 'psid-ux', 'Kun size?', quick_replies=['40', '41'])
        message = json.loads(mock_post.call_args[0][1]['message'])
        titles = [chip['title'] for chip in message['quick_replies']]
        self.assertEqual(titles, ['40', '41'])

    @patch('inbox.services.assistant.call_gemini')
    def test_advance_validates_quick_replies(self, mock_call):
        mock_call.return_value = json.dumps({
            'reply': 'Kun size chahinchha?', 'ordering': True, 'order_ready': False,
            'items': [], 'collected': {}, 'missing': [], 'sentiment': 'neutral',
            'needs_human': False, 'quick_replies': ['40', '41', '', 42, 'extra', 'over'],
        })
        outcome = advance_order_conversation(self.convo)
        self.assertEqual(outcome['quick_replies'], ['40', '41', '42', 'extra'])


class PostbackTests(ChatUxTestBase):
    def event(self, payload):
        return {
            'sender': {'id': 'psid-ux'},
            'recipient': {'id': 'pux'},
            'timestamp': 1787300000000,
            'postback': {'title': 'Tap', 'payload': payload, 'mid': f'pb-{payload}'},
        }

    def test_known_postback_becomes_text_message(self):
        mapped = postback_as_message(self.event('SHOW_PRODUCTS'))
        self.assertEqual(mapped['text'], 'Tapai sanga k k products chha?')

    def test_postback_ingested_and_queued(self):
        with patch('inbox.services.ingest.queue_auto_reply') as mock_queue:
            record = store_message(self.page, 'facebook', self.event('ORDER_STATUS'))
        self.assertEqual(record.text, 'Mero order ko status k chha?')
        self.assertEqual(record.direction, 'in')
        mock_queue.assert_called_once()

    def test_unknown_postback_ignored(self):
        self.assertIsNone(postback_as_message(self.event('MYSTERY')))


class TypingIndicatorTests(ChatUxTestBase):
    @patch('socials.services.meta_graph.MetaGraphClient.send_sender_action')
    @patch('inbox.tasks.auto_reply_to_message')
    def test_inbound_message_triggers_seen_and_typing(self, mock_task, mock_action):
        event = {
            'sender': {'id': 'psid-ux'},
            'recipient': {'id': 'pux'},
            'timestamp': 1787300000000,
            'message': {'mid': 'mid-ux-1', 'text': 'size 40 chha?'},
        }
        store_message(self.page, 'facebook', event)
        actions = [call.args[3] for call in mock_action.call_args_list]
        self.assertIn('mark_seen', actions)
        self.assertIn('typing_on', actions)


class ChoiceBeforeConfirmTests(ChatUxTestBase):
    @patch('socials.services.meta_graph.MetaGraphClient.send_sender_action')
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-out-2')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_choice_question_suppresses_confirm_form(self, mock_advance, mock_deliver, mock_action):
        inbound = Message.objects.create(
            conversation=self.convo, direction='in', text='shoes chahiyo',
            platform_message_id='mid-ux-3', sent_at=timezone.now(),
        )
        mock_advance.return_value = {
            'reply': 'Kun size — 40 ki 41?', 'ordering': True, 'order_ready': False,
            'items': [{'product_id': self.product.id, 'quantity': 1, 'size': '', 'color': '',
                       'item_type': 'physical', 'name': 'Canvas Shoes', 'sku': '', 'price': '1800', 'stock': 6}],
            'collected': {'Full name': 'Maya', 'Phone number': '980', 'Delivery address': 'Patan'},
            'missing': [], 'sentiment': 'neutral', 'needs_human': False,
            'recommended_products': [], 'update_order_id': None,
            'quick_replies': ['40', '41'],
            'required_fields': ['Full name', 'Phone number', 'Delivery address'],
        }
        auto_reply_to_message(inbound.id)
        self.assertEqual(mock_deliver.call_args.kwargs['quick_replies'], ['40', '41'])
        sent = Message.objects.get(direction='out')
        self.assertNotIn('Hami sanga bhayeko details', sent.text)


class ConfirmChipTests(ChatUxTestBase):
    @patch('socials.services.meta_graph.MetaGraphClient.send_sender_action')
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-out-1')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_confirmation_form_forces_confirm_chips(self, mock_advance, mock_deliver, mock_action):
        inbound = Message.objects.create(
            conversation=self.convo, direction='in', text='shoes order garne',
            platform_message_id='mid-ux-2', sent_at=timezone.now(),
        )
        mock_advance.return_value = {
            'reply': 'Details thik chha?', 'ordering': True, 'order_ready': False,
            'items': [{'product_id': self.product.id, 'quantity': 1, 'size': '40', 'color': '',
                       'name': 'Canvas Shoes', 'sku': '', 'price': '1800', 'stock': 6}],
            'collected': {'Full name': 'Maya', 'Phone number': '980', 'Delivery address': 'Patan'},
            'missing': [], 'sentiment': 'neutral', 'needs_human': False,
            'recommended_products': [], 'update_order_id': None, 'quick_replies': [],
        }
        auto_reply_to_message(inbound.id)
        self.assertEqual(mock_deliver.call_args.kwargs['quick_replies'], ['Confirm', 'Change garnu cha'])
