from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphError

TEST_KEY = Fernet.generate_key().decode()
IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@override_settings(FERNET_KEY=TEST_KEY, CHANNEL_LAYERS=IN_MEMORY_LAYER)
class InboxApiTests(APITestCase):
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
        self.page.set_access_token('pt1')
        self.page.save()
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita'
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer,
            platform='facebook', status='waiting_business', unread_count=2,
            last_message_at=timezone.now(), last_message_preview='hello',
        )
        Message.objects.create(
            conversation=self.convo, direction='in', text='hello',
            platform_message_id='m1', sent_at=timezone.now(),
        )

    def test_list_conversations(self):
        response = self.client.get('/api/inbox/conversations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['customer']['name'], 'Sita')

    def test_list_filters_by_status(self):
        response = self.client.get('/api/inbox/conversations/?status=resolved')
        self.assertEqual(response.data, [])

    def test_thread_messages(self):
        response = self.client.get(f'/api/inbox/conversations/{self.convo.id}/messages/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['text'], 'hello')

    @patch('inbox.services.sending.MetaGraphClient')
    def test_send_reply(self, mock_client_cls):
        mock_client_cls.return_value.send_message.return_value = 'mid-out-1'
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/',
            {'text': 'thanks!'}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['direction'], 'out')
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.status, 'waiting_customer')
        self.assertEqual(self.convo.unread_count, 0)
        self.assertEqual(self.convo.last_message_preview, 'thanks!')
        mock_client_cls.return_value.send_message.assert_called_once_with(
            'p1', 'pt1', 'psid1', 'thanks!', quick_replies=None
        )

    @patch('inbox.services.sending.push_inbox_event', side_effect=Exception('redis down'))
    @patch('inbox.services.sending.MetaGraphClient')
    def test_send_reply_survives_push_failure(self, mock_client_cls, mock_push):
        mock_client_cls.return_value.send_message.return_value = 'mid-out-2'
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/',
            {'text': 'still works'}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Message.objects.filter(text='still works').exists())

    @patch('inbox.services.sending.MetaGraphClient')
    def test_send_reply_window_closed(self, mock_client_cls):
        mock_client_cls.return_value.send_message.side_effect = MetaGraphError('window', code=10)
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/',
            {'text': 'late'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data['error'],
            'The 24-hour reply window for this conversation has closed.',
        )

    def test_send_reply_empty_text(self):
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/', {'text': ''}, format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_mark_read(self):
        response = self.client.post(f'/api/inbox/conversations/{self.convo.id}/read/')
        self.assertEqual(response.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.unread_count, 0)

    def test_update_status(self):
        response = self.client.patch(
            f'/api/inbox/conversations/{self.convo.id}/', {'status': 'resolved'}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.status, 'resolved')

    def test_update_status_invalid(self):
        response = self.client.patch(
            f'/api/inbox/conversations/{self.convo.id}/', {'status': 'nonsense'}, format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_cross_tenant_404(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        loner = User.objects.create_user(username='loner', password='pass12345')
        VendorProfile.objects.create(user=loner, tenant=other, role='owner')
        token = Token.objects.create(user=loner)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        for method, url in [
            ('get', f'/api/inbox/conversations/{self.convo.id}/messages/'),
            ('post', f'/api/inbox/conversations/{self.convo.id}/read/'),
            ('patch', f'/api/inbox/conversations/{self.convo.id}/'),
        ]:
            response = getattr(self.client, method)(url, {}, format='json')
            self.assertEqual(response.status_code, 404)
