import logging
from datetime import timedelta

from django.utils import timezone

from socials.models import BoostCampaign, ConnectedPage, MetaConnection
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

MIN_DAILY_BUDGET = 150
MAX_DAYS = 30
CONVERSATION_ACTION = 'onsite_conversion.messaging_conversation_started_7d'
AUTO_PAUSE_MIN_SPEND = 500


class BoostError(Exception):
    """Raised when a boost cannot be launched."""


def get_ads_token(tenant):
    """Return the vendor's Meta user token used for the Marketing API."""
    connection = MetaConnection.objects.filter(tenant=tenant, status='connected').first()
    if connection is None:
        raise BoostError('Connect your Facebook account first.')
    return connection.get_access_token()


def list_ad_accounts(tenant):
    """Active ad accounts the vendor can spend from."""
    token = get_ads_token(tenant)
    try:
        accounts = MetaGraphClient().list_ad_accounts(token)
    except MetaGraphError as exc:
        raise BoostError(f'Could not load ad accounts: {exc}')
    return [account for account in accounts if account.get('account_status') == 1]


def monthly_ad_cap(tenant):
    """Vendor's monthly boost ceiling in NPR (0 = no cap)."""
    try:
        return int((tenant.metadata or {}).get('adMonthlyCap') or 0)
    except (TypeError, ValueError):
        return 0


def month_spend_committed(tenant):
    """Total budget committed to boosts started this month."""
    start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    total = 0
    for boost in BoostCampaign.objects.filter(tenant=tenant, created_at__gte=start).exclude(status='failed'):
        total += boost.daily_budget * boost.days
    return total


def preflight_issues(tenant, post, daily_budget, days):
    """Guardrail checks; a non-empty list blocks the launch."""
    issues = []
    product = post.product
    if daily_budget < MIN_DAILY_BUDGET:
        issues.append(f'Daily budget must be at least Rs. {MIN_DAILY_BUDGET}.')
    if days < 1 or days > MAX_DAYS:
        issues.append(f'Duration must be between 1 and {MAX_DAYS} days.')
    if product and product.tracks_stock and product.stock < 3:
        issues.append(f'Only {product.stock} in stock — boosting now risks paid clicks with nothing to sell.')
    if product and daily_budget * days > float(product.price) * max(product.stock, 1) and product.tracks_stock:
        issues.append('Total budget exceeds the value of your remaining stock — lower the budget or restock.')
    if BoostCampaign.objects.filter(post=post, status='active').exists():
        issues.append('This post already has an active boost.')
    cap = monthly_ad_cap(tenant)
    if cap and month_spend_committed(tenant) + daily_budget * days > cap:
        issues.append(f'This would exceed your Rs. {cap:,} monthly boost cap.')
    return issues


def build_targeting(age_min, age_max, city=''):
    """Meta targeting spec: Nepal-wide or one city."""
    targeting = {
        'geo_locations': {'countries': ['NP']},
        'age_min': max(18, min(int(age_min or 18), 65)),
        'age_max': max(18, min(int(age_max or 44), 65)),
    }
    if city:
        targeting['city_hint'] = city[:60]
    return targeting


def launch_boost(tenant, post, ad_account_id, daily_budget, days, age_min=18, age_max=44):
    """Create the campaign, ad set, and ad; returns the BoostCampaign row.

    Raises BoostError with a readable reason on any guardrail or API
    failure. Everything created before a failure is left paused-safe
    because the ad is the last object created.
    """
    issues = preflight_issues(tenant, post, daily_budget, days)
    if issues:
        raise BoostError(' '.join(issues))
    page = ConnectedPage.objects.filter(
        tenant=tenant, status='connected', connection_type='facebook_page',
    ).first()
    if page is None:
        raise BoostError('Connect a Facebook Page first.')
    if not post.platform_post_id:
        raise BoostError('This post has no platform id to promote.')
    token = get_ads_token(tenant)
    client = MetaGraphClient()
    targeting = build_targeting(age_min, age_max)
    name = f'BizAlly boost — {post.product.name[:40] if post.product else post.id}'
    ends_at = timezone.now() + timedelta(days=days)
    try:
        campaign_id = client.create_boost_campaign(ad_account_id, token, name)
        adset_id = client.create_boost_adset(
            ad_account_id, token, campaign_id, page.page_id, name,
            daily_budget * 100, targeting, ends_at.isoformat(),
        )
        ad_id = client.create_boost_ad(ad_account_id, token, adset_id, name, post.platform_post_id)
    except MetaGraphError as exc:
        logger.warning('Boost launch failed for post %s: %s', post.id, exc)
        raise BoostError(f'Meta rejected the boost: {exc}')
    return BoostCampaign.objects.create(
        tenant=tenant, post=post, ad_account_id=ad_account_id,
        campaign_id=campaign_id, adset_id=adset_id, ad_id=ad_id,
        daily_budget=daily_budget, days=days, targeting=targeting,
        status='active', ends_at=ends_at,
    )


def parse_insights(raw):
    """Normalize a Meta insights row into our stored shape."""
    actions = {row.get('action_type'): int(float(row.get('value', 0) or 0)) for row in raw.get('actions', [])}
    spend = float(raw.get('spend', 0) or 0)
    conversations = actions.get(CONVERSATION_ACTION, 0)
    return {
        'spend': spend,
        'impressions': int(raw.get('impressions', 0) or 0),
        'reach': int(raw.get('reach', 0) or 0),
        'conversations_started': conversations,
        'cost_per_conversation': round(spend / conversations, 1) if conversations else None,
        'updated_at': timezone.now().isoformat(),
    }


def evaluate_boost(boost, insights):
    """Money guardrails: pause bleeders, close finished boosts."""
    if boost.ends_at and timezone.now() > boost.ends_at:
        boost.status = 'completed'
        boost.status_note = 'Boost period finished.'
        return 'completed'
    spend = insights.get('spend', 0)
    conversations = insights.get('conversations_started', 0)
    if spend >= max(AUTO_PAUSE_MIN_SPEND, boost.daily_budget) and conversations == 0:
        boost.status = 'paused'
        boost.status_note = (
            f'Auto-paused: Rs. {spend:,.0f} spent without a single new conversation. '
            'Try a different post or audience.'
        )
        return 'auto_paused'
    price = float(boost.post.product.price) if boost.post.product else 0
    cost = insights.get('cost_per_conversation')
    if price and cost and cost > price:
        boost.status = 'paused'
        boost.status_note = (
            f'Auto-paused: each conversation costs Rs. {cost:,.0f}, more than the '
            f'product price (Rs. {price:,.0f}).'
        )
        return 'auto_paused'
    return 'ok'


def refresh_boost(boost):
    """Pull fresh insights, evaluate guardrails, and persist."""
    token = get_ads_token(boost.tenant)
    client = MetaGraphClient()
    try:
        raw = client.get_campaign_insights(boost.campaign_id, token)
    except MetaGraphError as exc:
        logger.info('Insights fetch failed for boost %s: %s', boost.id, exc)
        return 'insights_unavailable'
    insights = parse_insights(raw)
    boost.insights = insights
    outcome = evaluate_boost(boost, insights)
    if outcome == 'auto_paused':
        try:
            client.set_campaign_status(boost.campaign_id, token, 'PAUSED')
        except MetaGraphError as exc:
            logger.warning('Auto-pause API call failed for boost %s: %s', boost.id, exc)
    boost.save(update_fields=['insights', 'status', 'status_note'])
    return outcome


def set_boost_status(boost, action):
    """Manually pause or resume a boost through the API."""
    token = get_ads_token(boost.tenant)
    status_value = 'PAUSED' if action == 'pause' else 'ACTIVE'
    try:
        MetaGraphClient().set_campaign_status(boost.campaign_id, token, status_value)
    except MetaGraphError as exc:
        raise BoostError(f'Meta rejected the change: {exc}')
    boost.status = 'paused' if action == 'pause' else 'active'
    boost.status_note = 'Paused by you.' if action == 'pause' else 'Resumed by you.'
    boost.save(update_fields=['status', 'status_note'])
    return boost
