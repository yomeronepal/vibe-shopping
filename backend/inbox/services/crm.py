from django.db.models import Q

from core.models import Order


def orders_for_customer(customer):
    """Return the customer's orders, linked by conversation or phone."""
    conversation_ids = list(customer.conversations.values_list('id', flat=True))
    query = Q(metadata__conversation_id__in=conversation_ids)
    if customer.phone:
        query = query | Q(customer_phone=customer.phone)
    return (
        Order.objects.filter(tenant=customer.tenant)
        .filter(query)
        .prefetch_related('items__product')
        .order_by('-created_at')
    )


def resolve_customer_status(order_count):
    """Label the customer by how much they have bought."""
    if order_count == 0:
        return 'prospect'
    if order_count == 1:
        return 'customer'
    return 'repeat customer'


def build_customer_card(customer):
    """Assemble the CRM card: profile plus purchase and activity metrics."""
    orders = list(orders_for_customer(customer))
    counted = [order for order in orders if order.status not in ('cancelled', 'returned', 'disputed')]
    total_spent = sum(float(order.total_amount) for order in counted)
    last_order = counted[0] if counted else None
    interests = []
    for order in orders:
        for item in order.items.all():
            if item.product.name not in interests:
                interests.append(item.product.name)
    last_message = customer.conversations.order_by('-last_message_at').values_list(
        'last_message_at', flat=True
    ).first()
    recent_orders = [
        {
            'id': order.id,
            'total_amount': str(order.total_amount),
            'status': order.status,
            'created_at': order.created_at,
            'summary': ', '.join(
                f'{item.quantity}× {item.product.name[:30]}' for item in order.items.all()
            )[:120],
        }
        for order in orders[:8]
    ]
    return {
        'id': customer.id,
        'platform': customer.platform,
        'platform_user_id': customer.platform_user_id,
        'name': customer.name,
        'profile_pic_url': customer.profile_pic_url,
        'phone': customer.phone,
        'email': customer.email,
        'location': customer.location,
        'notes': customer.notes,
        'tags': customer.tags,
        'status': resolve_customer_status(len(counted)),
        'order_count': len(counted),
        'total_spent': round(total_spent, 2),
        'last_purchase_at': last_order.created_at if last_order else None,
        'product_interests': interests[:6],
        'last_active_at': last_message,
        'recent_orders': recent_orders,
    }


def apply_collected_contact(customer, collected):
    """Fill empty contact fields from chat-collected order details."""
    lowered = {key.lower(): str(value).strip() for key, value in (collected or {}).items()}
    updates = []
    if not customer.phone:
        phone = next((v for k, v in lowered.items() if 'phone' in k or 'number' in k), '')
        if phone:
            customer.phone = phone[:30]
            updates.append('phone')
    if not customer.email:
        email = next((v for k, v in lowered.items() if 'email' in k or '@' in v), '')
        if email and '@' in email:
            customer.email = email[:254]
            updates.append('email')
    if not customer.location:
        location = next((v for k, v in lowered.items() if 'address' in k or 'location' in k), '')
        if location:
            customer.location = location[:255]
            updates.append('location')
    if not customer.name:
        name = next((v for k, v in lowered.items() if 'name' in k), '')
        if name:
            customer.name = name[:255]
            updates.append('name')
    if updates:
        customer.save(update_fields=updates)
    return updates
