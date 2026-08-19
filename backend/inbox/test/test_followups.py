from datetime import timedelta
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Order, OrderItem, Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.tasks import send_abandoned_order_followups
from socials.models import ConnectedPage, MetaConnection

TEST_KEY = Fernet.generate_key().decode()
IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@override_settings(FERNET_KEY=TEST_KEY, CHANNEL_LAYERS=IN_MEMORY_LAYER)
class FollowupTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Acme', subdomain='acme', metadata={'aiAutoReply': True},
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
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita',
        )
        self.convo = self.make_convo(self.customer, intent_hours_ago=8)

    def make_convo(self, customer, intent_hours_ago=None, mid_prefix='m'):
        convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=customer,
            platform='facebook', last_message_at=timezone.now(),
            order_intent_at=timezone.now() - timedelta(hours=intent_hours_ago) if intent_hours_ago else None,
        )
        Message.objects.create(
            conversation=convo, direction='in', text='kinna man cha',
            platform_message_id=f'{mid_prefix}-in', sent_at=timezone.now() - timedelta(hours=9),
        )
        Message.objects.create(
            conversation=convo, direction='out', text='Naam ra number dinus na',
            platform_message_id=f'{mid_prefix}-out', sent_at=timezone.now() - timedelta(hours=8),
        )
        return convo


class AbandonedFollowupTests(FollowupTestBase):
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-fu-1')
    def test_sends_followup_once(self, mock_deliver):
        self.assertEqual(send_abandoned_order_followups(), 1)
        followup = Message.objects.filter(conversation=self.convo, sent_by_ai=True).latest('id')
        self.assertIn('order', followup.text.lower())
        self.assertEqual(send_abandoned_order_followups(), 0)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-fu-2')
    def test_respects_delay_setting(self, mock_deliver):
        self.tenant.metadata['followupHours'] = 24
        self.tenant.save()
        self.assertEqual(send_abandoned_order_followups(), 0)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-fu-3')
    def test_custom_message_used(self, mock_deliver):
        self.tenant.metadata['followupMessage'] = 'Timro order ready garna help chahincha?'
        self.tenant.save()
        send_abandoned_order_followups()
        followup = Message.objects.filter(conversation=self.convo, sent_by_ai=True).latest('id')
        self.assertIn('Timro order ready', followup.text)

    def test_skips_when_bot_disabled_or_paused(self):
        self.tenant.metadata = {}
        self.tenant.save()
        self.assertEqual(send_abandoned_order_followups(), 0)
        self.tenant.metadata = {'aiAutoReply': True}
        self.tenant.save()
        Conversation.objects.filter(pk=self.convo.pk).update(ai_paused=True)
        self.assertEqual(send_abandoned_order_followups(), 0)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-fu-4')
    def test_skips_if_customer_replied_last(self, mock_deliver):
        Message.objects.create(
            conversation=self.convo, direction='in', text='ok wait',
            platform_message_id='m-newer', sent_at=timezone.now(),
        )
        self.assertEqual(send_abandoned_order_followups(), 0)

    def test_expires_stale_intent(self):
        Conversation.objects.filter(pk=self.convo.pk).update(
            order_intent_at=timezone.now() - timedelta(hours=72),
        )
        self.assertEqual(send_abandoned_order_followups(), 0)
        self.convo.refresh_from_db()
        self.assertIsNone(self.convo.order_intent_at)


class CampaignTests(FollowupTestBase):
    def setUp(self):
        super().setUp()
        self.buyer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid2', name='Ram',
        )
        buyer_convo = self.make_convo(self.buyer, mid_prefix='m2')
        product = Product.objects.create(
            tenant=self.tenant, name='Shawl', price=1000, stock=5,
            status='published', is_active=True,
        )
        order = Order.objects.create(
            tenant=self.tenant, total_amount=1000, status='completed',
            metadata={'source': 'chat_bot', 'conversation_id': buyer_convo.id},
        )
        OrderItem.objects.create(order=order, product=product, quantity=1, price=1000)

    @patch('inbox.services.sending.deliver_via_meta', side_effect=['mid-c1', 'mid-c2'])
    def test_campaign_to_all(self, mock_deliver):
        response = self.client.post('/api/inbox/campaigns/send/', {
            'message': 'Naya shawl collection aayo! Herna aunus.', 'audience': 'all',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['sent'], 2)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-c3')
    def test_campaign_to_buyers_only(self, mock_deliver):
        response = self.client.post('/api/inbox/campaigns/send/', {
            'message': 'Feri kinna aunus — repeat customer discount!', 'audience': 'buyers',
        }, format='json')
        self.assertEqual(response.data['sent'], 1)

    @patch('inbox.services.sending.deliver_via_meta')
    def test_closed_windows_counted_as_skipped(self, mock_deliver):
        from inbox.services.sending import ConversationSendError
        mock_deliver.side_effect = ConversationSendError('window closed', 400)
        response = self.client.post('/api/inbox/campaigns/send/', {
            'message': 'Hello everyone!', 'audience': 'all',
        }, format='json')
        self.assertEqual(response.data['sent'], 0)
        self.assertEqual(response.data['skipped'], 2)

    def test_requires_message(self):
        response = self.client.post('/api/inbox/campaigns/send/', {'message': 'hi'}, format='json')
        self.assertEqual(response.status_code, 400)
