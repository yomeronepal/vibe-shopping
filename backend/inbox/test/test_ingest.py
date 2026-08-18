from unittest.mock import patch

from cryptography.fernet import Fernet
from django.test import TestCase, override_settings

from core.models import Tenant
from inbox.models import Conversation, Customer, Message
from inbox.services.ingest import ingest_webhook_event
from socials.models import ConnectedPage, MetaConnection, WebhookEvent

TEST_KEY = Fernet.generate_key().decode()


def messaging_payload(page_entry_id, sender, recipient, mid, text, is_echo=False, attachments=None, object_type='page'):
    message = {'mid': mid, 'text': text}
    if is_echo:
        message['is_echo'] = True
    if attachments is not None:
        message['attachments'] = attachments
    return {
        'object': object_type,
        'entry': [{
            'id': page_entry_id,
            'time': 1755530000000,
            'messaging': [{
                'sender': {'id': sender},
                'recipient': {'id': recipient},
                'timestamp': 1755530000000,
                'message': message,
            }],
        }],
    }


@override_settings(FERNET_KEY=TEST_KEY)
@patch('inbox.services.ingest.push_inbox_event')
@patch('inbox.services.ingest.fetch_customer_profile', return_value={'name': 'Sita', 'profile_pic_url': ''})
class IngestTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1', name='Store',
            instagram_account_id='ig1', status='connected',
        )
        self.page.set_access_token('pt1')
        self.page.save()

    def ingest(self, payload):
        event = WebhookEvent.objects.create(
            object_type=payload['object'], payload=payload, signature_valid=True
        )
        return ingest_webhook_event(event)

    def test_messenger_message_creates_all_rows(self, mock_profile, mock_push):
        created = self.ingest(messaging_payload('p1', 'psid1', 'p1', 'm1', 'hello'))
        self.assertEqual(created, 1)
        customer = Customer.objects.get()
        self.assertEqual(customer.platform, 'facebook')
        self.assertEqual(customer.name, 'Sita')
        convo = Conversation.objects.get()
        self.assertEqual(convo.status, 'waiting_business')
        self.assertEqual(convo.unread_count, 1)
        self.assertEqual(convo.last_message_preview, 'hello')
        message = Message.objects.get()
        self.assertEqual(message.direction, 'in')
        self.assertTrue(mock_push.called)

    def test_instagram_message_maps_by_ig_id(self, mock_profile, mock_push):
        created = self.ingest(
            messaging_payload('ig1', 'igsid9', 'ig1', 'm2', 'namaste', object_type='instagram')
        )
        self.assertEqual(created, 1)
        convo = Conversation.objects.get()
        self.assertEqual(convo.platform, 'instagram')
        self.assertEqual(convo.page, self.page)

    def test_echo_stored_as_outbound(self, mock_profile, mock_push):
        self.ingest(messaging_payload('p1', 'p1', 'psid1', 'm3', 'we replied', is_echo=True))
        message = Message.objects.get()
        self.assertEqual(message.direction, 'out')
        convo = Conversation.objects.get()
        self.assertEqual(convo.status, 'waiting_customer')
        self.assertEqual(convo.unread_count, 0)

    def test_redelivered_event_is_idempotent(self, mock_profile, mock_push):
        payload = messaging_payload('p1', 'psid1', 'p1', 'm4', 'hi')
        self.ingest(payload)
        created_again = self.ingest(payload)
        self.assertEqual(created_again, 0)
        self.assertEqual(Message.objects.count(), 1)
        self.assertEqual(Conversation.objects.get().unread_count, 1)

    def test_attachment_message_stores_attachments(self, mock_profile, mock_push):
        attachments = [{'type': 'image', 'payload': {'url': 'https://cdn/img.jpg'}}]
        self.ingest(messaging_payload('p1', 'psid1', 'p1', 'm5', '', attachments=attachments))
        message = Message.objects.get()
        self.assertEqual(message.attachments, [{'type': 'image', 'url': 'https://cdn/img.jpg'}])
        self.assertEqual(Conversation.objects.get().last_message_preview, '[attachment]')

    def test_unknown_page_is_skipped(self, mock_profile, mock_push):
        created = self.ingest(messaging_payload('other-page', 'psid1', 'other-page', 'm6', 'hi'))
        self.assertEqual(created, 0)
        self.assertEqual(Conversation.objects.count(), 0)

    def test_resolved_conversation_reopens_on_inbound(self, mock_profile, mock_push):
        self.ingest(messaging_payload('p1', 'psid1', 'p1', 'm7', 'first'))
        Conversation.objects.update(status='resolved')
        self.ingest(messaging_payload('p1', 'psid1', 'p1', 'm8', 'again'))
        self.assertEqual(Conversation.objects.get().status, 'waiting_business')
