from unittest.mock import patch

from celery.exceptions import Retry
from django.test import TestCase
from django.utils import timezone

from core.models import SocialMediaPost, Tenant
from socials.services.publisher import TransientPublishError
from socials.tasks import publish_due_posts, publish_scheduled_post


class SchedulingTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')

    def make_post(self, **kwargs):
        defaults = {
            'tenant': self.tenant, 'platform': 'facebook',
            'caption': 'Hi', 'status': 'scheduled',
            'scheduled_for': timezone.now() - timezone.timedelta(minutes=1),
        }
        defaults.update(kwargs)
        return SocialMediaPost.objects.create(**defaults)

    @patch('socials.tasks.publish_scheduled_post')
    def test_claims_only_due_scheduled_posts(self, mock_task):
        due = self.make_post()
        future = self.make_post(scheduled_for=timezone.now() + timezone.timedelta(hours=1))
        draft = self.make_post(status='draft', scheduled_for=None)
        claimed = publish_due_posts()
        self.assertEqual(claimed, 1)
        due.refresh_from_db()
        future.refresh_from_db()
        draft.refresh_from_db()
        self.assertEqual(due.status, 'pending')
        self.assertEqual(future.status, 'scheduled')
        self.assertEqual(draft.status, 'draft')
        mock_task.delay.assert_called_once_with(due.id)

    @patch('socials.tasks.publish_post_record')
    def test_worker_publishes_pending_record(self, mock_publish):
        post = self.make_post(status='pending')
        publish_scheduled_post.push_request(retries=0)
        try:
            publish_scheduled_post.run(post.id)
        finally:
            publish_scheduled_post.pop_request()
        mock_publish.assert_called_once()

    @patch('socials.tasks.publish_post_record')
    def test_worker_skips_non_pending(self, mock_publish):
        post = self.make_post(status='posted')
        publish_scheduled_post.push_request(retries=0)
        try:
            publish_scheduled_post.run(post.id)
        finally:
            publish_scheduled_post.pop_request()
        mock_publish.assert_not_called()

    @patch('socials.tasks.publish_post_record', side_effect=TransientPublishError('down'))
    def test_transient_error_retries(self, mock_publish):
        post = self.make_post(status='pending')
        publish_scheduled_post.push_request(retries=0)
        try:
            with self.assertRaises(Retry):
                publish_scheduled_post.run(post.id)
        finally:
            publish_scheduled_post.pop_request()

    @patch('socials.tasks.publish_post_record', side_effect=TransientPublishError('down'))
    def test_transient_error_exhaustion_marks_failed(self, mock_publish):
        post = self.make_post(status='pending')
        publish_scheduled_post.push_request(retries=2)
        try:
            publish_scheduled_post.run(post.id)
        finally:
            publish_scheduled_post.pop_request()
        post.refresh_from_db()
        self.assertEqual(post.status, 'failed')
        self.assertIn('down', post.error_message)
