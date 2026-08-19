from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.query import QuerySet
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Product, SocialMediaPost, Tenant, VendorProfile
from socials.models import ConnectedPage, MetaConnection
from socials.test.test_publisher import PNG_BYTES

TEST_KEY = Fernet.generate_key().decode()


@override_settings(FERNET_KEY=TEST_KEY)
class PostApiTests(APITestCase):
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
        self.product = Product.objects.create(
            tenant=self.tenant, name='Jacket', price=10,
            image=SimpleUploadedFile('jacket.png', PNG_BYTES, 'image/png'),
        )
        self.future = (timezone.now() + timezone.timedelta(days=1)).isoformat()

    def test_create_scheduled_two_platforms(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': 'Weekend drop',
            'platforms': ['facebook', 'instagram'],
            'product_id': self.product.id,
            'scheduled_for': self.future,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(
            SocialMediaPost.objects.filter(status='scheduled').count(), 2
        )

    def test_create_draft_free_form_with_upload(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': 'Announcement',
            'platforms': ['facebook'],
            'save_as': 'draft',
            'image': SimpleUploadedFile('promo.png', PNG_BYTES, 'image/png'),
        }, format='multipart')
        self.assertEqual(response.status_code, 201)
        post = SocialMediaPost.objects.get()
        self.assertEqual(post.status, 'draft')
        self.assertIsNone(post.product)
        self.assertTrue(post.image)
        self.assertIsNotNone(response.data[0]['image_url'])

    def test_create_requires_product_or_image(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': 'x', 'platforms': ['facebook'], 'scheduled_for': self.future,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_past_schedule(self):
        past = (timezone.now() - timezone.timedelta(hours=1)).isoformat()
        response = self.client.post('/api/socials/posts/', {
            'caption': 'x', 'platforms': ['facebook'],
            'product_id': self.product.id, 'scheduled_for': past,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    @patch('socials.views.publish_post_record')
    def test_immediate_publish_response_shape_unchanged(self, mock_publish):
        def fake_publish(record):
            record.status = 'posted'
            record.post_url = 'https://facebook.com/x'
            record.save()
            return record

        mock_publish.side_effect = fake_publish
        response = self.client.post('/api/socials/posts/', {
            'caption': 'now', 'platforms': ['facebook'], 'product_id': self.product.id,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['status'], 'posted')

    @patch('socials.views.publish_post_record')
    def test_immediate_publish_free_form_with_upload(self, mock_publish):
        def fake_publish(record):
            record.status = 'posted'
            record.post_url = 'https://facebook.com/x'
            record.save()
            return record

        mock_publish.side_effect = fake_publish
        response = self.client.post('/api/socials/posts/', {
            'caption': 'now', 'platforms': ['facebook'],
            'image': SimpleUploadedFile('promo.png', PNG_BYTES, 'image/png'),
        }, format='multipart')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['status'], 'posted')
        post = SocialMediaPost.objects.get()
        self.assertIsNone(post.product)
        self.assertTrue(post.image)

    def test_create_draft_two_platforms_reuses_uploaded_image(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': 'Weekend drop',
            'platforms': ['facebook', 'instagram'],
            'save_as': 'draft',
            'image': SimpleUploadedFile('promo.png', PNG_BYTES, 'image/png'),
        }, format='multipart')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(SocialMediaPost.objects.count(), 2)
        for post in SocialMediaPost.objects.all():
            self.assertEqual(post.image.size, len(PNG_BYTES))

    def test_list_filters_by_range_and_status(self):
        inside = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='in', status='scheduled',
            scheduled_for=timezone.now() + timezone.timedelta(days=1),
        )
        SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='out', status='scheduled',
            scheduled_for=timezone.now() + timezone.timedelta(days=40),
        )
        start = timezone.now().date().isoformat()
        end = (timezone.now() + timezone.timedelta(days=7)).date().isoformat()
        response = self.client.get(f'/api/socials/posts/?from={start}&to={end}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p['id'] for p in response.data], [inside.id])
        filtered = self.client.get(f'/api/socials/posts/?from={start}&to={end}&status=draft')
        self.assertEqual(filtered.data, [])

    def test_patch_draft_promotes_to_scheduled(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='draft', status='draft',
        )
        response = self.client.patch(f'/api/socials/posts/{post.id}/', {
            'caption': 'updated', 'scheduled_for': self.future,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.status, 'scheduled')
        self.assertEqual(post.caption, 'updated')

    def test_patch_posted_rejected(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='done', status='posted',
        )
        response = self.client.patch(f'/api/socials/posts/{post.id}/', {'caption': 'x'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_patch_pending_rejected(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='claimed', status='pending',
        )
        response = self.client.patch(f'/api/socials/posts/{post.id}/', {'caption': 'x'}, format='json')
        self.assertEqual(response.status_code, 400)
        post.refresh_from_db()
        self.assertEqual(post.status, 'pending')
        self.assertEqual(post.caption, 'claimed')

    def test_patch_success_persists_scheduled_status_and_id(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='draft', status='draft',
        )
        response = self.client.patch(f'/api/socials/posts/{post.id}/', {
            'caption': 'updated', 'scheduled_for': self.future,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        row = SocialMediaPost.objects.get(id=post.id)
        self.assertEqual(row.id, post.id)
        self.assertEqual(row.status, 'scheduled')

    def test_patch_locks_row_with_select_for_update(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='draft', status='draft',
        )
        original_select_for_update = QuerySet.select_for_update
        with patch.object(
            QuerySet, 'select_for_update', autospec=True, side_effect=original_select_for_update
        ) as mock_lock:
            response = self.client.patch(f'/api/socials/posts/{post.id}/', {
                'caption': 'updated',
            }, format='json')
        self.assertEqual(response.status_code, 200)
        mock_lock.assert_called_once()

    def test_delete_scheduled(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='bye', status='scheduled',
            scheduled_for=timezone.now() + timezone.timedelta(days=1),
        )
        response = self.client.delete(f'/api/socials/posts/{post.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SocialMediaPost.objects.filter(id=post.id).exists())

    def test_delete_posted_rejected(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='keep', status='posted',
        )
        response = self.client.delete(f'/api/socials/posts/{post.id}/')
        self.assertEqual(response.status_code, 400)

    @patch('socials.views.publish_scheduled_post')
    def test_retry_failed(self, mock_task):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='oops', status='failed', error_message='boom',
        )
        response = self.client.post(f'/api/socials/posts/{post.id}/retry/')
        self.assertEqual(response.status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.status, 'pending')
        mock_task.delay.assert_called_once_with(post.id)

    def test_retry_non_failed_rejected(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=self.product, platform='facebook',
            caption='fine', status='scheduled',
            scheduled_for=timezone.now() + timezone.timedelta(days=1),
        )
        response = self.client.post(f'/api/socials/posts/{post.id}/retry/')
        self.assertEqual(response.status_code, 400)

    def test_cross_tenant_404(self):
        other = Tenant.objects.create(name='Other', subdomain='other')
        foreign = SocialMediaPost.objects.create(
            tenant=other, platform='facebook', caption='x', status='draft',
        )
        for method, url, payload in [
            ('patch', f'/api/socials/posts/{foreign.id}/', {'caption': 'x'}),
            ('delete', f'/api/socials/posts/{foreign.id}/', None),
            ('post', f'/api/socials/posts/{foreign.id}/retry/', None),
        ]:
            response = getattr(self.client, method)(url, payload, format='json')
            self.assertEqual(response.status_code, 404)

    def test_create_scheduled_story(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': '',
            'platforms': ['facebook'],
            'product_id': self.product.id,
            'scheduled_for': self.future,
            'post_format': 'story',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data[0]['post_format'], 'story')
        self.assertEqual(SocialMediaPost.objects.get().post_format, 'story')

    def test_create_rejects_invalid_format(self):
        response = self.client.post('/api/socials/posts/', {
            'caption': 'x', 'platforms': ['facebook'],
            'product_id': self.product.id, 'scheduled_for': self.future,
            'post_format': 'reel',
        }, format='json')
        self.assertEqual(response.status_code, 400)
