import logging

from django.conf import settings

from socials.models import ConnectedPage
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

NETWORK_ERROR_MESSAGE = 'Could not reach Facebook'


class TransientPublishError(Exception):
    """A publish failure worth retrying (network-level)."""


def build_public_image_url(image_field):
    """Return a publicly reachable URL for the image or None."""
    base = settings.PUBLIC_MEDIA_BASE_URL.rstrip('/')
    if not base:
        return None
    return f'{base}{image_field.url}'


def resolve_image_source(image_field, product):
    """Return the best image field for a post or None."""
    if image_field:
        return image_field
    if product and product.processed_image:
        return product.processed_image
    if product and product.image:
        return product.image
    if product:
        first_gallery = product.images.first()
        return first_gallery.image if first_gallery else None
    return None


def publish_facebook(client, page, image_field, caption):
    """Post the image to the Page feed as a photo post."""
    with image_field.open('rb') as handle:
        return client.publish_page_photo(
            page.page_id, page.get_access_token(), handle, caption
        )


def publish_instagram(client, page, image_field, caption):
    """Post the image to the Page's linked IG professional account."""
    if not page.instagram_account_id:
        raise MetaGraphError('No Instagram account is linked to the connected Page')
    image_url = build_public_image_url(image_field)
    if not image_url:
        raise MetaGraphError(
            'Instagram needs a publicly reachable image URL. '
            'Set PUBLIC_MEDIA_BASE_URL (e.g. an ngrok URL) and restart the backend.'
        )
    return client.publish_instagram_photo(
        page.instagram_account_id, page.get_access_token(), image_url, caption
    )


PLATFORM_PUBLISHERS = {
    'facebook': publish_facebook,
    'instagram': publish_instagram,
}


def mark_failed(record, message):
    """Persist a failure outcome on the record."""
    record.status = 'failed'
    record.error_message = message
    record.save()
    logger.warning('Social publish %s failed: %s', record.id, message)
    return record


def publish_post_record(record):
    """Publish one post record; transient network errors raise for retry."""
    page = ConnectedPage.objects.filter(tenant=record.tenant, status='connected').first()
    if not page:
        return mark_failed(record, 'Connect a Facebook Page first')
    image_field = resolve_image_source(record.image, record.product)
    if not image_field:
        return mark_failed(record, 'Post has no image')
    client = MetaGraphClient()
    try:
        outcome = PLATFORM_PUBLISHERS[record.platform](client, page, image_field, record.caption)
    except MetaGraphError as exc:
        if str(exc) == NETWORK_ERROR_MESSAGE:
            raise TransientPublishError(str(exc))
        return mark_failed(record, str(exc))
    record.status = 'posted'
    record.platform_post_id = outcome.get('post_id', '')
    record.post_url = outcome.get('post_url') or None
    record.error_message = ''
    record.save()
    return record
