from django.test import TestCase
from django.utils import timezone

from core.models import Product, SocialMediaPost, Tenant


class SocialMediaPostModelTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')

    def test_free_form_post_without_product(self):
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, platform='facebook', caption='Announcement',
            status='draft',
        )
        self.assertIsNone(post.product)
        self.assertEqual(post.status, 'draft')

    def test_scheduled_post_fields(self):
        when = timezone.now() + timezone.timedelta(hours=2)
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, platform='instagram', caption='Soon',
            status='scheduled', scheduled_for=when,
        )
        post.refresh_from_db()
        self.assertEqual(post.status, 'scheduled')
        self.assertEqual(post.scheduled_for, when)

    def test_product_post_still_works(self):
        product = Product.objects.create(tenant=self.tenant, name='Jacket', price=10)
        post = SocialMediaPost.objects.create(
            tenant=self.tenant, product=product, platform='facebook', caption='Buy'
        )
        self.assertEqual(post.status, 'pending')
