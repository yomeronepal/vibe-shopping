import json

from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.test import TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token

from core.models import Tenant, VendorProfile
from inbox.routing import websocket_urlpatterns

IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@override_settings(CHANNEL_LAYERS=IN_MEMORY_LAYER)
class InboxConsumerTests(TransactionTestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        self.token = Token.objects.create(user=self.user)
        self.application = URLRouter(websocket_urlpatterns)

    async def test_rejects_bad_token(self):
        communicator = WebsocketCommunicator(self.application, 'ws/inbox/?token=bogus')
        connected, _ = await communicator.connect()
        self.assertFalse(connected)

    async def test_accepts_valid_token_and_relays_events(self):
        communicator = WebsocketCommunicator(
            self.application, f'ws/inbox/?token={self.token.key}'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        channel_layer = get_channel_layer()
        await channel_layer.group_send(f'inbox_{self.tenant.id}', {
            'type': 'inbox.message',
            'conversation': {'id': 1},
            'message': {'id': 2, 'text': 'hi'},
        })
        payload = json.loads(await communicator.receive_from())
        self.assertEqual(payload['type'], 'message')
        self.assertEqual(payload['message']['text'], 'hi')
        await channel_layer.group_send(f'inbox_{self.tenant.id}', {
            'type': 'inbox.conversation_update',
            'conversation': {'id': 1, 'status': 'resolved'},
        })
        payload = json.loads(await communicator.receive_from())
        self.assertEqual(payload['type'], 'conversation_update')
        await communicator.disconnect()
