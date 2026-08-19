from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import AITokenUsage, Order, OrderItem, SocialMediaPost

from .order_views import get_request_tenant

COUNTED_EXCLUDED = ('cancelled', 'returned', 'disputed')


def sales_summary(tenant, since):
    """Aggregate order metrics for the window."""
    orders = Order.objects.filter(tenant=tenant, created_at__gte=since)
    counted = orders.exclude(status__in=COUNTED_EXCLUDED)
    revenue = float(counted.aggregate(total=Sum('total_amount'))['total'] or 0)
    counted_n = counted.count()
    best_sellers = list(
        OrderItem.objects.filter(order__in=counted)
        .values('product__name')
        .annotate(units=Sum('quantity'), revenue=Sum('price'))
        .order_by('-units')[:5]
    )
    buyers = {}
    for order in counted:
        key = order.customer_phone or (order.metadata or {}).get('conversation_id') or f'order-{order.id}'
        buyers[key] = buyers.get(key, 0) + 1
    return {
        'total_orders': counted_n,
        'revenue': round(revenue, 2),
        'average_order_value': round(revenue / counted_n, 2) if counted_n else 0,
        'cancelled_orders': orders.filter(status='cancelled').count(),
        'returned_orders': orders.filter(status='returned').count(),
        'repeat_customers': sum(1 for count in buyers.values() if count >= 2),
        'best_sellers': [
            {'name': row['product__name'], 'units': row['units'], 'revenue': float(row['revenue'] or 0)}
            for row in best_sellers
        ],
    }


def average_response_minutes(conversations):
    """Average minutes from a customer message to the next reply."""
    deltas = []
    for conversation in conversations:
        pending_at = None
        for message in conversation.messages.order_by('sent_at')[:200]:
            if message.direction == 'in' and pending_at is None:
                pending_at = message.sent_at
            elif message.direction == 'out' and pending_at is not None:
                deltas.append((message.sent_at - pending_at).total_seconds())
                pending_at = None
    if not deltas:
        return None
    return round(sum(deltas) / len(deltas) / 60, 1)


def fetch_follower_counts(tenant):
    """Best-effort live follower counts from Meta."""
    from socials.models import ConnectedPage
    from socials.services.meta_graph import MetaGraphClient, MetaGraphError

    page = ConnectedPage.objects.filter(tenant=tenant, status='connected').first()
    if page is None:
        return {'facebook': None, 'instagram': None}
    client = MetaGraphClient()
    result = {'facebook': None, 'instagram': None}
    try:
        payload = client.get(f'/{page.page_id}', {
            'access_token': page.get_access_token(),
            'fields': 'followers_count,fan_count',
        })
        result['facebook'] = payload.get('followers_count') or payload.get('fan_count')
    except MetaGraphError:
        pass
    if page.instagram_account_id:
        try:
            payload = client.get(f'/{page.instagram_account_id}', {
                'access_token': page.get_access_token(),
                'fields': 'followers_count',
            })
            result['instagram'] = payload.get('followers_count')
        except MetaGraphError:
            pass
    return result


def engagement_score(post):
    """Total engagement recorded for a published post."""
    engagement = (post.metadata or {}).get('engagement') or {}
    return sum(int(engagement.get(key, 0) or 0) for key in ('likes', 'comments', 'shares'))


def social_summary(tenant, since):
    """Aggregate inbox and post-performance metrics for the window."""
    from inbox.models import Conversation, Message

    conversations = Conversation.objects.filter(tenant=tenant, last_message_at__gte=since)
    messages = Message.objects.filter(conversation__tenant=tenant, sent_at__gte=since)
    posted = list(
        SocialMediaPost.objects.filter(tenant=tenant, status='posted', created_at__gte=since)
        .select_related('product')
    )
    ranked = sorted(posted, key=engagement_score, reverse=True)
    best_posts = [
        {
            'caption': (post.caption or 'Story')[:60],
            'platform': post.platform,
            'engagement': engagement_score(post),
            'post_url': post.post_url,
        }
        for post in ranked[:5] if engagement_score(post) > 0
    ]
    by_product = {}
    for post in posted:
        if post.product:
            entry = by_product.setdefault(post.product.name, 0)
            by_product[post.product.name] = entry + engagement_score(post)
    best_products = sorted(
        ({'name': name, 'engagement': score} for name, score in by_product.items() if score > 0),
        key=lambda row: row['engagement'], reverse=True,
    )[:5]
    return {
        'messages_received': messages.filter(direction='in').count(),
        'comments_received': messages.filter(direction='in', source='comment').count(),
        'average_response_minutes': average_response_minutes(conversations[:100]),
        'followers': fetch_follower_counts(tenant),
        'best_posts': best_posts,
        'best_products': best_products,
    }


def ai_summary(tenant, since):
    """Aggregate assistant activity, outcomes, and cost for the window."""
    from inbox.models import Conversation

    ai_convos = Conversation.objects.filter(
        tenant=tenant, messages__sent_by_ai=True, messages__sent_at__gte=since,
    ).distinct()
    ai_total = ai_convos.count()
    handoffs = ai_convos.filter(ai_paused=True).count()
    ai_orders = Order.objects.filter(
        tenant=tenant, created_at__gte=since, metadata__source='chat_bot',
    ).exclude(status__in=COUNTED_EXCLUDED)
    ai_order_count = ai_orders.count()
    usage = AITokenUsage.objects.filter(tenant=tenant, created_at__gte=since)
    by_provider = list(
        usage.values('ai_provider')
        .annotate(calls=Count('id'), tokens=Sum('total_tokens'), cost=Sum('estimated_cost'))
        .order_by('-calls')
    )
    return {
        'ai_conversations': ai_total,
        'handoff_rate': round(handoffs / ai_total, 2) if ai_total else 0,
        'resolution_rate': round((ai_total - handoffs) / ai_total, 2) if ai_total else 0,
        'ai_orders': ai_order_count,
        'ai_order_revenue': float(ai_orders.aggregate(total=Sum('total_amount'))['total'] or 0),
        'ai_conversion_rate': round(ai_order_count / ai_total, 2) if ai_total else 0,
        'usage': [
            {
                'provider': row['ai_provider'],
                'calls': row['calls'],
                'tokens': int(row['tokens'] or 0),
                'cost_usd': float(row['cost'] or 0),
            }
            for row in by_provider
        ],
        'failed_calls': usage.filter(success=False).count(),
    }


class AnalyticsSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the full analytics summary for the requested window."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            days = min(365, max(1, int(request.query_params.get('days', 30))))
        except (TypeError, ValueError):
            days = 30
        since = timezone.now() - timedelta(days=days)
        from inbox.models import Conversation

        conversations_n = Conversation.objects.filter(tenant=tenant, last_message_at__gte=since).count()
        sales = sales_summary(tenant, since)
        converted = (
            Order.objects.filter(tenant=tenant, created_at__gte=since, metadata__source='chat_bot')
            .exclude(status__in=COUNTED_EXCLUDED)
            .values_list('metadata__conversation_id', flat=True)
        )
        conversion_rate = round(len(set(converted)) / conversations_n, 2) if conversations_n else 0
        return Response({
            'days': days,
            'sales': {**sales, 'conversion_rate': conversion_rate, 'conversations': conversations_n},
            'social': social_summary(tenant, since),
            'ai': ai_summary(tenant, since),
        })
