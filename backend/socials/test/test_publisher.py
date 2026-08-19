from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from core.models import Product, SocialMediaPost, Tenant
from socials.models import ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphError
from socials.services.publisher import (
    TransientPublishError,
    publish_post_record,
    resolve_image_source,
)

TEST_KEY = Fernet.generate_key().decode()

PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0'
    b'\x00\x00\x00\x03\x00\x01_\x1d\x8b\xdb\x00\x00\x00\x00IEND\xaeB`\x82'
)


@override_settings(FERNET_KEY=TEST_KEY, PUBLIC_MEDIA_BASE_URL='https://pub.example.com')
class PublisherTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            name='Store', instagram_account_id='ig1', status='connected',
        )
        self.page.set_access_token('pt1')
        self.page.save()
        self.product = Product.objects.create(
            tenant=self.tenant, name='Jacket', price=10,
            image=SimpleUploadedFile('jacket.png', PNG_BYTES, 'image/png'),
        )

    def make_post(self, **kwargs):
        defaults = {
            'tenant': self.tenant, 'platform': 'facebook',
            'caption': 'Buy now', 'status': 'pending', 'product': self.product,
        }
        defaults.update(kwargs)
        return SocialMediaPost.objects.create(**defaults)

    @patch('socials.services.publisher.MetaGraphClient')
    def test_product_post_publishes(self, mock_client_cls):
        mock_client_cls.return_value.publish_page_photo.return_value = {
            'post_id': 'p1_1', 'post_url': 'https://facebook.com/p1_1'
        }
        record = publish_post_record(self.make_post())
        self.assertEqual(record.status, 'posted')
        self.assertEqual(record.platform_post_id, 'p1_1')

    @patch('socials.services.publisher.MetaGraphClient')
    def test_uploaded_image_takes_precedence(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.publish_page_photo.return_value = {'post_id': 'x', 'post_url': ''}
        post = self.make_post(image=SimpleUploadedFile('promo.png', PNG_BYTES, 'image/png'))
        source = resolve_image_source(post.image, post.product)
        self.assertIn('promo', source.name)
        publish_post_record(post)
        self.assertTrue(mock_client.publish_page_photo.called)

    @patch('socials.services.publisher.MetaGraphClient')
    def test_permanent_error_marks_failed(self, mock_client_cls):
        mock_client_cls.return_value.publish_page_photo.side_effect = MetaGraphError('nope', code=200)
        record = publish_post_record(self.make_post())
        self.assertEqual(record.status, 'failed')
        self.assertIn('nope', record.error_message)

    @patch('socials.services.publisher.MetaGraphClient')
    def test_network_error_raises_transient(self, mock_client_cls):
        mock_client_cls.return_value.publish_page_photo.side_effect = MetaGraphError('Could not reach Facebook')
        post = self.make_post()
        with self.assertRaises(TransientPublishError):
            publish_post_record(post)
        post.refresh_from_db()
        self.assertEqual(post.status, 'pending')

    @patch('socials.services.publisher.MetaGraphClient')
    def test_missing_image_fails(self, mock_client_cls):
        record = publish_post_record(self.make_post(product=None))
        self.assertEqual(record.status, 'failed')
        self.assertIn('image', record.error_message.lower())

    @override_settings(PUBLIC_MEDIA_BASE_URL='')
    @patch('socials.services.publisher.MetaGraphClient')
    def test_instagram_needs_public_url(self, mock_client_cls):
        record = publish_post_record(self.make_post(platform='instagram'))
        self.assertEqual(record.status, 'failed')
        self.assertIn('PUBLIC_MEDIA_BASE_URL', record.error_message)
        mock_client_cls.return_value.publish_instagram_photo.assert_not_called()

    @patch('socials.services.publisher.MetaGraphClient')
    def test_no_connected_page_fails(self, mock_client_cls):
        self.page.delete()
        record = publish_post_record(self.make_post())
        self.assertEqual(record.status, 'failed')


@override_settings(FERNET_KEY=TEST_KEY, PUBLIC_MEDIA_BASE_URL='https://pub.example.com')
class StoryPublisherTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        connection = MetaConnection.objects.create(tenant=self.tenant, fb_user_id='fb1')
        self.page = ConnectedPage.objects.create(
            tenant=self.tenant, connection=connection, page_id='p1',
            name='Store', instagram_account_id='ig1', status='connected',
        )
        self.page.set_access_token('pt1')
        self.page.save()
        self.product = Product.objects.create(
            tenant=self.tenant, name='Jacket', price=10,
            image=SimpleUploadedFile('jacket.png', PNG_BYTES, 'image/png'),
        )

    @patch('socials.services.publisher.MetaGraphClient')
    def test_facebook_story_publishes(self, mock_client_cls):
        mock_client_cls.return_value.publish_page_story.return_value = {
            'post_id': 'story1', 'post_url': 'https://facebook.com/story1'
        }
        record = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='ignored', status='pending', post_format='story',
        )
        publish_post_record(record)
        self.assertEqual(record.status, 'posted')
        mock_client_cls.return_value.publish_page_story.assert_called_once()
        mock_client_cls.return_value.publish_page_photo.assert_not_called()

    @patch('socials.services.publisher.MetaGraphClient')
    def test_instagram_story_publishes(self, mock_client_cls):
        mock_client_cls.return_value.publish_instagram_story.return_value = {
            'post_id': 'media5', 'post_url': ''
        }
        record = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='instagram',
            caption='', status='pending', post_format='story',
        )
        publish_post_record(record)
        self.assertEqual(record.status, 'posted')
        call = mock_client_cls.return_value.publish_instagram_story.call_args
        self.assertTrue(call.args[2].startswith('https://pub.example.com/'))
