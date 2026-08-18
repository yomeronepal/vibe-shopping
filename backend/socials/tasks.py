import logging

from celery import shared_task

from socials.models import WebhookEvent

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
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
