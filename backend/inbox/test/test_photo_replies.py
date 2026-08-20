from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Product, Tenant, VendorProfile
from inbox.models import Conversation, Customer, Message
from inbox.services.assistant import build_history_block, extract_search_terms
from inbox.services.ingest import store_message
from socials.models import ConnectedPage, MetaConnection


class PhotoReplyTestBase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Photo Shop', subdomain='photoshop')
        self.user = User.objects.create_user(username='photo_owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fbph')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='pph',
            name='Photo', status='connected',
        )
        self.page.set_access_token('pt-ph')
        self.page.save()
        self.customer = Customer.objects.create(
            tenant=self.tenant, platform='facebook', platform_user_id='psid-ph', name='Kiran',
        )
        self.convo = Conversation.objects.create(
            tenant=self.tenant, page=self.page, customer=self.customer,
            platform='facebook', status='waiting_business',
            last_message_at=timezone.now(),
        )
        self.chair = Product.objects.create(
            tenant=self.tenant, name='Ergonomic Gaming Chair', price=24500, stock=5,
            status='published', is_active=True,
        )
        Message.objects.create(
            conversation=self.convo, direction='out', sent_by_ai=True,
            text='[Sent product photos: Ergonomic Gaming Chair]',
            platform_message_id='mid-photo-chair',
            sent_at=timezone.now(),
            metadata={
                'type': 'product_cards',
                'product_ids': [self.chair.id],
                'photo_mids': {
                    'mid-photo-chair': {
                        'id': self.chair.id,
                        'name': 'Ergonomic Gaming Chair',
                        'sku': self.chair.product_code,
                    },
                },
            },
        )

    def ingest_reply(self, text, reply_mid='mid-photo-chair'):
        event = {
            'sender': {'id': 'psid-ph'},
            'recipient': {'id': 'pph'},
            'timestamp': 1787200000000,
            'message': {
                'mid': f'mid-in-{Message.objects.count()}',
                'text': text,
                'reply_to': {'mid': reply_mid},
            },
        }
        with patch('inbox.services.ingest.queue_auto_reply'):
            return store_message(self.page, 'facebook', event)


class PhotoReplyResolutionTests(PhotoReplyTestBase):
    def test_reply_to_photo_is_linked_to_product(self):
        record = self.ingest_reply('malai yo man paryo')
        self.assertEqual(record.metadata['reply_to_product']['id'], self.chair.id)
        self.assertEqual(record.metadata['reply_to_product']['name'], 'Ergonomic Gaming Chair')

    def test_history_marks_which_product_the_reply_means(self):
        self.ingest_reply('malai yo man paryo')
        history = build_history_block(self.convo)
        self.assertIn('replying to your photo of Ergonomic Gaming Chair', history)
        self.assertIn(f'[id {self.chair.id}]', history)

    def test_replied_product_feeds_search_terms(self):
        self.ingest_reply('malai yo man paryo')
        terms = extract_search_terms(self.convo)
        self.assertIn('ergonomic', terms)
        self.assertIn('chair', terms)

    def test_unknown_reply_mid_is_ignored(self):
        record = self.ingest_reply('yo chahiyo', reply_mid='mid-unknown')
        self.assertEqual(record.metadata, {})


class LabeledCardTests(PhotoReplyTestBase):
    @override_settings(PUBLIC_MEDIA_BASE_URL='https://media.example')
    def test_labeled_card_generated_and_cached(self):
        import io

        from django.core.files.base import ContentFile
        from django.core.files.storage import default_storage
        from PIL import Image

        from inbox.services.card_images import card_cache_path, labeled_card_url

        buf = io.BytesIO()
        Image.new('RGB', (400, 400), (10, 20, 30)).save(buf, format='JPEG')
        self.chair.image.save('chair.jpg', ContentFile(buf.getvalue()), save=True)
        url = labeled_card_url(self.chair)
        path = card_cache_path(self.chair)
        self.assertTrue(url.startswith('https://media.example'))
        self.assertIn('card_cache/', url)
        self.assertTrue(default_storage.exists(path))
        self.assertEqual(labeled_card_url(self.chair), url)
        default_storage.delete(path)
        self.chair.image.delete(save=True)

    def test_no_image_returns_none(self):
        from inbox.services.card_images import labeled_card_url

        self.assertIsNone(labeled_card_url(self.chair))
