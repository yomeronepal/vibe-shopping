from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.ingest import ingest_webhook_event
from inbox.services.sending import send_conversation_text
from socials.models import ConnectedPage, MetaConnection, WebhookEvent
from socials.services.meta_graph import MetaGraphError

TEST_KEY = Fernet.generate_key().decode()
IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

PHONE_NUMBER_ID = '15550001111'
WA_ID = '9779841000000'


def whatsapp_payload(messages, contacts=None):
    return {
        'object': 'whatsapp_business_account',
        'entry': [{
            'id': 'waba-1',
            'changes': [{
                'field': 'messages',
                'value': {
                    'messaging_product': 'whatsapp',
                    'metadata': {
                        'display_phone_number': '15550001111',
                        'phone_number_id': PHONE_NUMBER_ID,
                    },
                    'contacts': contacts if contacts is not None else [
                        {'wa_id': WA_ID, 'profile': {'name': 'Ram Thapa'}},
                    ],
                    'messages': messages,
                },
            }],
        }],
    }


def text_message(body, mid='wamid.1', timestamp='1756800000'):
    return {
        'from': WA_ID, 'id': mid, 'timestamp': timestamp,
        'type': 'text', 'text': {'body': body},
    }


@override_settings(FERNET_KEY=TEST_KEY, CHANNEL_LAYERS=IN_MEMORY_LAYER)
class WhatsAppTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='WA Shop', subdomain='washop', metadata={'aiAutoReply': False},
        )
        self.owner = User.objects.create_user(username='wa_owner', password='pass12345')
        VendorProfile.objects.create(user=self.owner, tenant=self.tenant, role='owner')
        self.token = Token.objects.create(user=self.owner)
        connection = MetaConnection.objects.create(
            tenant=self.tenant, fb_user_id=f'wa-{PHONE_NUMBER_ID}',
        )
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id=PHONE_NUMBER_ID,
            name='WA Shop (+1 555 000 1111)', connection_type='whatsapp',
            status='connected',
        )
        self.page.set_access_token('wa-token')
        self.page.save()

    def ingest(self, payload):
        event = WebhookEvent.objects.create(
            object_type=payload['object'], payload=payload, signature_valid=True,
        )
        return ingest_webhook_event(event)


class WhatsAppIngestTests(WhatsAppTestBase):
    def test_text_message_creates_conversation_and_customer(self):
        created = self.ingest(whatsapp_payload([text_message('Namaste, price?')]))
        self.assertEqual(created, 1)
        customer = Customer.objects.get(tenant=self.tenant, platform='whatsapp')
        self.assertEqual(customer.platform_user_id, WA_ID)
        self.assertEqual(customer.name, 'Ram Thapa')
        self.assertEqual(customer.phone, f'+{WA_ID}')
        conversation = Conversation.objects.get(customer=customer)
        self.assertEqual(conversation.platform, 'whatsapp')
        message = conversation.messages.get()
        self.assertEqual(message.text, 'Namaste, price?')
        self.assertEqual(message.direction, 'in')

    def test_duplicate_message_id_is_ignored(self):
        payload = whatsapp_payload([text_message('Hello')])
        self.assertEqual(self.ingest(payload), 1)
        self.assertEqual(self.ingest(payload), 0)

    def test_button_reply_becomes_text(self):
        message = {
            'from': WA_ID, 'id': 'wamid.btn', 'timestamp': '1756800000',
            'type': 'interactive',
            'interactive': {'type': 'button_reply', 'button_reply': {'id': 'option-1', 'title': 'Confirm'}},
        }
        self.ingest(whatsapp_payload([message]))
        record = Message.objects.get(platform_message_id='wamid.btn')
        self.assertEqual(record.text, 'Confirm')

    def test_reply_context_maps_to_reply_to_mid(self):
        customer = Customer.objects.create(
            tenant=self.tenant, platform='whatsapp', platform_user_id=WA_ID,
        )
        conversation = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=customer, platform='whatsapp',
        )
        Message.objects.create(
            conversation=conversation, direction='out', text='[Sent product photos]',
            platform_message_id='wamid.photo', sent_at=timezone.now(),
            metadata={'photo_mids': {'wamid.photo': {'id': 7, 'name': 'Keyboard', 'sku': 'PC-1'}}},
        )
        message = dict(text_message('yo kati ho?', mid='wamid.reply'))
        message['context'] = {'id': 'wamid.photo'}
        self.ingest(whatsapp_payload([message]))
        record = Message.objects.get(platform_message_id='wamid.reply')
        self.assertEqual(record.metadata['reply_to_product']['name'], 'Keyboard')

    @patch('inbox.services.whatsapp_ingest.store_inbound_media', return_value='https://cdn.example/wa.jpg')
    def test_image_message_stores_attachment(self, mock_media):
        message = {
            'from': WA_ID, 'id': 'wamid.img', 'timestamp': '1756800000',
            'type': 'image', 'image': {'id': 'media-9', 'caption': 'yo chahiyo'},
        }
        self.ingest(whatsapp_payload([message]))
        record = Message.objects.get(platform_message_id='wamid.img')
        self.assertEqual(record.text, 'yo chahiyo')
        self.assertEqual(record.attachments, [{'type': 'image', 'url': 'https://cdn.example/wa.jpg'}])

    def test_reaction_is_skipped(self):
        message = {
            'from': WA_ID, 'id': 'wamid.react', 'timestamp': '1756800000',
            'type': 'reaction', 'reaction': {'emoji': '👍'},
        }
        self.assertEqual(self.ingest(whatsapp_payload([message])), 0)

    def test_unknown_number_is_ignored(self):
        payload = whatsapp_payload([text_message('Hi')])
        payload['entry'][0]['changes'][0]['value']['metadata']['phone_number_id'] = '000'
        self.assertEqual(self.ingest(payload), 0)


class WhatsAppSendTests(WhatsAppTestBase):
    def setUp(self):
        super().setUp()
        customer = Customer.objects.create(
            tenant=self.tenant, platform='whatsapp', platform_user_id=WA_ID, name='Ram',
        )
        self.conversation = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=customer, platform='whatsapp',
        )

    @patch('socials.services.whatsapp_api.WhatsAppClient.post_message', return_value='wamid.out')
    def test_plain_text_send(self, mock_post):
        record = send_conversation_text(self.conversation, 'Namaste!')
        self.assertEqual(record.platform_message_id, 'wamid.out')
        payload = mock_post.call_args.args[2]
        self.assertEqual(payload['type'], 'text')
        self.assertEqual(payload['text']['body'], 'Namaste!')
        self.assertEqual(payload['to'], WA_ID)

    @patch('socials.services.whatsapp_api.WhatsAppClient.post_message', return_value='wamid.out')
    def test_short_quick_replies_become_buttons(self, mock_post):
        send_conversation_text(
            self.conversation, 'Order confirm garne?',
            quick_replies=['Confirm', 'Change garnu cha'],
        )
        payload = mock_post.call_args.args[2]
        self.assertEqual(payload['type'], 'interactive')
        buttons = payload['interactive']['action']['buttons']
        self.assertEqual([b['reply']['title'] for b in buttons], ['Confirm', 'Change garnu cha'])

    @patch('socials.services.whatsapp_api.WhatsAppClient.post_message', return_value='wamid.out')
    def test_long_option_lists_fall_back_to_numbered_text(self, mock_post):
        send_conversation_text(
            self.conversation, 'Kun color?',
            quick_replies=['Red', 'Blue', 'Green', 'Black'],
        )
        payload = mock_post.call_args.args[2]
        self.assertEqual(payload['type'], 'text')
        self.assertIn('1. Red', payload['text']['body'])
        self.assertIn('4. Black', payload['text']['body'])

    @patch('socials.services.whatsapp_api.WhatsAppClient.post_message')
    def test_closed_window_surfaces_friendly_error(self, mock_post):
        from inbox.services.sending import ConversationSendError

        mock_post.side_effect = MetaGraphError('Re-engagement message', code=131047)
        with self.assertRaises(ConversationSendError) as caught:
            send_conversation_text(self.conversation, 'Late follow-up')
        self.assertIn('24-hour', str(caught.exception))


class WhatsAppConnectTests(WhatsAppTestBase):
    def authenticate(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    @patch('socials.services.whatsapp_api.WhatsAppClient.fetch_phone_details')
    def test_owner_connects_number(self, mock_details):
        mock_details.return_value = {
            'display_phone_number': '+1 555 222 3333', 'verified_name': 'Trek Nepal',
        }
        self.authenticate()
        response = self.client.post('/api/socials/whatsapp/connect/', {
            'phone_number_id': '15552223333', 'access_token': 'fresh-token',
        })
        self.assertEqual(response.status_code, 201)
        page = ConnectedPage.objects.get(page_id='15552223333')
        self.assertEqual(page.connection_type, 'whatsapp')
        self.assertEqual(page.name, 'Trek Nepal')
        self.assertEqual(page.connection.fb_user_id, 'wa-15552223333')

    @patch('socials.services.whatsapp_api.WhatsAppClient.fetch_phone_details')
    def test_invalid_credentials_rejected(self, mock_details):
        mock_details.side_effect = MetaGraphError('Invalid OAuth access token')
        self.authenticate()
        response = self.client.post('/api/socials/whatsapp/connect/', {
            'phone_number_id': 'bad', 'access_token': 'bad',
        })
        self.assertEqual(response.status_code, 400)

    def test_staff_cannot_connect(self):
        staff = User.objects.create_user(username='wa_staff', password='pass12345')
        VendorProfile.objects.create(user=staff, tenant=self.tenant, role='staff')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=staff).key}')
        response = self.client.post('/api/socials/whatsapp/connect/', {
            'phone_number_id': '1', 'access_token': 't',
        })
        self.assertEqual(response.status_code, 403)


@override_settings(META_APP_ID='app-1', WHATSAPP_EMBEDDED_CONFIG_ID='cfg-1')
class WhatsAppOAuthTests(WhatsAppTestBase):
    def authenticate(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_connect_config_returns_launch_details(self):
        self.authenticate()
        response = self.client.get('/api/socials/whatsapp/connect-config/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'app_id': 'app-1', 'config_id': 'cfg-1'})

    @override_settings(WHATSAPP_EMBEDDED_CONFIG_ID='')
    def test_connect_config_501_when_unconfigured(self):
        self.authenticate()
        response = self.client.get('/api/socials/whatsapp/connect-config/')
        self.assertEqual(response.status_code, 501)

    @patch('socials.services.whatsapp_api.WhatsAppClient.register_phone')
    @patch('socials.services.whatsapp_api.WhatsAppClient.subscribe_waba')
    @patch('socials.services.whatsapp_api.WhatsAppClient.fetch_phone_details')
    def test_oauth_connects_number(self, mock_details, mock_subscribe, mock_register):
        from socials.services import whatsapp_api

        with patch.object(whatsapp_api, 'exchange_business_code', return_value='biz-token') as exchange:
            mock_details.return_value = {
                'display_phone_number': '+977 980 111 2222', 'verified_name': 'Momo House',
            }
            self.authenticate()
            response = self.client.post('/api/socials/whatsapp/oauth/', {
                'code': 'auth-code', 'phone_number_id': '10999', 'waba_id': 'waba-7',
            })
        self.assertEqual(response.status_code, 201)
        page = ConnectedPage.objects.get(page_id='10999')
        self.assertEqual(page.connection_type, 'whatsapp')
        self.assertEqual(page.name, 'Momo House')
        self.assertEqual(page.get_access_token(), 'biz-token')
        exchange.assert_called_once_with('auth-code')
        mock_subscribe.assert_called_once_with('waba-7', 'biz-token')
        mock_register.assert_called_once()

    def test_oauth_requires_popup_details(self):
        self.authenticate()
        response = self.client.post('/api/socials/whatsapp/oauth/', {'code': 'auth-code'})
        self.assertEqual(response.status_code, 400)

    def test_staff_cannot_use_oauth(self):
        staff = User.objects.create_user(username='wa_staff2', password='pass12345')
        VendorProfile.objects.create(user=staff, tenant=self.tenant, role='staff')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=staff).key}')
        response = self.client.post('/api/socials/whatsapp/oauth/', {
            'code': 'c', 'phone_number_id': '1', 'waba_id': 'w',
        })
        self.assertEqual(response.status_code, 403)
