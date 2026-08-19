import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import Order, OrderItem, Product

logger = logging.getLogger(__name__)

DUPLICATE_WINDOW_MINUTES = 30


def find_recent_chat_order(conversation):
    """Return a recent bot-created order for this conversation, if any."""
    cutoff = timezone.now() - timedelta(minutes=DUPLICATE_WINDOW_MINUTES)
    return (
        Order.objects.filter(
            tenant=conversation.tenant,
            created_at__gte=cutoff,
            metadata__source='chat_bot',
            metadata__conversation_id=conversation.id,
        )
        .exclude(status='cancelled')
        .first()
    )


def pick_customer_details(conversation, collected):
    """Derive name and phone from collected fields, with fallbacks."""
    lowered = {key.lower(): value for key, value in collected.items()}
    name = next((v for k, v in lowered.items() if 'name' in k), '') or conversation.customer.name
    phone = next((v for k, v in lowered.items() if 'phone' in k or 'number' in k), '')
    return name[:255], phone[:20]


def create_chat_order(conversation, items, collected):
    """Create an order from bot-gathered chat details.

    Args:
        conversation: The inbox conversation the order came from.
        items: Validated [{product_id, quantity}] entries.
        collected: The template fields gathered from the customer.

    Returns:
        The created Order, or None when nothing valid could be created
        or a recent order for this conversation already exists.
    """
    if not items:
        return None
    if find_recent_chat_order(conversation):
        logger.info('Skipping duplicate chat order for conversation %s', conversation.id)
        return None
    tenant = conversation.tenant
    name, phone = pick_customer_details(conversation, collected)
    with transaction.atomic():
        products = Product.objects.select_for_update().filter(
            tenant=tenant,
            id__in=[item['product_id'] for item in items],
            status='published',
            is_active=True,
        )
        by_id = {product.id: product for product in products}
        lines = []
        total = 0
        for item in items:
            product = by_id.get(item['product_id'])
            if product is None:
                continue
            quantity = min(max(1, int(item['quantity'])), product.stock) if product.stock > 0 else 0
            if quantity < 1:
                continue
            lines.append((product, quantity, item.get('size', ''), item.get('color', '')))
            total += product.price * quantity
        if not lines:
            return None
        order = Order.objects.create(
            tenant=tenant,
            user=None,
            total_amount=total,
            status='pending_delivery',
            payment_method='cash',
            order_type='online',
            customer_name=name,
            customer_phone=phone,
            metadata={
                'source': 'chat_bot',
                'conversation_id': conversation.id,
                'platform': conversation.platform,
                'collected': collected,
            },
        )
        for product, quantity, size, color in lines:
            OrderItem.objects.create(
                order=order, product=product, quantity=quantity, price=product.price,
                size=size, color=color,
            )
            product.stock -= quantity
            product.save(update_fields=['stock'])
    logger.info('Chat bot created order %s for conversation %s', order.id, conversation.id)
    return order
