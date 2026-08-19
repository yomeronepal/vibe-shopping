from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, SocialMediaPost, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.ingest import store_comment
from inbox.services.sending import send_conversation_text
from socials.models import ConnectedPage, MetaConnection

TEST_KEY = Fernet.generate_key().decode()
IN_MEMORY_LAYER = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


def fb_comment_change(comment_id='c1', text='pp', author_id='u1', post_id='post1'):
    return {
        'field': 'feed',
        'value': {
            'item': 'comment',
            'verb': 'add',
            'comment_id': comment_id,
            'message': text,
            'from': {'id': author_id, 'name': 'Gita'},
            'post_id': post_id,
        },
    }


def ig_comment_change(comment_id='ig-c1', text='price?', author_id='igu1', media_id='media1'):
    return {
        'field': 'comments',
        'value': {
            'id': comment_id,
            'text': text,
            'from': {'id': author_id, 'username': 'gita_k'},
            'media': {'id': media_id},
        },
    }


@override_settings(FERNET_KEY=TEST_KEY, CHANNEL_LAYERS=IN_MEMORY_LAYER)
class CommentTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            instagram_account_id='ig1', status='connected', name='Store',
        )
        self.page.set_access_token('pt1')
        self.page.save()
        self.product = Product.objects.create(
            tenant=self.tenant, name='Kalo Polo', price=1500, stock=5,
            status='published', is_active=True,
        )
        SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='New polo!', status='posted', platform_post_id='post1',
        )


class CommentIngestTests(CommentTestBase):
    def test_facebook_comment_becomes_inbox_message(self):
        record = store_comment(self.page, 'facebook', fb_comment_change())
        self.assertIsNotNone(record)
        self.assertEqual(record.source, 'comment')
        self.assertEqual(record.text, 'pp')
        self.assertEqual(record.metadata['product_name'], 'Kalo Polo')
        self.assertEqual(record.metadata['product_id'], self.product.id)
        conversation = record.conversation
        self.assertEqual(conversation.customer.name, 'Gita')
        self.assertEqual(conversation.unread_count, 1)
        self.assertIn('Commented: pp', conversation.last_message_preview)

    def test_instagram_comment_becomes_inbox_message(self):
        SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='instagram',
            caption='IG polo', status='posted', platform_post_id='media1',
        )
        record = store_comment(self.page, 'instagram', ig_comment_change())
        self.assertIsNotNone(record)
        self.assertEqual(record.metadata['product_name'], 'Kalo Polo')
        self.assertEqual(record.conversation.customer.name, 'gita_k')

    def test_skips_own_comments(self):
        own = fb_comment_change(author_id='p1')
        self.assertIsNone(store_comment(self.page, 'facebook', own))
        own_ig = ig_comment_change(author_id='ig1')
        self.assertIsNone(store_comment(self.page, 'instagram', own_ig))

    def test_skips_non_comment_changes(self):
        like = {'field': 'feed', 'value': {'item': 'reaction', 'verb': 'add'}}
        self.assertIsNone(store_comment(self.page, 'facebook', like))

    def test_deduplicates_by_comment_id(self):
        store_comment(self.page, 'facebook', fb_comment_change())
        self.assertIsNone(store_comment(self.page, 'facebook', fb_comment_change()))
        self.assertEqual(Message.objects.count(), 1)

    @patch('inbox.tasks.auto_reply_to_message.apply_async')
    def test_comment_queues_bot_when_enabled(self, mock_apply):
        self.tenant.metadata = {'aiAutoReply': True}
        self.tenant.save()
        record = store_comment(self.page, 'facebook', fb_comment_change())
        mock_apply.assert_called_once_with(args=[record.id], countdown=20)


class PrivateReplyRoutingTests(CommentTestBase):
    def make_comment(self, platform='facebook'):
        change = fb_comment_change() if platform == 'facebook' else ig_comment_change()
        return store_comment(self.page, platform, change)

    @patch('inbox.services.sending.MetaGraphClient')
    def test_reply_to_unanswered_comment_goes_private(self, mock_client_cls):
        mock_client_cls.return_value.send_private_reply.return_value = 'mid-priv-1'
        record = self.make_comment()
        send_conversation_text(record.conversation, 'Price is Rs. 1500!')
        mock_client_cls.return_value.send_private_reply.assert_called_once_with(
            'p1', 'pt1', 'c1', 'Price is Rs. 1500!'
        )
        mock_client_cls.return_value.send_message.assert_not_called()

    @patch('inbox.services.sending.MetaGraphClient')
    def test_instagram_private_reply_uses_ig_account(self, mock_client_cls):
        mock_client_cls.return_value.send_private_reply.return_value = 'mid-priv-2'
        record = self.make_comment('instagram')
        send_conversation_text(record.conversation, 'Rs. 1500 ho!')
        mock_client_cls.return_value.send_private_reply.assert_called_once_with(
            'ig1', 'pt1', 'ig-c1', 'Rs. 1500 ho!'
        )

    @patch('inbox.services.sending.MetaGraphClient')
    def test_second_reply_falls_back_to_dm(self, mock_client_cls):
        mock_client_cls.return_value.send_private_reply.return_value = 'mid-priv-3'
        mock_client_cls.return_value.send_message.return_value = 'mid-dm-1'
        record = self.make_comment()
        send_conversation_text(record.conversation, 'Price is Rs. 1500!')
        send_conversation_text(record.conversation, 'Also we deliver!')
        mock_client_cls.return_value.send_message.assert_called_once_with(
            'p1', 'pt1', 'u1', 'Also we deliver!'
        )

    @patch('inbox.services.sending.MetaGraphClient')
    def test_dm_after_comment_routes_normally(self, mock_client_cls):
        mock_client_cls.return_value.send_message.return_value = 'mid-dm-2'
        record = self.make_comment()
        Message.objects.create(
            conversation=record.conversation, direction='in', text='hello via dm',
            platform_message_id='m-dm', sent_at=timezone.now(),
        )
        send_conversation_text(record.conversation, 'Hi!')
        mock_client_cls.return_value.send_message.assert_called_once()
        mock_client_cls.return_value.send_private_reply.assert_not_called()


class CommentPromptTests(CommentTestBase):
    def test_history_marks_comment_and_product(self):
        from inbox.services.assistant import build_history_block
        record = store_comment(self.page, 'facebook', fb_comment_change())
        block = build_history_block(record.conversation)
        self.assertIn('commented on your post about Kalo Polo', block)
        self.assertIn('replying privately', block)
        self.assertIn('pp', block)
