import logging

from celery import shared_task
from django.db import Error as DatabaseError
from django.db import transaction
from django.utils import timezone

from core.models import SocialMediaPost
from socials.models import WebhookEvent
from socials.services.publisher import TransientPublishError, publish_post_record

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30, autoretry_for=(DatabaseError,))
def process_webhook_event(self, event_id):
    """Parse an inbound Meta event into inbox conversations and messages."""
    try:
        event = WebhookEvent.objects.get(id=event_id)
    except WebhookEvent.DoesNotExist as exc:
        raise self.retry(exc=exc)
    if event.processed:
        return event.id
    from inbox.services.ingest import ingest_webhook_event
    created = ingest_webhook_event(event)
    event.processed = True
    event.save()
    logger.info('Processed %s event %s: %s messages', event.object_type, event.id, created)
    return event.id


@shared_task
def publish_due_posts():
    """Claim due scheduled posts and queue them for publishing."""
    now = timezone.now()
    with transaction.atomic():
        due_ids = list(
            SocialMediaPost.objects.select_for_update(skip_locked=True)
            .filter(status='scheduled', scheduled_for__lte=now)
            .values_list('id', flat=True)
        )
        SocialMediaPost.objects.filter(id__in=due_ids).update(status='pending')
    for post_id in due_ids:
        publish_scheduled_post.delay(post_id)
    return len(due_ids)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def publish_scheduled_post(self, post_id):
    """Publish one claimed post, retrying transient network failures."""
    record = SocialMediaPost.objects.filter(id=post_id).first()
    if not record or record.status != 'pending':
        return post_id
    try:
        publish_post_record(record)
    except TransientPublishError as exc:
        if self.request.retries >= self.max_retries:
            record.status = 'failed'
            record.error_message = str(exc)
            record.save()
            return post_id
        raise self.retry()
    return post_id
