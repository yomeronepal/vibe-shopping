import json
import logging
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)

BOOST_WINDOW_DAYS = 30
CACHE_HOURS = 12
MAX_RECOMMENDATIONS = 3
MIN_DAILY_BUDGET = 200
MAX_DAILY_BUDGET = 1500
VALLEY_HINTS = ('kathmandu', 'lalitpur', 'bhaktapur', 'patan', 'thimi', 'valley')


def engagement_of(post):
    """Total cached engagement for a post."""
    engagement = (post.metadata or {}).get('engagement') or {}
    return {
        'likes': int(engagement.get('likes', 0) or 0),
        'comments': int(engagement.get('comments', 0) or 0),
        'shares': int(engagement.get('shares', 0) or 0),
    }


def engagement_total(post):
    """Sum of likes, comments, and shares."""
    return sum(engagement_of(post).values())


def product_sales_map(tenant, since):
    """Per-product order count and revenue inside the window."""
    from django.db.models import Count, Sum

    from core.models import OrderItem

    rows = (
        OrderItem.objects.filter(
            order__tenant=tenant, order__created_at__gte=since,
        )
        .exclude(order__status__in=('cancelled', 'returned', 'disputed'))
        .values('product_id')
        .annotate(orders=Count('order_id', distinct=True), revenue=Sum('price'))
    )
    return {row['product_id']: row for row in rows}


def score_candidate(post, sales):
    """Rank a post by engagement and its product's proven demand."""
    stats = sales.get(post.product_id) or {}
    return engagement_total(post) * 3 + int(stats.get('orders', 0)) * 10


def suggest_plan(tenant, product):
    """Budget, duration, and audience heuristics for one product."""
    price = float(product.price)
    daily = int(min(MAX_DAILY_BUDGET, max(MIN_DAILY_BUDGET, round(price * 0.12, -1))))
    days = 7 if price >= 5000 else 5
    address = ((tenant.metadata or {}).get('contact') or {}).get('address', '').lower()
    audience = 'Kathmandu Valley' if any(hint in address for hint in VALLEY_HINTS) else 'All Nepal'
    return {
        'daily_budget': daily,
        'days': days,
        'total_budget': daily * days,
        'audience': f'{audience}, ages 18-44',
        'goal': 'More messages',
    }


def build_warnings(post, product, sales):
    """Reasons to hesitate before spending on this post."""
    warnings = []
    if product.tracks_stock and product.stock < 5:
        warnings.append(f'Only {product.stock} in stock — restock before boosting.')
    if engagement_total(post) == 0:
        warnings.append('No organic engagement yet — consider waiting a day or two.')
    stats = sales.get(product.id) or {}
    if not stats.get('orders'):
        warnings.append('No orders for this product in the last 30 days — start with a small budget.')
    return warnings


def build_candidate(tenant, post, sales):
    """Assemble one recommendation entry, without AI copy."""
    product = post.product
    stats = sales.get(product.id) or {}
    return {
        'post_id': post.id,
        'platform': post.platform,
        'post_url': post.post_url,
        'caption': (post.caption or '')[:140],
        'image': post.image.url if post.image else (
            (product.processed_image or product.image).url
            if (product.processed_image or product.image) else None
        ),
        'product': {
            'id': product.id,
            'name': product.name,
            'price': float(product.price),
            'stock': product.stock,
            'is_service': product.is_service,
        },
        'engagement': engagement_of(post),
        'orders_30d': int(stats.get('orders', 0)),
        'revenue_30d': float(stats.get('revenue', 0) or 0),
        'suggested': suggest_plan(tenant, product),
        'warnings': build_warnings(post, product, sales),
        'reasoning': '',
    }


def fallback_reasoning(item):
    """Deterministic rationale when the AI is unavailable."""
    parts = [f"{sum(item['engagement'].values())} engagements so far"]
    if item['orders_30d']:
        parts.append(f"{item['orders_30d']} order(s) worth Rs. {item['revenue_30d']:,.0f} in 30 days")
    plan = item['suggested']
    return (
        f"{item['product']['name']} is a strong pick: " + ', '.join(parts) +
        f". Rs. {plan['daily_budget']}/day for {plan['days']} days targeting "
        f"{plan['audience']} should bring new customers into your chat."
    )


def generate_reasonings(tenant, items):
    """Fill each item's reasoning via the AI, falling back gracefully."""
    from inbox.services.assistant import AssistantError, call_gemini

    summary = '\n'.join(
        f"{index + 1}. {item['product']['name']} — Rs. {item['product']['price']:g}, "
        f"stock {item['product']['stock']}, engagement {sum(item['engagement'].values())}, "
        f"orders last 30d: {item['orders_30d']} (Rs. {item['revenue_30d']:,.0f}), "
        f"plan: Rs. {item['suggested']['daily_budget']}/day x {item['suggested']['days']} days, "
        f"{item['suggested']['audience']}"
        for index, item in enumerate(items)
    )
    prompt = f"""You are the marketing advisor for a small Nepali business that sells through Facebook and Instagram chat.
For each post below, write ONE short recommendation (2 sentences, plain text, no markdown) explaining in simple English why boosting it is a good use of money and what result to expect. Be specific with the numbers given. Never invent numbers.

POSTS
{summary}

Respond with ONLY a JSON array of strings, one per post, same order."""
    try:
        raw = call_gemini(prompt, tenant, 'boost_advice')
        cleaned = raw.strip().strip('`')
        if cleaned.startswith('json'):
            cleaned = cleaned[4:]
        reasonings = json.loads(cleaned.strip())
        for item, text in zip(items, reasonings):
            item['reasoning'] = str(text).strip()[:400]
    except (AssistantError, ValueError, TypeError):
        logger.info('Boost advice AI copy unavailable; using fallback text')
    for item in items:
        if not item['reasoning']:
            item['reasoning'] = fallback_reasoning(item)
    return items


def compute_boost_advice(tenant):
    """Score recent posts and return the top boost recommendations."""
    from core.models import SocialMediaPost

    since = timezone.now() - timedelta(days=BOOST_WINDOW_DAYS)
    posts = list(
        SocialMediaPost.objects.filter(
            tenant=tenant, status='posted', created_at__gte=since,
            product__isnull=False, product__status='published',
        )
        .exclude(post_url='')
        .select_related('product')
    )
    sales = product_sales_map(tenant, since)
    boostable = [
        post for post in posts
        if not post.product.tracks_stock or post.product.stock > 0
    ]
    ranked = sorted(boostable, key=lambda post: score_candidate(post, sales), reverse=True)
    items = [build_candidate(tenant, post, sales) for post in ranked[:MAX_RECOMMENDATIONS]]
    if items:
        generate_reasonings(tenant, items)
    return {
        'generated_at': timezone.now().isoformat(),
        'window_days': BOOST_WINDOW_DAYS,
        'recommendations': items,
        'posts_considered': len(posts),
    }


def get_boost_advice(tenant, refresh=False):
    """Return cached advice when fresh, recomputing otherwise."""
    cached = (tenant.metadata or {}).get('boostAdvice') or {}
    if not refresh and cached.get('generated_at') and cached.get('recommendations'):
        from django.utils.dateparse import parse_datetime

        generated = parse_datetime(cached['generated_at'])
        if generated and timezone.now() - generated < timedelta(hours=CACHE_HOURS):
            return cached
    advice = compute_boost_advice(tenant)
    metadata = tenant.metadata or {}
    metadata['boostAdvice'] = advice
    tenant.metadata = metadata
    tenant.save(update_fields=['metadata'])
    return advice
