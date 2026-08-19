from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, Tenant, VendorProfile
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


class AutoReplyTaskTests(AutoReplyTestBase):
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-bot-1')
    @patch('inbox.services.assistant.suggest_reply', return_value='The linen shirt is Rs. 1200.')
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
    @patch('inbox.services.assistant.suggest_reply')
    def test_reports_failed_when_ai_unavailable(self, mock_suggest, mock_deliver):
        from inbox.services.assistant import AssistantError
        mock_suggest.side_effect = AssistantError('both providers down')
        self.assertEqual(auto_reply_to_message(self.inbound.id), 'failed')
        self.assertFalse(Message.objects.filter(direction='out').exists())


class QueueAutoReplyTests(AutoReplyTestBase):
    @patch('inbox.tasks.auto_reply_to_message.delay')
    def test_queues_when_enabled(self, mock_delay):
        queue_auto_reply(self.inbound, self.tenant)
        mock_delay.assert_called_once_with(self.inbound.id)

    @patch('inbox.tasks.auto_reply_to_message.delay')
    def test_does_not_queue_when_disabled(self, mock_delay):
        self.tenant.metadata = {}
        queue_auto_reply(self.inbound, self.tenant)
        mock_delay.assert_not_called()

    @patch('inbox.tasks.auto_reply_to_message.delay')
    def test_does_not_queue_when_paused(self, mock_delay):
        Conversation.objects.filter(pk=self.convo.pk).update(ai_paused=True)
        self.inbound.refresh_from_db()
        self.inbound.conversation.refresh_from_db()
        queue_auto_reply(self.inbound, self.tenant)
        mock_delay.assert_not_called()


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
