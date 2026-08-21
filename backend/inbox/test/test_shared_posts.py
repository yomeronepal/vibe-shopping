from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Product, SocialMediaPost, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import build_history_block, extract_search_terms
from inbox.services.ingest import store_message
from socials.models import ConnectedPage, MetaConnection


class SharedPostTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Share Shop', subdomain='shareshop')
        self.user = User.objects.create_user(username='share_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fbsh')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='psh',
            name='Share', status='connected',
        )
        self.page.set_access_token('pt-sh')
        self.page.save()
        Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-sh', name='Sharer',
        )
        self.gpu = Product.objects.create(
            tenant=self.tenant, name='RTX 4060 Graphics Card', price=55000, stock=4,
            status='published', is_active=True,
        )
        self.post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.gpu, platform='facebook',
            status='posted', post_url='https://facebook.com/psh_9988776655443322',
            platform_post_id='psh_9988776655443322',
        )

    def share_event(self, url, text='', mid='mid-share-1'):
        return {
            'sender': {'id': 'psid-sh'},
            'recipient': {'id': 'psh'},
            'timestamp': 1787300000000,
            'message': {
                'mid': mid,
                'text': text,
                'attachments': [{'type': 'share', 'payload': {'url': url}}],
            },
        }


class SharedPostResolutionTests(SharedPostTestBase):
    def ingest(self, event):
        with patch('inbox.services.ingest.queue_auto_reply'):
            with patch('inbox.services.ingest.fetch_customer_profile', return_value={'name': '', 'profile_pic_url': ''}):
                return store_message(self.page, 'facebook', event)

    def test_numeric_share_url_resolves_product(self):
        record = self.ingest(self.share_event('https://www.facebook.com/psh/posts/9988776655443322'))
        self.assertEqual(record.metadata['shared_post_product']['id'], self.gpu.id)

    @patch('inbox.services.ingest.resolve_share_via_graph')
    def test_pfbid_share_url_resolves_via_graph(self, mock_resolve):
        mock_resolve.return_value = self.post
        url = 'https://www.facebook.com/permalink.php?story_fbid=pfbid0AbCdEf&id=10006817'
        record = self.ingest(self.share_event(url, mid='mid-share-2'))
        self.assertEqual(record.metadata['shared_post_product']['name'], 'RTX 4060 Graphics Card')

    def test_history_marks_shared_product(self):
        self.ingest(self.share_event('https://www.facebook.com/psh/posts/9988776655443322'))
        convo = Conversation.objects.get(tenant=self.tenant)
        Message.objects.create(
            conversation=convo, direction='in', text='pp',
            platform_message_id='mid-pp', sent_at=timezone.now(),
        )
        history = build_history_block(convo)
        self.assertIn('shared your post about RTX 4060 Graphics Card', history)
        terms = extract_search_terms(convo)
        self.assertIn('rtx', terms)

    def test_unrelated_share_ignored(self):
        record = self.ingest(self.share_event('https://www.facebook.com/other/posts/1112223334445556', mid='mid-share-3'))
        self.assertEqual(record.metadata, {})
