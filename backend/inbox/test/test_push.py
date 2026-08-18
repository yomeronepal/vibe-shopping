from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.test import TestCase, override_settings
from django.utils import timezone

from core.models import Tenant
from inbox.models import Conversation, Customer, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from inbox.test.test_models import make_page

IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


class SerializerTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.page = make_page(self.tenant)
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid1', name='Sita'
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer,
            platform='facebook', last_message_preview='hello',
        )

    def test_conversation_serializer_shape(self):
        data = ConversationSerializer(self.convo).data
        self.assertEqual(data['customer']['name'], 'Sita')
        self.assertEqual(data['page_id'], 'p1')
        self.assertEqual(data['status'], 'new')
        self.assertNotIn('tenant', data)

    def test_message_serializer_shape(self):
        message = Message.objects.create(
            conversation=self.convo, direction='in', text='hi',
            platform_message_id='m1', sent_at=timezone.now(),
        )
        data = MessageSerializer(message).data
        self.assertEqual(data['direction'], 'in')
        self.assertEqual(data['text'], 'hi')
        self.assertEqual(data['attachments'], [])


@override_settings(CHANNEL_LAYERS=IN_MEMORY_LAYER)
class PushTests(TestCase):
    def test_push_sends_to_tenant_group(self):
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_add)('inbox_7', 'test-channel')
        push_inbox_event(7, 'inbox.message', {'message': {'text': 'hi'}})
        event = async_to_sync(channel_layer.receive)('test-channel')
        self.assertEqual(event['type'], 'inbox.message')
        self.assertEqual(event['message']['text'], 'hi')
