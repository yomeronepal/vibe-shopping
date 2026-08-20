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


class MissingFieldsFormTests(AutoReplyTestBase):
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-form-1')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_missing_fields_appended_as_form(self, mock_advance, mock_deliver):
        product = Product.objects.get(name='Linen Shirt')
        mock_advance.return_value = outcome(
            reply='Details bharnus hai!',
            ordering=True,
            order_ready=False,
            items=[{'product_id': product.id, 'quantity': 1}],
            collected={'Full name': 'Sita Sharma'},
            missing=['Phone number', 'Delivery address'],
        )
        auto_reply_to_message(self.inbound.id)
        sent = Message.objects.get(direction='out')
        self.assertIn('copy garera bharnus', sent.text)
        self.assertIn('Phone number:', sent.text)
        self.assertIn('Delivery address:', sent.text)
        self.assertNotIn('Full name:', sent.text)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-form-3')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_prefilled_form_when_confirming_known_details(self, mock_advance, mock_deliver):
        product = Product.objects.get(name='Linen Shirt')
        mock_advance.return_value = outcome(
            reply='Details thik chha?',
            ordering=True,
            order_ready=False,
            items=[{'product_id': product.id, 'quantity': 1}],
            collected={'Full name': 'Sita Sharma', 'Phone number': '9800000001'},
            missing=[],
        )
        auto_reply_to_message(self.inbound.id)
        sent = Message.objects.get(direction='out')
        self.assertIn('Hami sanga bhayeko details', sent.text)
        self.assertIn('Full name: Sita Sharma', sent.text)
        self.assertIn('Phone number: 9800000001', sent.text)
        self.assertIn('"confirm"', sent.text)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-form-2')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_no_form_when_not_ordering(self, mock_advance, mock_deliver):
        mock_advance.return_value = outcome(
            reply='Namaste! K help garna sakchhu?',
            ordering=False,
            missing=['Phone number'],
        )
        auto_reply_to_message(self.inbound.id)
        sent = Message.objects.get(direction='out')
        self.assertNotIn('copy garera', sent.text)


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

    @patch('inbox.services.sending.deliver_via_meta', side_effect=['mid-bot-5a', 'mid-bot-5b'])
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_different_product_creates_second_order(self, mock_advance, mock_deliver):
        mock_advance.return_value = self.ready_outcome()
        auto_reply_to_message(self.inbound.id)
        other = Product.objects.create(
            tenant=self.tenant, name='Canvas Tote', price=600, stock=5,
            status='published', is_active=True,
        )
        newer = Message.objects.create(
            conversation=self.convo, direction='in', text='tote pani chahiyo',
            platform_message_id='mid-tote', sent_at=timezone.now(),
        )
        second = outcome(
            reply='Tote order placing!', ordering=True, order_ready=True,
            items=[{'product_id': other.id, 'quantity': 1}],
            collected={'Full name': 'Sita Sharma', 'Phone number': '9800000001', 'Delivery address': 'Thamel, Kathmandu'},
        )
        mock_advance.return_value = second
        result = auto_reply_to_message(newer.id)
        self.assertIn('sent+order:', result)
        self.assertEqual(Order.objects.filter(tenant=self.tenant).count(), 2)

    @patch('socials.services.meta_graph.MetaGraphClient.send_image_attachment', return_value='mid-photo-9')
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-bot-9')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_confirmation_followed_by_ordered_product_photo(self, mock_advance, mock_deliver, mock_photo):
        import io

        from django.core.files.base import ContentFile
        from django.test import override_settings
        from PIL import Image as PILImage

        product = Product.objects.get(name='Linen Shirt')
        buf = io.BytesIO()
        PILImage.new('RGB', (300, 300), (200, 190, 170)).save(buf, format='JPEG')
        product.image.save('shirt.jpg', ContentFile(buf.getvalue()), save=True)
        mock_advance.return_value = self.ready_outcome()
        with override_settings(PUBLIC_MEDIA_BASE_URL='https://media.example', PUBLIC_APP_BASE_URL=''):
            result = auto_reply_to_message(self.inbound.id)
        self.assertIn('sent+order:', result)
        image_url = mock_photo.call_args[0][3]
        self.assertIn('card_cache/', image_url)
        photo_note = Message.objects.filter(direction='out', metadata__type='product_cards').first()
        self.assertIsNotNone(photo_note)
        self.assertEqual(photo_note.metadata['product_ids'], [product.id])
        product.image.delete(save=True)

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
        mock_apply.assert_called_once_with(args=[self.inbound.id], countdown=10)

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


class SentimentHandoffTests(AutoReplyTestBase):
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-hh-1')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_negative_sentiment_stored(self, mock_advance, mock_deliver):
        result_outcome = outcome(reply='Maaf garnuhos!')
        result_outcome['sentiment'] = 'negative'
        mock_advance.return_value = result_outcome
        auto_reply_to_message(self.inbound.id)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.sentiment, 'negative')
        self.assertFalse(self.convo.ai_paused)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-hh-2')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_needs_human_pauses_bot_but_sends_handoff_reply(self, mock_advance, mock_deliver):
        result_outcome = outcome(reply='Hamro team member chittai reply garnu hunecha.')
        result_outcome['sentiment'] = 'negative'
        result_outcome['needs_human'] = True
        mock_advance.return_value = result_outcome
        result = auto_reply_to_message(self.inbound.id)
        self.assertEqual(result, 'sent')
        self.convo.refresh_from_db()
        self.assertTrue(self.convo.ai_paused)
        self.assertEqual(self.convo.sentiment, 'negative')
        sent = Message.objects.get(direction='out')
        self.assertIn('team member', sent.text)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-hh-3')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_paused_conversation_stays_silent_afterwards(self, mock_advance, mock_deliver):
        result_outcome = outcome(reply='Team member aaudai cha.')
        result_outcome['needs_human'] = True
        mock_advance.return_value = result_outcome
        auto_reply_to_message(self.inbound.id)
        newer = Message.objects.create(
            conversation=self.convo, direction='in', text='I said NOW',
            platform_message_id='m-angry-2', sent_at=timezone.now(),
        )
        self.assertEqual(auto_reply_to_message(newer.id), 'skipped')


class HumanTakeoverTests(AutoReplyTestBase):
    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-ht-1')
    def test_manual_reply_pauses_bot(self, mock_deliver):
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/',
            {'text': 'Let me handle this personally.'}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['human_takeover'])
        self.convo.refresh_from_db()
        self.assertTrue(self.convo.ai_paused)
        newer = Message.objects.create(
            conversation=self.convo, direction='in', text='ok thanks',
            platform_message_id='m-ht-2', sent_at=timezone.now(),
        )
        self.assertEqual(auto_reply_to_message(newer.id), 'skipped')

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-ht-3')
    def test_no_takeover_when_bot_disabled(self, mock_deliver):
        self.tenant.metadata = {}
        self.tenant.save()
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/',
            {'text': 'Hello!'}, format='json',
        )
        self.assertFalse(response.data['human_takeover'])
        self.convo.refresh_from_db()
        self.assertFalse(self.convo.ai_paused)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-ht-4')
    def test_no_duplicate_takeover_when_already_paused(self, mock_deliver):
        Conversation.objects.filter(pk=self.convo.pk).update(ai_paused=True)
        response = self.client.post(
            f'/api/inbox/conversations/{self.convo.id}/messages/',
            {'text': 'Still me.'}, format='json',
        )
        self.assertFalse(response.data['human_takeover'])


class SafetyRuleTests(AutoReplyTestBase):
    def ready_outcome(self):
        product = Product.objects.get(name='Linen Shirt')
        return outcome(
            reply='Order confirm gardai chhu!',
            ordering=True,
            order_ready=True,
            items=[{'product_id': product.id, 'quantity': 2}],
            collected={'Full name': 'Sita', 'Phone number': '98', 'Delivery address': 'KTM'},
        )

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-cap-1')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_order_over_cap_needs_human(self, mock_advance, mock_deliver):
        self.tenant.metadata['maxAutoOrderValue'] = 2000
        self.tenant.save()
        mock_advance.return_value = self.ready_outcome()
        result = auto_reply_to_message(self.inbound.id)
        self.assertEqual(result, 'sent')
        self.assertEqual(Order.objects.count(), 0)
        self.convo.refresh_from_db()
        self.assertTrue(self.convo.ai_paused)
        sent = Message.objects.get(direction='out')
        self.assertIn('team member', sent.text)

    @patch('inbox.services.sending.deliver_via_meta', return_value='mid-cap-2')
    @patch('inbox.services.assistant.advance_order_conversation')
    def test_order_under_cap_proceeds(self, mock_advance, mock_deliver):
        self.tenant.metadata['maxAutoOrderValue'] = 5000
        self.tenant.save()
        mock_advance.return_value = self.ready_outcome()
        result = auto_reply_to_message(self.inbound.id)
        self.assertIn('sent+order:', result)
        self.assertEqual(Order.objects.count(), 1)

    def test_discount_rule_in_prompts(self):
        from inbox.services.assistant import build_order_flow_prompt, build_suggestion_prompt
        prompt = build_suggestion_prompt(self.convo)
        self.assertIn('Never offer or agree to any discount', prompt)
        self.tenant.metadata['aiMaxDiscount'] = 10
        self.tenant.save()
        self.convo.tenant.refresh_from_db()
        prompt = build_order_flow_prompt(self.convo)
        self.assertIn('at most 10% off', prompt)

    @patch('inbox.services.assistant.log_ai_usage')
    @patch('google.genai.Client')
    def test_ai_usage_logged_on_success(self, mock_client, mock_log):
        mock_client.return_value.models.generate_content.return_value.text = 'Namaste!'
        from inbox.services.assistant import suggest_reply
        with patch('inbox.services.assistant.settings') as mock_settings:
            mock_settings.GOOGLE_AI_API_KEY = 'key'
            mock_settings.GEMINI_ASSISTANT_MODEL = 'm'
            suggest_reply(self.convo)
        args = mock_log.call_args[0]
        self.assertEqual(args[1], 'gemini')
        self.assertEqual(args[2], 'reply_suggestion')
        self.assertTrue(args[5])

    @patch('inbox.services.assistant.log_ai_usage')
    @patch('core.services.claude_service.generate_text')
    @patch('google.genai.Client')
    def test_ai_failure_logged(self, mock_client, mock_claude, mock_log):
        from core.services.claude_service import ClaudeError
        from inbox.services.assistant import AssistantError, suggest_reply
        mock_client.return_value.models.generate_content.side_effect = Exception('down')
        mock_claude.side_effect = ClaudeError('also down')
        with patch('inbox.services.assistant.settings') as mock_settings:
            mock_settings.GOOGLE_AI_API_KEY = 'key'
            mock_settings.GEMINI_ASSISTANT_MODEL = 'm'
            with self.assertRaises(AssistantError):
                suggest_reply(self.convo)
        args = mock_log.call_args[0]
        self.assertEqual(args[1], 'none')
        self.assertFalse(args[5])
