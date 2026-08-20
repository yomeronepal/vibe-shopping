import logging

from celery import shared_task
from django.db import Error as DatabaseError
from django.db import transaction
from django.utils import timezone

from core.models import SocialMediaPost
from socials.models import WebhookEvent
from socials.services.publisher import TransientPublishError, publish_post_record
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

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
def refresh_instagram_tokens():
    """Extend long-lived tokens for direct Instagram connections."""
    from socials.models import ConnectedPage
    from socials.services.instagram_login import refresh_instagram_token

    refreshed = 0
    pages = ConnectedPage.objects.filter(connection_type='instagram_direct', status='connected')
    for page in pages:
        new_token = refresh_instagram_token(page.get_access_token())
        if new_token:
            page.set_access_token(new_token)
            page.save()
            refreshed += 1
    return refreshed


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
        logger.warning('Retrying publish %s after transient error: %s', post_id, exc)
        raise self.retry()
    return post_id


@shared_task
def refresh_recent_engagement():
    """Refresh cached engagement for recently published posts."""
    from datetime import timedelta

    from socials.models import ConnectedPage

    cutoff = timezone.now() - timedelta(days=7)
    posts = (
        SocialMediaPost.objects.filter(status='posted', created_at__gte=cutoff)
        .exclude(platform_post_id='')
        .exclude(platform_post_id__startswith='local-')
    )
    client = MetaGraphClient()
    pages = {}
    refreshed = 0
    for post in posts:
        page = pages.get(post.tenant_id)
        if page is None:
            page = ConnectedPage.objects.filter(
                tenant_id=post.tenant_id, status='connected'
            ).first() or False
            pages[post.tenant_id] = page
        if not page:
            continue
        try:
            if post.platform == 'instagram':
                engagement = client.get_instagram_media_engagement(
                    post.platform_post_id, page.get_access_token()
                )
            else:
                engagement = client.get_post_engagement(
                    post.platform_post_id, page.get_access_token()
                )
        except MetaGraphError as exc:
            logger.info('Engagement refresh failed for post %s: %s', post.id, exc)
            continue
        metadata = post.metadata or {}
        metadata['engagement'] = {**engagement, 'fetched_at': timezone.now().isoformat()}
        post.metadata = metadata
        post.save(update_fields=['metadata'])
        refreshed += 1
    return refreshed
