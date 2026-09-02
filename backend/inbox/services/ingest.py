import logging
from datetime import datetime, timezone as dt_timezone

from django.db.models import F
from django.utils import timezone

from inbox.models import Conversation, Customer, Message
from inbox.serializers import ConversationSerializer, MessageSerializer
from inbox.services.push import push_inbox_event
from socials.models import ConnectedPage
from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)

PROFILE_FIELDS = 'name,profile_pic'


def fetch_customer_profile(page, user_id):
    """Best-effort Graph profile lookup; blank fields on failure."""
    from socials.services.meta_graph import graph_client_for

    client = graph_client_for(page)
    try:
        detail = client.get(f'/{user_id}', {
            'access_token': page.get_access_token(),
            'fields': PROFILE_FIELDS,
        })
        return {
            'name': detail.get('name') or detail.get('username', ''),
            'profile_pic_url': detail.get('profile_pic', ''),
        }
    except MetaGraphError as exc:
        logger.info('Customer profile fetch failed for %s: %s', user_id, exc)
        return {'name': '', 'profile_pic_url': ''}


def resolve_page(object_type, entry_id):
    """Map a webhook entry id to a connected page, or None."""
    if not entry_id:
        return None
    if object_type == 'instagram':
        return ConnectedPage.objects.filter(
            instagram_account_id=entry_id, status='connected'
        ).first()
    return ConnectedPage.objects.filter(page_id=entry_id, status='connected').first()


def normalize_attachments(message):
    """Flatten Meta attachment payloads to [{type, url}]."""
    normalized = []
    for attachment in message.get('attachments', []) or []:
        url = (attachment.get('payload') or {}).get('url', '')
        normalized.append({'type': attachment.get('type', 'file'), 'url': url})
    return normalized


def build_preview(text, attachments):
    """Return the conversation list preview for a message."""
    if text:
        return text[:120]
    if attachments:
        return '[attachment]'
    return ''


def resolve_sent_at(messaging_event):
    """Return the message timestamp, falling back to now when missing."""
    raw_timestamp = messaging_event.get('timestamp')
    if not raw_timestamp:
        return timezone.now()
    return datetime.fromtimestamp(raw_timestamp / 1000, tz=dt_timezone.utc)


POSTBACK_TEXTS = {
    'GET_STARTED': 'Namaste!',
    'SHOW_PRODUCTS': 'Tapai sanga k k products chha?',
    'ORDER_STATUS': 'Mero order ko status k chha?',
    'TALK_HUMAN': 'Malai team member sanga kura garnu cha.',
}


def postback_as_message(messaging_event):
    """Turn a tapped button into the equivalent typed message, or None."""
    postback = messaging_event.get('postback') or {}
    payload = postback.get('payload', '')
    text = POSTBACK_TEXTS.get(payload)
    if not text:
        return None
    sender = (messaging_event.get('sender') or {}).get('id', '')
    stamp = messaging_event.get('timestamp', '')
    mid = postback.get('mid') or f'pb-{payload}-{sender}-{stamp}'
    return {'mid': mid, 'text': text}


SHARE_ATTACHMENT_TYPES = ('post', 'share', 'fallback')


def shared_post_info(post):
    """Context payload for a matched shared post."""
    product = post.product
    if product is None:
        return {}
    return {'shared_post_product': {
        'id': product.id,
        'name': product.name[:60],
        'sku': product.product_code or '',
    }}


def resolve_shared_post(page, attachments, mid=''):
    """Map a shared page post back to the product it advertises."""
    import re

    from core.models import SocialMediaPost

    shared = [a for a in attachments if a.get('type') in SHARE_ATTACHMENT_TYPES]
    if not shared:
        return {}
    posts = SocialMediaPost.objects.filter(
        tenant=page.tenant, product__isnull=False,
    ).exclude(platform_post_id='').select_related('product')
    for attachment in shared:
        for digits in re.findall(r'\d{10,}', attachment.get('url', '') or ''):
            post = posts.filter(platform_post_id__contains=digits).first()
            if post:
                return shared_post_info(post)
    if mid:
        post = resolve_share_via_graph(page, posts, mid)
        if post:
            return shared_post_info(post)
    return {}


def resolve_share_via_graph(page, posts, mid):
    """Ask Graph what the message shared; match it to our posts."""
    import re

    from socials.services.meta_graph import graph_client_for

    try:
        detail = graph_client_for(page).get(f'/{mid}', {
            'access_token': page.get_access_token(),
            'fields': 'shares{id,link}',
        })
    except MetaGraphError as exc:
        logger.info('Shared post lookup failed for %s: %s', mid, exc)
        return None
    for row in (detail.get('shares') or {}).get('data', []):
        for candidate in (row.get('id', ''), row.get('link', '') or ''):
            for digits in re.findall(r'\d{10,}', candidate):
                post = posts.filter(platform_post_id__contains=digits).first()
                if post:
                    return post
    return None


def resolve_photo_reply(conversation, message):
    """Map a reply-to mid back to the product photo it answers."""
    reply_mid = ((message.get('reply_to') or {}).get('mid')) or ''
    if not reply_mid:
        return {}
    source = (
        Message.objects.filter(
            conversation=conversation,
            direction='out',
            metadata__photo_mids__has_key=reply_mid,
        )
        .order_by('-sent_at')
        .first()
    )
    if source is None:
        return {}
    return {'reply_to_product': source.metadata['photo_mids'][reply_mid]}


def build_inbound_context(page, conversation, message, attachments, direction):
    """Attach product context from photo replies or shared posts."""
    if direction != 'in':
        return {}
    context = resolve_photo_reply(conversation, message)
    if not context and attachments:
        context = resolve_shared_post(page, attachments, mid=message.get('mid', ''))
    return context


def store_message(page, platform, messaging_event):
    """Persist one messaging or postback event; returns the Message or None."""
    message = messaging_event.get('message') or postback_as_message(messaging_event) or {}
    mid = message.get('mid')
    if not mid:
        return None
    page_identity = page.instagram_account_id if platform == 'instagram' else page.page_id
    is_echo = bool(message.get('is_echo'))
    sender_id = (messaging_event.get('sender') or {}).get('id', '')
    recipient_id = (messaging_event.get('recipient') or {}).get('id', '')
    direction = 'out' if is_echo or sender_id == page_identity else 'in'
    customer_id = recipient_id if direction == 'out' else sender_id
    if not customer_id:
        return None
    customer, created = Customer.objects.get_or_create(
        tenant=page.tenant, platform=platform, platform_user_id=customer_id
    )
    if created:
        profile = fetch_customer_profile(page, customer_id)
        customer.name = profile['name']
        customer.profile_pic_url = profile['profile_pic_url']
        customer.save()
    conversation, _ = Conversation.objects.get_or_create(
        page=page, customer=customer,
        defaults={'tenant': page.tenant, 'platform': platform},
    )
    attachments = normalize_attachments(message)
    sent_at = resolve_sent_at(messaging_event)
    record, created = Message.objects.get_or_create(
        platform_message_id=mid,
        defaults={
            'conversation': conversation,
            'direction': direction,
            'text': message.get('text', '') or '',
            'attachments': attachments,
            'sent_at': sent_at,
            'metadata': build_inbound_context(page, conversation, message, attachments, direction),
        },
    )
    if not created:
        return None
    preview = build_preview(record.text, attachments)
    if direction == 'in':
        Conversation.objects.filter(pk=conversation.pk).update(
            unread_count=F('unread_count') + 1,
            status='waiting_business',
            last_message_at=sent_at,
            last_message_preview=preview,
        )
    else:
        Conversation.objects.filter(pk=conversation.pk).update(
            status='waiting_customer',
            last_message_at=sent_at,
            last_message_preview=preview,
        )
    conversation.refresh_from_db()
    try:
        push_inbox_event(page.tenant_id, 'inbox.message', {
            'conversation': ConversationSerializer(conversation).data,
            'message': MessageSerializer(record).data,
        })
    except Exception:
        logger.warning('Inbox push failed for message %s', record.id, exc_info=True)
    if direction == 'in':
        queue_auto_reply(record, page.tenant)
    return record


def queue_auto_reply(record, tenant):
    """Queue the bot's reply when the tenant has auto-reply switched on."""
    from inbox.services.assistant import is_auto_reply_enabled
    from inbox.services.sending import show_read_and_typing
    from inbox.tasks import auto_reply_to_message

    if record.conversation.ai_paused or not is_auto_reply_enabled(tenant):
        return
    if record.source != 'comment':
        show_read_and_typing(record.conversation)
    try:
        from inbox.tasks import AUTO_REPLY_DEBOUNCE_SECONDS
        auto_reply_to_message.apply_async(args=[record.id], countdown=AUTO_REPLY_DEBOUNCE_SECONDS)
    except Exception:
        logger.warning('Could not queue auto-reply for message %s', record.id, exc_info=True)


def ingest_webhook_event(event):
    """Parse a stored webhook event into inbox rows; returns messages created."""
    payload = event.payload or {}
    if not isinstance(payload, dict):
        logger.warning('Invalid payload type: %s', type(payload).__name__)
        return 0
    object_type = payload.get('object', '')
    if object_type not in ('page', 'instagram'):
        return 0
    platform = 'instagram' if object_type == 'instagram' else 'facebook'
    created_count = 0
    for entry in payload.get('entry', []) or []:
        if not isinstance(entry, dict):
            logger.warning('Invalid entry type: %s', type(entry).__name__)
            continue
        page = resolve_page(object_type, str(entry.get('id', '')))
        if not page:
            continue
        for messaging_event in entry.get('messaging', []) or []:
            if not isinstance(messaging_event, dict):
                logger.warning('Invalid messaging_event type: %s', type(messaging_event).__name__)
                continue
            try:
                record = store_message(page, platform, messaging_event)
            except (KeyError, TypeError, ValueError, AttributeError):
                logger.exception('Failed to ingest messaging event %s', event.id)
                continue
            if record:
                created_count += 1
        for change in entry.get('changes', []) or []:
            if not isinstance(change, dict):
                logger.warning('Invalid change type: %s', type(change).__name__)
                continue
            try:
                record = store_comment(page, platform, change)
            except (KeyError, TypeError, ValueError, AttributeError):
                logger.exception('Failed to ingest change event %s', event.id)
                continue
            if record:
                created_count += 1
    return created_count


def extract_comment(platform, change):
    """Normalize a webhook change into comment fields, or None."""
    field = change.get('field', '')
    value = change.get('value') or {}
    if platform == 'facebook':
        if field != 'feed' or value.get('item') != 'comment' or value.get('verb') != 'add':
            return None
        return {
            'comment_id': value.get('comment_id', ''),
            'text': value.get('message', '') or '',
            'from': value.get('from') or {},
            'post_id': value.get('post_id', ''),
        }
    if field != 'comments':
        return None
    return {
        'comment_id': value.get('id', ''),
        'text': value.get('text', '') or '',
        'from': value.get('from') or {},
        'post_id': (value.get('media') or {}).get('id', ''),
    }


def resolve_commented_product(page, post_id):
    """Map the commented post back to a catalog product, if published here."""
    if not post_id:
        return None
    from core.models import SocialMediaPost

    post = (
        SocialMediaPost.objects.filter(tenant=page.tenant, platform_post_id=post_id)
        .select_related('product')
        .first()
    )
    return post.product if post and post.product else None


def store_comment(page, platform, change):
    """Persist one comment as an inbox message; returns it or None."""
    comment = extract_comment(platform, change)
    if not comment or not comment['comment_id']:
        return None
    author_id = str(comment['from'].get('id', ''))
    own_identity = page.instagram_account_id if platform == 'instagram' else page.page_id
    if not author_id or author_id == own_identity:
        return None
    author_name = comment['from'].get('name') or comment['from'].get('username') or ''
    customer, created = Customer.objects.get_or_create(
        tenant=page.tenant, platform=platform, platform_user_id=author_id,
        defaults={'name': author_name},
    )
    if not created and author_name and not customer.name:
        customer.name = author_name
        customer.save(update_fields=['name'])
    conversation, _ = Conversation.objects.get_or_create(
        page=page, customer=customer,
        defaults={'tenant': page.tenant, 'platform': platform},
    )
    product = resolve_commented_product(page, comment['post_id'])
    text = comment['text'] or '(comment without text)'
    record, created = Message.objects.get_or_create(
        platform_message_id=comment['comment_id'],
        defaults={
            'conversation': conversation,
            'direction': 'in',
            'source': 'comment',
            'text': text,
            'sent_at': timezone.now(),
            'metadata': {
                'post_id': comment['post_id'],
                'product_id': product.id if product else None,
                'product_name': product.name if product else '',
            },
        },
    )
    if not created:
        return None
    Conversation.objects.filter(pk=conversation.pk).update(
        unread_count=F('unread_count') + 1,
        status='waiting_business',
        last_message_at=record.sent_at,
        last_message_preview=f'Commented: {text}'[:120],
    )
    conversation.refresh_from_db()
    try:
        push_inbox_event(page.tenant_id, 'inbox.message', {
            'conversation': ConversationSerializer(conversation).data,
            'message': MessageSerializer(record).data,
        })
    except Exception:
        logger.warning('Inbox push failed for comment %s', record.id, exc_info=True)
    queue_auto_reply(record, page.tenant)
    return record
