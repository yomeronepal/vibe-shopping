import logging
from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Product
from core.serializers import ProductSerializer
from socials.models import ConnectedPage
from socials.serializers import SocialMediaPostSerializer
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

ENGAGEMENT_TTL_SECONDS = 600
EMPTY_ENGAGEMENT = {'likes': 0, 'comments': 0, 'shares': 0}


def get_request_tenant(request):
    """Return the tenant for the authenticated user or None."""
    profile = getattr(request.user, 'vendor_profile', None)
    return profile.tenant if profile else None


def cached_engagement(post):
    """Return fresh cached engagement for a post or None."""
    cached = (post.metadata or {}).get('engagement')
    if not cached:
        return None
    fetched_at = parse_datetime(cached.get('fetched_at', ''))
    if not fetched_at:
        return None
    if timezone.now() - fetched_at > timedelta(seconds=ENGAGEMENT_TTL_SECONDS):
        return None
    return {key: cached.get(key, 0) for key in EMPTY_ENGAGEMENT}


def fetch_engagement(client, page, post):
    """Fetch live engagement for one posted record, best effort."""
    try:
        if post.platform == 'instagram':
            return client.get_instagram_media_engagement(
                post.platform_post_id, page.get_access_token()
            )
        return client.get_post_engagement(post.platform_post_id, page.get_access_token())
    except MetaGraphError as exc:
        logger.info('Engagement fetch failed for post %s: %s', post.id, exc)
        return None


def resolve_engagement(client, page, post, force_refresh=False):
    """Return engagement for a post using the cache, then Graph."""
    if post.status != 'posted' or not post.platform_post_id or not page:
        return dict(EMPTY_ENGAGEMENT)
    if not force_refresh:
        cached = cached_engagement(post)
        if cached is not None:
            return cached
    fetched = fetch_engagement(client, page, post)
    if fetched is None:
        return dict(EMPTY_ENGAGEMENT)
    metadata = post.metadata or {}
    metadata['engagement'] = {**fetched, 'fetched_at': timezone.now().isoformat()}
    post.metadata = metadata
    post.save(update_fields=['metadata'])
    return fetched


class ProductAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, product_id):
        """Return a product's details with per-post social engagement."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        product = Product.objects.filter(tenant=tenant, id=product_id).first()
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        page = ConnectedPage.objects.filter(tenant=tenant, status='connected').first()
        client = MetaGraphClient()
        force_refresh = request.query_params.get('refresh') == '1'
        posts = product.social_posts.order_by('-created_at')
        totals = {'likes': 0, 'comments': 0, 'shares': 0, 'published_posts': 0}
        post_payloads = []
        for post in posts:
            engagement = resolve_engagement(client, page, post, force_refresh)
            if post.status == 'posted':
                totals['published_posts'] += 1
                for key in ('likes', 'comments', 'shares'):
                    totals[key] += engagement.get(key, 0)
            payload = SocialMediaPostSerializer(post).data
            payload['engagement'] = engagement
            post_payloads.append(payload)
        return Response({
            'product': ProductSerializer(product).data,
            'totals': totals,
            'posts': post_payloads,
        })
