import hashlib
import io
import logging

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

CARD_WIDTH = 900
MIN_BAR_HEIGHT = 96
FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def card_cache_path(product):
    """Return the cache path, keyed by the label-relevant fields."""
    source = product.processed_image or product.image
    digest = hashlib.md5(
        f'{product.name}|{product.price}|{product.product_code}|{source.name}'.encode()
    ).hexdigest()[:12]
    return f'card_cache/product-{product.id}-{digest}.jpg'


def load_font(size):
    """Best available font at the requested size."""
    from PIL import ImageFont

    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        pass
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return ImageFont.load_default()


def compose_card(product, source):
    """Render the product photo with a name, SKU, and price bar."""
    from PIL import Image, ImageDraw

    from inbox.services.assistant import format_price

    with source.open('rb') as handle:
        image = Image.open(handle).convert('RGB')
        ratio = CARD_WIDTH / image.width
        image = image.resize((CARD_WIDTH, max(1, int(image.height * ratio))))
    bar_height = max(MIN_BAR_HEIGHT, int(image.height * 0.16))
    canvas = Image.new('RGB', (image.width, image.height + bar_height), (17, 17, 22))
    canvas.paste(image, (0, 0))
    draw = ImageDraw.Draw(canvas)
    detail = f'SKU {product.product_code}  |  Rs. {format_price(product.price)}'
    draw.text((28, image.height + 12), product.name[:42], fill=(255, 255, 255), font=load_font(34))
    draw.text((28, image.height + bar_height - 42), detail, fill=(186, 196, 214), font=load_font(26))
    buffer = io.BytesIO()
    canvas.save(buffer, format='JPEG', quality=88)
    return buffer.getvalue()


def labeled_card_url(product):
    """Public URL of the labeled card photo, or None when unavailable.

    The composited image is cached in media storage and regenerated
    only when the name, price, SKU, or source photo changes. Falls
    back to the raw product photo if composition fails.
    """
    base = (settings.PUBLIC_MEDIA_BASE_URL or '').rstrip('/')
    source = product.processed_image or product.image
    if not base or not source:
        return None
    path = card_cache_path(product)
    try:
        if not default_storage.exists(path):
            default_storage.save(path, ContentFile(compose_card(product, source)))
    except Exception:
        logger.warning('Card labeling failed for product %s', product.id, exc_info=True)
        from socials.services.publisher import build_public_image_url

        return build_public_image_url(source)
    return f'{base}{default_storage.url(path)}'
