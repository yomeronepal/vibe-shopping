import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import Order, OrderItem, Product, record_stock_change

logger = logging.getLogger(__name__)

DUPLICATE_WINDOW_MINUTES = 30
UPDATABLE_ORDER_STATUSES = ('pending_payment', 'pending_delivery')


class OrderRevisionError(Exception):
    """Raised inside the revision transaction to roll everything back."""


def resolve_line_quantity(product, requested):
    """Clamp the quantity to stock; untracked items have no limit."""
    quantity = max(1, int(requested))
    if not product.tracks_stock:
        return quantity
    return min(quantity, product.stock) if product.stock > 0 else 0


def apply_line_stock(product, quantity, note):
    """Deduct stock for a tracked line; untracked items are untouched."""
    if not product.tracks_stock:
        return
    product.stock -= quantity
    product.save(update_fields=['stock'])
    record_stock_change(product, -quantity, 'chat_order', note)


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


def order_value_cap(tenant):
    """Return the max order value the bot may auto-confirm (0 = no cap)."""
    try:
        return float((tenant.metadata or {}).get('maxAutoOrderValue') or 0)
    except (TypeError, ValueError):
        return 0


def estimate_order_total(tenant, items):
    """Price the extracted items against the live catalog."""
    ids = [item['product_id'] for item in items]
    products = {p.id: p for p in Product.objects.filter(tenant=tenant, id__in=ids)}
    total = 0
    for item in items:
        product = products.get(item['product_id'])
        if product:
            total += float(product.price) * max(1, int(item['quantity']))
    return total


def exceeds_order_cap(tenant, items):
    """Whether this order needs human approval due to its value."""
    cap = order_value_cap(tenant)
    if cap <= 0:
        return False
    return estimate_order_total(tenant, items) > cap


def find_updatable_order(conversation, order_id):
    """Return the bot order this conversation may still change, or None."""
    return Order.objects.filter(
        tenant=conversation.tenant,
        id=order_id,
        metadata__source='chat_bot',
        metadata__conversation_id=conversation.id,
        status__in=UPDATABLE_ORDER_STATUSES,
    ).first()


def restore_order_stock(order, products):
    """Give the order's current physical items their stock back."""
    for line in order.items.select_related('product'):
        product = products.get(line.product_id)
        if product is None or not product.tracks_stock:
            continue
        product.stock += line.quantity
        product.save(update_fields=['stock'])
        record_stock_change(product, line.quantity, 'chat_order', f'Order #{order.id} revised')


def add_revised_items(order, items, products):
    """Create the revised line items; returns the new total."""
    total = 0
    for item in items:
        product = products.get(item['product_id'])
        if product is None or product.status != 'published' or not product.is_active:
            continue
        quantity = resolve_line_quantity(product, item['quantity'])
        if quantity < 1:
            continue
        OrderItem.objects.create(
            order=order, product=product, quantity=quantity, price=product.price,
            size=item.get('size', ''), color=item.get('color', ''),
        )
        apply_line_stock(product, quantity, f'Order #{order.id} revised')
        total += product.price * quantity
    if not order.items.exists():
        raise OrderRevisionError()
    return total


def apply_order_revision(order, conversation, items, collected):
    """Swap the order's items and details for the revised ones."""
    ids = {item['product_id'] for item in items}
    ids.update(order.items.values_list('product_id', flat=True))
    products = {
        product.id: product
        for product in Product.objects.select_for_update().filter(
            tenant=conversation.tenant, id__in=ids,
        )
    }
    restore_order_stock(order, products)
    order.items.all().delete()
    order.total_amount = add_revised_items(order, items, products)
    name, phone = pick_customer_details(conversation, collected)
    if name:
        order.customer_name = name
    if phone:
        order.customer_phone = phone
    metadata = order.metadata or {}
    merged = dict(metadata.get('collected') or {})
    merged.update({key: value for key, value in collected.items() if str(value).strip()})
    metadata['collected'] = merged
    metadata['updated_via_chat_at'] = timezone.now().isoformat()
    order.metadata = metadata
    order.save(update_fields=['total_amount', 'customer_name', 'customer_phone', 'metadata'])


def update_chat_order(conversation, order_id, items, collected):
    """Revise a bot-placed order the customer asked to change.

    Stock from the old lines is restored before the new lines are
    applied, all within one transaction. Returns the updated Order,
    or None when the order is not updatable or nothing valid remains.
    """
    order = find_updatable_order(conversation, order_id)
    if order is None or not items:
        return None
    try:
        with transaction.atomic():
            apply_order_revision(order, conversation, items, collected)
    except OrderRevisionError:
        logger.info('Order %s revision produced no valid items; kept as-is', order_id)
        return None
    from inbox.services.crm import apply_collected_contact

    apply_collected_contact(conversation.customer, collected)
    logger.info('Chat bot updated order %s for conversation %s', order.id, conversation.id)
    return order


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
            quantity = resolve_line_quantity(product, item['quantity'])
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
            apply_line_stock(product, quantity, f'Order #{order.id}')
    from inbox.services.crm import apply_collected_contact
    apply_collected_contact(conversation.customer, collected)
    logger.info('Chat bot created order %s for conversation %s', order.id, conversation.id)
    return order
