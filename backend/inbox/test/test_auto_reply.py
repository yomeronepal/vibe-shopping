from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Order, Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.ingest import queue_auto_reply
from inbox.tasks import auto_reply_to_message
from socials.models import ConnectedPage, MetaConnection

TEST_KEY = Fernet.generate_key().decode()
IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@override_settings(FERNET_KEY=TEST_KEY, CHANNEL_LAYERS=IN_MEMORY_LAYER)
class AutoReplyTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Acme', subdomain='acme',
            metadata={'aiAutoReply': True},
        )
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
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
            platform='facebook', status='waiting_business', unread_count=1,
            last_message_at=timezone.now(),
        )
        self.inbound = Message.objects.create(
            conversation=self.convo, direction='in',
            text='How much is the linen shirt?',
            platform_message_id='m1', sent_at=timezone.now(),
        )
        Product.objects.create(
            tenant=self.tenant, name='Linen Shirt', price=1200, stock=4,
            status='published', is_active=True,
        )


def outcome(reply='The linen shirt is Rs. 1200.', ordering=False, order_ready=False, items=None, collected=None, missing=None):
    return {
        'reply': reply,
        'ordering': ordering,
        'order_ready': order_ready,
        'items': items or [],
        'collected': collected or {},
        'missing': missing or [],
    }


class AutoReplyTaskTests(AutoReplyTestBase):
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-bot-1')
    @patch('inbox.services.assistant.advance_order_conversation', return_value=outcome())
    def test_sends_ai_reply_and_keeps_unread(self, mock_suggest, mock_deliver):
        result = auto_reply_to_message(self.inbound.id)
        self.assertEqual(result, 'sent')
        reply = Message.objects.get(conversation=self.convo, direction='out')
        self.assertTrue(reply.sent_by_ai)
        self.assertEqual(reply.text, 'The linen shirt is Rs. 1200.')
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.unread_count, 1)
        self.assertEqual(self.convo.status, 'waiting_customer')

    def test_skips_when_bot_disabled(self):
        self.tenant.metadata = {'aiAutoReply': False}
        self.tenant.save()
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'skipped')
        self.assertFalse(Message.objects.filter(direction='out').exists())

    def test_skips_when_assistant_off_even_if_bot_on(self):
        self.tenant.metadata = {'aiAutoReply': True, 'aiAssistantEnabled': False}
        self.tenant.save()
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'skipped')

    def test_skips_when_conversation_paused(self):
        Conversation.objects.filter(pk=self.convo.pk).update(ai_paused=True)
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'skipped')

    def test_skips_when_already_answered(self):
        Message.objects.create(
            conversation=self.convo, direction='out', text='Handled by human',
            platform_message_id='m-human', sent_at=timezone.now(),
        )
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'already_answered')

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-late')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_skips_send_when_newer_message_arrives_during_generation(self, mock_advance, mock_deliver):
        def add_newer_then_return(conversation):
            Message.objects.create(
                conversation=conversation, direction='in', text='One more thing',
                platform_message_id='m-during', sent_at=timezone.now(),
            )
            return outcome()
        mock_advance.side_effect = add_newer_then_return
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'superseded')
        self.assertFalse(Message.objects.filter(direction='out').exists())

    def test_skips_when_superseded_by_newer_message(self):
        Message.objects.create(
            conversation=self.convo, direction='in', text='Actually never mind',
            platform_message_id='m2', sent_at=timezone.now(),
        )
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'superseded')

    def test_skips_outbound_messages(self):
        outbound = Message.objects.create(
            conversation=self.convo, direction='out', text='Hello!',
            platform_message_id='m-out', sent_at=timezone.now(),
        )
        self.assertEqual(auto_reply_to_message(outbound.id), 'skipped')

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-bot-2')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_reports_failed_when_ai_unavailable(self, mock_advance, mock_deliver):
        from inbox.services.assistant import AssistantError
        mock_advance.side_effect = AssistantError('both providers down')
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'failed')
        self.assertFalse(Message.objects.filter(direction='out').exists())


class ChatOrderCreationTests(AutoReplyTestBase):
    def ready_outcome(self):
        product = Product.objects.get(name='Linen Shirt')
        return outcome(
            reply='Confirmed! Placing your order now.',
            ordering=True,
            order_ready=True,
            items=[{'product_id': product.id, 'quantity': 2}],
            collected={'Full name': 'Sita Sharma', 'Phone number': '9800000001', 'Delivery address': 'Thamel, Kathmandu'},
        )

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-bot-3')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_creates_order_when_ready(self, mock_advance, mock_deliver):
        mock_advance.return_value = self.ready_outcome()
        result = auto_reply_to_message(self.inbound.id)
        order = Order.objects.get(tenant=self.tenant)
        self.assertEqual(result, f'sent+order:{order.id}')
        self.assertEqual(float(order.total_amount), 2400.0)
        self.assertEqual(order.status, 'pending_delivery')
        self.assertEqual(order.customer_name, 'Sita Sharma')
        self.assertEqual(order.customer_phone, '9800000001')
        self.assertEqual(order.metadata['source'], 'chat_bot')
        self.assertEqual(order.metadata['conversation_id'], self.convo.id)
        self.assertEqual(order.metadata['collected']['Delivery address'], 'Thamel, Kathmandu')
        product = Product.objects.get(name='Linen Shirt')
        self.assertEqual(product.stock, 2)
        sent = Message.objects.get(direction='out')
        self.assertIn(f'Order #{order.id}', sent.text)
        self.assertIn('2,400', sent.text)

    @patch('inbox.services.sending.deliver_via_meta', side_effect=['mid-bot-4a', 'mid-bot-4b'])
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_does_not_duplicate_recent_order(self, mock_advance, mock_deliver):
        mock_advance.return_value = self.ready_outcome()
        auto_reply_to_message(self.inbound.id)
        newer = Message.objects.create(
            conversation=self.convo, direction='in', text='ok thanks',
            platform_message_id='m-again', sent_at=timezone.now(),
        )
        result = auto_reply_to_message(newer.id)
        self.assertEqual(result, 'sent')
        self.assertEqual(Order.objects.count(), 1)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-bot-5')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_no_order_when_fields_missing(self, mock_advance, mock_deliver):
        result_outcome = self.ready_outcome()
        result_outcome['order_ready'] = False
        result_outcome['missing'] = ['Delivery address']
        result_outcome['reply'] = 'Could you share your delivery address?'
        mock_advance.return_value = result_outcome
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'sent')
        self.assertEqual(Order.objects.count(), 0)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-bot-6')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_quantity_clamped_to_stock(self, mock_advance, mock_deliver):
        ready = self.ready_outcome()
        ready['items'][0]['quantity'] = 99
        mock_advance.return_value = ready
        auto_reply_to_message(self.inbound.id)
        order = Order.objects.get(tenant=self.tenant)
        self.assertEqual(order.items.first().quantity, 4)
        product = Product.objects.get(name='Linen Shirt')
        self.assertEqual(product.stock, 0)


class QueueAutoReplyTests(AutoReplyTestBase):
    @patch('inbox.tasks.auto_reply_to_message.apply_async')
    def test_queues_with_debounce_when_enabled(self, mock_apply):
        queue_auto_reply(self.inbound, self.tenant)
        mock_apply.assert_called_once_with(args=[self.inbound.id], countdown=60)

    @patch('inbox.tasks.auto_reply_to_message.apply_async')
    def test_does_not_queue_when_disabled(self, mock_apply):
        self.tenant.metadata = {}
        queue_auto_reply(self.inbound, self.tenant)
        mock_apply.assert_not_called()

    @patch('inbox.tasks.auto_reply_to_message.apply_async')
    def test_does_not_queue_when_paused(self, mock_apply):
        Conversation.objects.filter(pk=self.convo.pk).update(ai_paused=True)
        self.inbound.refresh_from_db()
        self.inbound.conversation.refresh_from_db()
        queue_auto_reply(self.inbound, self.tenant)
        mock_apply.assert_not_called()


class AutoReplyApiTests(AutoReplyTestBase):
    def test_patch_toggles_ai_paused(self):
        response = self.client.patch(
            f'/api/inbox/conversations/{self.convo.id}/', {'ai_paused': True}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['ai_paused'])
        self.convo.refresh_from_db()
        self.assertTrue(self.convo.ai_paused)

    def test_patch_still_updates_status(self):
        response = self.client.patch(
            f'/api/inbox/conversations/{self.convo.id}/', {'status': 'resolved'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'resolved')

    def test_patch_rejects_empty_body(self):
        response = self.client.patch(
            f'/api/inbox/conversations/{self.convo.id}/', {}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_message_serializer_exposes_ai_flag(self):
        Message.objects.create(
            conversation=self.convo, direction='out', text='Bot says hi',
            platform_message_id='m-ai', sent_by_ai=True, sent_at=timezone.now(),
        )
        response = self.client.get(f'/api/inbox/conversations/{self.convo.id}/messages/')
        flagged = [m for m in response.data if m['sent_by_ai']]
        self.assertEqual(len(flagged), 1)

    def test_profile_round_trips_auto_reply(self):
        response = self.client.get('/api/vendor/profile/')
        self.assertTrue(response.data['ai_auto_reply'])
        response = self.client.patch(
            '/api/vendor/profile/', {'ai_auto_reply': False}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertFalse(self.tenant.metadata['aiAutoReply'])
