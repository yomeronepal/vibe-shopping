import logging

from celery import shared_task

from socials.models import WebhookEvent

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_webhook_event(self, event_id):
    """Bookkeeping hook for inbound events; the inbox cycle extends this."""
    try:
        event = WebhookEvent.objects.get(id=event_id)
    except WebhookEvent.DoesNotExist as exc:
        raise self.retry(exc=exc)
    logger.info('Received %s webhook event %s', event.object_type, event.id)
    return event.id
