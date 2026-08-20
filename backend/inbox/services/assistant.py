import logging
import re

from django.conf import settings
from django.db.models import Q

from core.models import Product

logger = logging.getLogger(__name__)

MAX_PRODUCTS = 30
MAX_HISTORY = 12
MAX_CANDIDATES = 200
MAX_SEARCH_TERMS = 20
MAX_RECOMMENDED = 3

SEARCH_STOPWORDS = {
    'the', 'and', 'for', 'with', 'this', 'that', 'you', 'your', 'have', 'want',
    'how', 'much', 'price', 'rate', 'kati', 'chha', 'cha', 'hola', 'huncha',
    'malai', 'lai', 'ko', 'ma', 'garna', 'garnu', 'chahiyo', 'chahiyeko',
    'namaste', 'hello', 'sir', 'madam', 'please', 'order', 'available', 'photo',
}


class AssistantError(Exception):
    """Raised when a reply suggestion cannot be produced."""


def is_assistant_enabled(tenant):
    """Return whether the tenant has the AI assistant switched on."""
    metadata = tenant.metadata or {}
    return bool(metadata.get('aiAssistantEnabled', True))


def format_price(value):
    """Render a price without meaningless trailing zeros."""
    text = str(value)
    return text.rstrip('0').rstrip('.') if '.' in text else text


def format_size_counts(stock_by_size):
    """Render per-option stock like S:2, M:0; a lone qty is just the count."""
    sizes = stock_by_size or {}
    if list(sizes.keys()) == ['qty']:
        return str(sizes['qty'])
    return ', '.join(f'{size}:{count}' for size, count in sizes.items())


def get_option_label(product):
    """Return the vendor's name for the product's option axis."""
    name = str((product.metadata or {}).get('optionName') or '').strip()
    return name or 'sizes'


def format_availability_details(product):
    """Render option and color availability for one product."""
    details = []
    sizes = format_size_counts(product.stock_by_size)
    if sizes:
        details.append(f'{get_option_label(product)} [{sizes}]')
    variant_bits = []
    for variant in product.variants.all():
        if not variant.color_name:
            continue
        variant_sizes = format_size_counts(variant.stock_by_size)
        variant_bits.append(
            f'{variant.color_name} [{variant_sizes}]' if variant_sizes else variant.color_name
        )
    if variant_bits:
        details.append(f"colors: {', '.join(variant_bits)}")
    return '; '.join(details)


def extract_search_terms(conversation):
    """Collect distinctive words from the customer's recent messages."""
    words = []
    recent = conversation.messages.filter(direction='in').order_by('-sent_at')[:8]
    for message in recent:
        meta = message.metadata or {}
        replied = (meta.get('reply_to_product') or {}).get('name', '')
        source = f"{message.text or ''} {meta.get('product_name', '')} {replied}"
        words.extend(re.findall(r'[a-z0-9][a-z0-9\-]{2,}', source.lower()))
    terms = []
    for word in words:
        if word not in SEARCH_STOPWORDS and word not in terms:
            terms.append(word)
    return terms[:MAX_SEARCH_TERMS]


def score_product(product, terms):
    """Rate how well a product matches the conversation's search terms."""
    name = product.name.lower()
    sku = (product.product_code or '').lower()
    category = f'{product.category} {product.subcategory}'.lower()
    description = (product.description or '').lower()[:400]
    score = 0
    for term in terms:
        if sku and term == sku:
            score += 10
        if term in name:
            score += 4
        elif term in category:
            score += 2
        elif term in description:
            score += 1
    return score


def find_candidate_products(base_queryset, terms):
    """Fetch a bounded candidate set, strong matches before weak ones.

    Name, category, and SKU hits fill the candidate pool first so a
    product named for the query can never be crowded out by hundreds
    of description-only matches once the catalog grows large.
    """
    if not terms:
        return []
    strong = Q()
    weak = Q()
    for term in terms:
        strong |= (
            Q(name__icontains=term)
            | Q(category__icontains=term)
            | Q(subcategory__icontains=term)
            | Q(product_code__iexact=term)
        )
        weak |= Q(description__icontains=term)
    candidates = list(base_queryset.filter(strong).prefetch_related('variants')[:MAX_CANDIDATES])
    if len(candidates) < MAX_CANDIDATES:
        chosen_ids = {product.id for product in candidates}
        filler = base_queryset.filter(weak).exclude(id__in=chosen_ids).prefetch_related(
            'variants'
        )[:MAX_CANDIDATES - len(candidates)]
        candidates.extend(filler)
    return candidates


def select_relevant_products(tenant, conversation=None):
    """Pick the products worth showing the model for this conversation.

    Small catalogs are passed whole; large ones are narrowed to the
    best keyword and SKU matches so the prompt stays bounded no matter
    how many products the vendor has.
    """
    base = Product.objects.filter(tenant=tenant, status='published', is_active=True)
    newest = base.prefetch_related('variants').order_by('-created_at')
    if conversation is None or base.count() <= MAX_PRODUCTS:
        return list(newest[:MAX_PRODUCTS])
    terms = extract_search_terms(conversation)
    candidates = find_candidate_products(base, terms)
    scored = sorted(
        ((score_product(product, terms), product) for product in candidates),
        key=lambda pair: pair[0], reverse=True,
    )
    picked = [product for score, product in scored if score > 0][:MAX_PRODUCTS]
    if len(picked) < MAX_PRODUCTS:
        chosen_ids = {product.id for product in picked}
        fill = newest.exclude(id__in=chosen_ids)[:MAX_PRODUCTS - len(picked)]
        picked.extend(fill)
    return picked


def format_sku_tag(product):
    """Render the SKU marker for a catalog line, or empty."""
    return f' | SKU {product.product_code}' if product.product_code else ''


def format_stock_label(product):
    """Render availability: services and made-to-order are always orderable."""
    if product.is_service:
        return 'SERVICE — always bookable'
    if product.is_made_to_order:
        return 'MADE TO ORDER — always orderable'
    return f'{product.stock} in stock' if product.stock > 0 else 'OUT OF STOCK'


def format_product_line(product):
    """Render one catalog line the model may quote from."""
    description = (product.description or '').replace('\n', ' ')[:120]
    line = f'- {product.name}{format_sku_tag(product)} — Rs. {format_price(product.price)} — {format_stock_label(product)}'
    availability = '' if product.is_service else format_availability_details(product)
    if availability:
        line += f' — {availability}'
    return f'{line} — {description}'


def build_catalog_block(tenant, conversation=None):
    """List the relevant live products as the only allowed product facts."""
    products = select_relevant_products(tenant, conversation)
    lines = [format_product_line(product) for product in products]
    return '\n'.join(lines) if lines else '(no products published yet)'


def build_business_block(tenant):
    """Describe the business from its store profile."""
    metadata = tenant.metadata or {}
    contact = metadata.get('contact', {})
    parts = [f'Store name: {tenant.name}']
    if metadata.get('bio'):
        parts.append(f"About: {metadata['bio']}")
    if metadata.get('niches'):
        parts.append(f"Category: {', '.join(metadata['niches'])}")
    for label, key in (('Phone', 'phone'), ('Email', 'email'), ('Address', 'address')):
        if contact.get(key):
            parts.append(f'{label}: {contact[key]}')
    return '\n'.join(parts)


def describe_attachments(message):
    """Describe a text-less message by its attachment types."""
    types = sorted({(item or {}).get('type', 'file') for item in (message.attachments or [])})
    if not types:
        return '(sent something the assistant cannot see)'
    return f"(sent a {', '.join(types)} attachment the assistant cannot see)"


def format_history_line(message):
    """Render one thread line, marking comments and their post context."""
    text = message.text or describe_attachments(message)
    if message.direction != 'in':
        return f'Business: {text}'
    replied = (message.metadata or {}).get('reply_to_product') or {}
    if replied.get('name'):
        return (
            f"Customer (replying to your photo of {replied['name']}"
            f" [id {replied.get('id')}] — \"this/yo\" means that product): {text}"
        )
    if message.source == 'comment':
        product = (message.metadata or {}).get('product_name', '')
        context = f' about {product}' if product else ''
        return f'Customer (commented on your post{context}; you are replying privately): {text}'
    return f'Customer: {text}'


def build_history_block(conversation):
    """Render the recent thread, oldest first."""
    recent = list(conversation.messages.order_by('-sent_at')[:MAX_HISTORY])
    recent.reverse()
    lines = [format_history_line(message) for message in recent]
    return '\n'.join(lines) if lines else '(no messages yet)'


DEFAULT_ORDER_FIELDS = ['Full name', 'Phone number', 'Delivery address']
DEFAULT_BOOKING_FIELDS = ['Full name', 'Phone number', 'Preferred date & time']


def read_field_list(tenant, key, default):
    """Return a configured field list from tenant metadata, or the default."""
    fields = (tenant.metadata or {}).get(key)
    if isinstance(fields, list) and fields:
        return [str(field)[:60] for field in fields][:10]
    return list(default)


def get_order_fields(tenant):
    """Return the info fields collected before a product order."""
    return read_field_list(tenant, 'orderFields', DEFAULT_ORDER_FIELDS)


def get_booking_fields(tenant):
    """Return the info fields collected before a service booking."""
    return read_field_list(tenant, 'serviceFields', DEFAULT_BOOKING_FIELDS)


def get_offering(tenant):
    """Return what the business sells: products, services, or both."""
    offering = (tenant.metadata or {}).get('offering', 'products')
    return offering if offering in ('products', 'services', 'both') else 'products'


def merge_field_lists(first, second):
    """Combine two field lists, keeping order and dropping duplicates."""
    merged = list(first)
    for field in second:
        if field not in merged:
            merged.append(field)
    return merged


def resolve_required_fields(tenant, items):
    """Pick the field set the chosen items call for.

    Services alone need booking fields, physical items need order
    fields, and mixed carts need both. With no items yet, the
    business offering decides the default set.
    """
    types = {item.get('item_type', 'physical') for item in items}
    if items:
        if types == {'service'}:
            return get_booking_fields(tenant)
        if 'service' in types:
            return merge_field_lists(get_order_fields(tenant), get_booking_fields(tenant))
        return get_order_fields(tenant)
    if get_offering(tenant) == 'services':
        return get_booking_fields(tenant)
    return get_order_fields(tenant)


def build_suggestion_prompt(conversation):
    """Assemble the grounded prompt for one reply suggestion."""
    from inbox.services.knowledge import build_knowledge_block

    tenant = conversation.tenant
    knowledge = build_knowledge_block(tenant)
    order_fields = ', '.join(get_order_fields(tenant))
    return f"""You are the customer-support assistant for a small business in Nepal that sells through Facebook and Instagram messages.

BUSINESS PROFILE
{build_business_block(tenant)}

BUSINESS KNOWLEDGE (policies and FAQs — the only extra facts you may state)
{knowledge or '(none provided)'}

PRODUCT CATALOG (the ONLY source of product names, prices, and availability)
{build_catalog_block(tenant, conversation)}

CONVERSATION SO FAR (Customer is the buyer; Business is you)
{build_history_block(conversation)}

TASK
Write the Business's next reply. Rules:
1. Product names, prices, and availability must come ONLY from the catalog above. Sizes and colors listed there (with per-size stock counts) are the only ones that exist; a count of 0 means out of stock. Never invent products, prices, discounts, or delivery times.
2. If the answer is not in the profile, knowledge, or catalog, say you will check and get back to them — do not guess.
3. {get_language_rule(tenant)}
4. Sound {get_tone_hint(tenant)} on Messenger: at most 2-3 short sentences. No hashtags or signatures.
5. If the customer wants to buy, confirm the item, quantity, and total price from the catalog, then collect what is still missing from this list: {order_fields}.
6. When something they want is unavailable, or they ask for suggestions, recommend 1-2 fitting products FROM THE CATALOG ONLY.

Return ONLY the reply text, nothing else.{get_restricted_rule(tenant)}{get_discount_rule(tenant)}"""


def call_claude_fallback(prompt):
    """Try the Claude fallback; raise AssistantError when it also fails."""
    from core.services.claude_service import ClaudeError, generate_text

    try:
        return generate_text(prompt)
    except ClaudeError as exc:
        logger.warning('Claude fallback also failed: %s', exc)
        raise AssistantError('The AI could not draft a reply right now. Try again.')


def log_ai_usage(tenant, provider, operation, prompt, output, success, error=''):
    """Record the AI call for cost logs and error monitoring; never raises."""
    if tenant is None:
        return
    try:
        from core.utils.ai_tracker import estimate_text_tokens, track_ai_usage

        track_ai_usage(
            tenant=tenant,
            ai_provider=provider,
            operation_type=operation,
            input_tokens=estimate_text_tokens(prompt),
            output_tokens=estimate_text_tokens(output) if output else 0,
            success=success,
            error_message=error[:255],
        )
    except Exception:
        logger.warning('AI usage tracking failed', exc_info=True)


def call_gemini(prompt, tenant=None, operation='assistant'):
    """Generate text with Gemini, falling back to Claude on failure.

    Every call is recorded per provider (including failures) when a
    tenant is given, powering AI response logs and error monitoring.
    """
    from google import genai

    text = ''
    provider = 'gemini'
    api_key = settings.GOOGLE_AI_API_KEY
    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=settings.GEMINI_ASSISTANT_MODEL,
                contents=prompt,
            )
            text = (getattr(response, 'text', None) or '').strip()
        except Exception as exc:
            logger.warning('Gemini generation failed, trying Claude: %s', exc)
    if not text:
        provider = 'claude'
        try:
            text = call_claude_fallback(prompt)
        except AssistantError as exc:
            log_ai_usage(tenant, 'none', operation, prompt, '', False, str(exc))
            raise
    log_ai_usage(tenant, provider, operation, prompt, text, True)
    return text


def suggest_reply(conversation):
    """Return an AI-drafted reply for the conversation."""
    return call_gemini(build_suggestion_prompt(conversation), conversation.tenant, 'reply_suggestion')


ASSISTANT_TONES = {
    'professional': 'polished and professional, while staying approachable',
    'casual': 'casual and playful, like chatting with a friend',
}

ASSISTANT_LANGUAGES = {
    'english': 'Always reply in clear English.',
    'nepali': 'Always reply in Nepali written in Latin script (romanized Nepali).',
    'mixed': 'Always reply in the natural English + romanized Nepali mix used by Nepali online shops.',
}


def get_discount_rule(tenant):
    """Return the discount policy rule for the assistant prompts."""
    try:
        limit = int((tenant.metadata or {}).get('aiMaxDiscount') or 0)
    except (TypeError, ValueError):
        limit = 0
    if limit <= 0:
        return '\nDISCOUNTS: Never offer or agree to any discount. Prices are fixed.'
    return (
        f'\nDISCOUNTS: You may offer at most {limit}% off, and only when the customer asks. '
        'Never exceed that, and never stack discounts.'
    )


def get_restricted_rule(tenant):
    """Return the restricted-topics rule, or empty when none are set."""
    topics = (tenant.metadata or {}).get('restrictedTopics') or []
    if not topics:
        return ''
    joined = ', '.join(str(topic) for topic in topics[:10])
    return (
        f'\nRESTRICTED: Never discuss these topics: {joined}. '
        'If the customer brings one up, politely decline and steer back to the shop.'
    )


def get_tone_hint(tenant):
    """Return the reply-tone description from the assistant settings."""
    tone = (tenant.metadata or {}).get('aiTone', '')
    return ASSISTANT_TONES.get(tone, 'warm and natural, like a friendly shop owner')


def get_language_rule(tenant):
    """Return the reply-language rule from the assistant settings."""
    language = (tenant.metadata or {}).get('aiLanguage', '')
    return ASSISTANT_LANGUAGES.get(
        language,
        'Reply in the same language the customer used (English, Nepali, or romanized Nepali mix).',
    )


def is_auto_reply_enabled(tenant):
    """Return whether the tenant lets the bot answer customers itself."""
    metadata = tenant.metadata or {}
    return is_assistant_enabled(tenant) and bool(metadata.get('aiAutoReply', False))


def format_order_product_line(product):
    """Render one catalog line with the id the model must reference."""
    line = (
        f'- [id {product.id}{format_sku_tag(product)}] {product.name}'
        f' — Rs. {format_price(product.price)} — {format_stock_label(product)}'
    )
    availability = '' if product.is_service else format_availability_details(product)
    if availability:
        line += f' — {availability}'
    return line


def build_order_catalog_block(tenant, conversation=None):
    """List purchasable relevant products with their database ids."""
    products = select_relevant_products(tenant, conversation)
    lines = [format_order_product_line(product) for product in products]
    return '\n'.join(lines) if lines else '(no products published yet)'


def build_order_prompt(conversation):
    """Assemble the JSON-extraction prompt for order capture."""
    tenant = conversation.tenant
    return f"""You extract purchase orders from a shop's customer chat.

PRODUCT CATALOG (only these products can be ordered; use the exact id)
{build_order_catalog_block(tenant, conversation)}

CONVERSATION (Customer is the buyer; Business is the shop)
{build_history_block(conversation)}

TASK
Decide whether the customer has clearly asked to buy something. Respond with ONLY a JSON object, no markdown, in this exact shape:
{{"order_detected": true or false, "items": [{{"product_id": <catalog id>, "sku": "<catalog SKU if shown, else empty>", "quantity": <positive integer>, "size": "<size if stated, else empty>", "color": "<color if stated, else empty>"}}], "customer_name": "<name if the customer stated one, else empty string>", "note": "<one short sentence explaining your decision>"}}

Rules:
1. order_detected is true only when the customer explicitly wants to buy, not when they are just asking questions.
2. Only use product ids and SKUs from the catalog. When the customer quotes a SKU code, match it exactly. If the requested product is not in the catalog, leave it out.
3. Default quantity to 1 when the customer wants an item but gave no number."""


def parse_model_json(text):
    """Parse the model's JSON reply, tolerating code fences."""
    import json

    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = cleaned.strip('`')
        if cleaned.startswith('json'):
            cleaned = cleaned[4:]
    try:
        return json.loads(cleaned.strip())
    except ValueError:
        raise AssistantError('The AI returned an unreadable answer. Try again.')


def parse_item_id(item):
    """Return the item's product id as an int, or None."""
    try:
        return int(item.get('product_id'))
    except (TypeError, ValueError):
        return None


def parse_item_sku(item):
    """Return the item's normalized SKU, or empty string."""
    return str(item.get('sku') or '').strip().lower()[:40]


def load_referenced_products(tenant, raw_items):
    """Fetch only the catalog products the extraction refers to."""
    ids = {parse_item_id(item) for item in raw_items if isinstance(item, dict)}
    skus = {parse_item_sku(item) for item in raw_items if isinstance(item, dict)}
    ids.discard(None)
    skus.discard('')
    if not ids and not skus:
        return {}, {}
    query = Q(id__in=ids)
    for sku in skus:
        query |= Q(product_code__iexact=sku)
    products = Product.objects.filter(
        tenant=tenant, status='published', is_active=True,
    ).filter(query)
    by_id = {product.id: product for product in products}
    by_sku = {product.product_code.lower(): product for product in products if product.product_code}
    return by_id, by_sku


def coerce_extracted_item(item, by_id, by_sku):
    """Validate one extracted line against the catalog; None if invalid."""
    if not isinstance(item, dict):
        return None
    product = by_id.get(parse_item_id(item)) or by_sku.get(parse_item_sku(item))
    if product is None:
        return None
    try:
        quantity = max(1, int(item.get('quantity', 1)))
    except (TypeError, ValueError):
        quantity = 1
    return {
        'product_id': product.id,
        'name': product.name,
        'sku': product.product_code or '',
        'item_type': product.item_type,
        'price': format_price(product.price),
        'quantity': quantity,
        'stock': product.stock,
        'size': str(item.get('size') or '').strip()[:20],
        'color': str(item.get('color') or '').strip()[:50],
    }


def validate_order_extraction(tenant, data, conversation):
    """Ground the model's extraction in the real catalog."""
    raw_items = data.get('items') if isinstance(data.get('items'), list) else []
    by_id, by_sku = load_referenced_products(tenant, raw_items)
    items = [entry for entry in (coerce_extracted_item(item, by_id, by_sku) for item in raw_items) if entry]
    customer_name = str(data.get('customer_name') or '').strip()[:100]
    if not customer_name and conversation.customer.name:
        customer_name = conversation.customer.name
    return {
        'order_detected': bool(data.get('order_detected')) and bool(items),
        'items': items,
        'customer_name': customer_name,
        'note': str(data.get('note') or '').strip()[:300],
    }


def extract_order(conversation):
    """Return a catalog-validated order extraction for the conversation."""
    raw = call_gemini(build_order_prompt(conversation), conversation.tenant, 'order_extraction')
    data = parse_model_json(raw)
    if not isinstance(data, dict):
        raise AssistantError('The AI returned an unreadable answer. Try again.')
    return validate_order_extraction(conversation.tenant, data, conversation)


UPDATABLE_ORDER_STATUSES = ('pending_payment', 'pending_delivery')
RECENT_ORDER_DAYS = 7


def format_collected_summary(metadata):
    """Render the delivery details already on file for an order."""
    collected = (metadata or {}).get('collected') or {}
    return ', '.join(f'{key}: {value}' for key, value in list(collected.items())[:6])


def format_order_item(item):
    """Render one order line item with its chosen size and color."""
    text = f'{item.quantity}× {item.product.name[:40]}'
    if item.size:
        text += f' (size {item.size})'
    if item.color:
        text += f' ({item.color})'
    return text


def format_recent_order_line(order):
    """Render one existing order the customer may ask to change."""
    items = ', '.join(format_order_item(item) for item in order.items.all())
    changeable = (
        'can still be changed' if order.status in UPDATABLE_ORDER_STATUSES
        else 'changes need a human now'
    )
    line = (
        f'- [order {order.id}] {items} — Total Rs. {format_price(order.total_amount)}'
        f' — status: {order.status} ({changeable})'
    )
    details = format_collected_summary(order.metadata)
    if details:
        line += f' — info on file: {details}'
    return line


def build_known_customer_block(conversation):
    """Describe the contact details already stored for this customer."""
    customer = conversation.customer
    parts = []
    for label, value in (
        ('Name', customer.name),
        ('Phone', customer.phone),
        ('Email', customer.email),
        ('Address', customer.location),
    ):
        if value:
            parts.append(f'{label}: {value}')
    return '\n'.join(parts)


def build_recent_orders_block(conversation):
    """List this chat's recent bot-placed orders, or empty."""
    from datetime import timedelta

    from django.utils import timezone

    from core.models import Order

    cutoff = timezone.now() - timedelta(days=RECENT_ORDER_DAYS)
    orders = (
        Order.objects.filter(
            tenant=conversation.tenant,
            created_at__gte=cutoff,
            metadata__source='chat_bot',
            metadata__conversation_id=conversation.id,
        )
        .exclude(status='cancelled')
        .prefetch_related('items__product')
        .order_by('-created_at')[:3]
    )
    return '\n'.join(format_recent_order_line(order) for order in orders)


OFFERING_LINES = {
    'products': 'This business sells products.',
    'services': 'This business offers services and bookings — customers book, nothing is shipped.',
    'both': 'This business sells products AND offers bookable services.',
}


def build_fields_section(tenant):
    """Describe which fields to collect for orders and bookings."""
    offering = get_offering(tenant)
    parts = []
    if offering in ('products', 'both'):
        parts.append(
            'INFORMATION TO COLLECT BEFORE PLACING A PRODUCT ORDER\n'
            + ', '.join(get_order_fields(tenant))
        )
    if offering in ('services', 'both'):
        parts.append(
            'INFORMATION TO COLLECT BEFORE BOOKING A SERVICE\n'
            + ', '.join(get_booking_fields(tenant))
        )
    return '\n\n'.join(parts)


def build_order_flow_prompt(conversation):
    """Assemble the combined reply + order-state prompt for the bot."""
    from inbox.services.knowledge import build_knowledge_block

    tenant = conversation.tenant
    knowledge = build_knowledge_block(tenant)
    fields = merge_field_lists(get_order_fields(tenant), get_booking_fields(tenant))
    if get_offering(tenant) == 'products':
        fields = get_order_fields(tenant)
    elif get_offering(tenant) == 'services':
        fields = get_booking_fields(tenant)
    fields_json = ', '.join(f'"{field}": "<value or empty string>"' for field in fields)
    return f"""You run the chat for a small Nepali business selling on Facebook and Instagram. You both answer the customer and collect order information.

BUSINESS PROFILE
{build_business_block(tenant)}
{OFFERING_LINES[get_offering(tenant)]}

BUSINESS KNOWLEDGE (policies and FAQs — the only extra facts you may state)
{knowledge or '(none provided)'}

CATALOG (only these can be ordered or booked; use the exact id; the ONLY source of prices and stock)
{build_order_catalog_block(tenant, conversation)}

{build_fields_section(tenant)}

KNOWN CUSTOMER DETAILS (saved from earlier orders — you may fill collected with these, but confirm them before placing a new order)
{build_known_customer_block(conversation) or '(new customer — nothing on file)'}

THIS CUSTOMER'S RECENT ORDERS IN THIS CHAT
{build_recent_orders_block(conversation) or '(none)'}

CONVERSATION SO FAR (Customer is the buyer; Business is you)
{build_history_block(conversation)}

TASK
Respond with ONLY a JSON object, no markdown, in this exact shape:
{{"reply": "<your next message to the customer>", "ordering": true or false, "order_ready": true or false, "items": [{{"product_id": <catalog id>, "sku": "<catalog SKU if shown, else empty>", "quantity": <positive integer>, "size": "<size if stated, else empty>", "color": "<color if stated, else empty>"}}], "recommended_product_ids": [<catalog ids of products your reply recommends or shows, up to 3>], "update_order_id": <the id from the recent orders list when the customer asks to change that existing order, else null>, "quick_replies": ["<up to 4 short answers the customer can tap, each under 20 characters>"], "collected": {{{fields_json}}}, "missing": ["<fields still not provided>"], "sentiment": "positive" or "neutral" or "negative", "needs_human": true or false}}

Rules:
1. reply is 1-3 short sentences, {get_tone_hint(tenant)}, simple everyday words, plain text, no markdown. {get_language_rule(tenant)}
2. Product facts only from the catalog; policy facts only from the knowledge; otherwise say you will check. The option values and colors listed in a catalog line (with their per-value stock counts) are the ONLY ones that exist for that product; a value with count 0 is out of stock. The option axis may be sizes, weights, storage, flavors, or anything else — use the vendor's own label (e.g. "Weight [250g:4]" means you offer it in 250g) and put the customer's chosen value in that item's "size" field.
2b. Catalog lines marked SERVICE are bookable services (photography, repairs, consultations, and similar), not physical goods: they have no stock, sizes, or colors, and can always be booked. For services use booking language ("booking", "appointment") — never "delivery" — and collect the SERVICE fields, not the product order fields. Capture any preferences the customer states (date, time, location, requirements) inside collected, and mention that the business will confirm the schedule.
2c. Catalog lines marked MADE TO ORDER are physical products prepared after ordering (cakes, custom prints, tailoring): they have no stock count and can always be ordered. Mention preparation or delivery time only when the description states one.
3. ordering is true when the customer clearly wants to buy something from the catalog.
3b. Never mention any product that is not in the catalog, and always use the exact catalog names.
3c. If the customer's latest message is unclear, only an emoji or short reaction, or an attachment you cannot see, reply with ONE short friendly question asking what they would like — do not guess or apologize repeatedly.
4. Fill collected only with values the customer actually stated anywhere in the conversation; never invent them. When a field does not apply to the items being ordered (for example Size for a product that has no size options, or delivery details for an in-store service), set that field to "N/A" — never leave a field empty just because it is irrelevant.
5. When ordering and fields are missing, briefly ask the customer in ONE short sentence to fill in their details, and order_ready is false. Do NOT list the individual fields or their values in your reply — a copyable form (blank missing fields, or the details already on file for confirmation) is automatically attached below your message.
5b. Details the customer typed in THIS conversation count as confirmed. Details taken from KNOWN CUSTOMER DETAILS are NOT yet confirmed: fill them into collected, keep order_ready false, and ask in ONE short sentence whether those saved details are still correct (the prefilled form is attached automatically). Never make the customer retype known details.
5c. order_ready becomes true only after the customer has confirmed the saved details (for example by saying "confirm", "huncha", "thik chha") or provided the details themselves in this conversation.
6. order_ready is true ONLY when ordering is true, items are known, and every field in the list has been collected. Then the reply confirms the items, total price from the catalog, and tells the customer their order is being placed.
6b. When the customer asks to change a recent order that can still be changed (different size, color, quantity, item, or delivery details), set update_order_id to that order's id, ordering true, and items to the COMPLETE list the order should contain AFTER the change — not just the changed line. Reuse the info on file for collected; only ask for what is genuinely new. order_ready is true once the full updated order is clear, and the reply confirms exactly what changes and the new total.
6c. When they ask to change an order whose changes need a human, or to cancel any order, set needs_human true instead.
7. When the customer is not ordering, just answer their question; items and collected may be empty.
8. When something they want is unavailable, or they ask for suggestions, recommend 1-2 fitting products FROM THE CATALOG ONLY, and put their catalog ids in recommended_product_ids so their photos can be sent. Also fill recommended_product_ids when the customer asks to see a product or its photo. Leave it empty otherwise.
8b. When the customer quotes a SKU code, match it exactly against the catalog.
8c. When your reply asks the customer to choose between a few options (sizes, colors, option values, yes/no), fill quick_replies with the exact choices as short tappable answers — only in-stock catalog values, max 4, each under 20 characters. Leave quick_replies empty when the reply needs a typed answer (like an address).
9. sentiment reflects the customer's mood in their recent messages.
10. needs_human is true when the customer is upset or angry, explicitly asks for a person, complains about an already-placed order (except a simple change you can handle via update_order_id), or asks for a refund/return — then the reply must warmly say a team member will follow up shortly, and nothing else.{get_restricted_rule(tenant)}{get_discount_rule(tenant)}"""


def load_recommended_products(tenant, data):
    """Return the catalog products the model chose to showcase."""
    raw = data.get('recommended_product_ids')
    if not isinstance(raw, list):
        return []
    ids = []
    for value in raw[:6]:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            continue
    if not ids:
        return []
    products = Product.objects.filter(
        tenant=tenant, status='published', is_active=True, id__in=ids,
    )
    by_id = {product.id: product for product in products}
    return [by_id[pid] for pid in ids if pid in by_id][:MAX_RECOMMENDED]


def advance_order_conversation(conversation):
    """Return the bot's reply plus validated order state for the thread."""
    raw = call_gemini(build_order_flow_prompt(conversation), conversation.tenant, 'bot_reply')
    data = parse_model_json(raw)
    if not isinstance(data, dict) or not str(data.get('reply', '')).strip():
        raise AssistantError('The AI returned an unreadable answer. Try again.')
    grounded = validate_order_extraction(conversation.tenant, data, conversation)
    collected = data.get('collected') if isinstance(data.get('collected'), dict) else {}
    cleaned = {str(k)[:60]: str(v)[:200] for k, v in collected.items() if str(v).strip()}
    sentiment = str(data.get('sentiment', '')).lower()
    if sentiment not in ('positive', 'neutral', 'negative'):
        sentiment = 'neutral'
    try:
        update_order_id = int(data.get('update_order_id')) if data.get('update_order_id') else None
    except (TypeError, ValueError):
        update_order_id = None
    raw_quick = data.get('quick_replies') if isinstance(data.get('quick_replies'), list) else []
    quick_replies = [str(entry).strip()[:20] for entry in raw_quick if str(entry).strip()][:4]
    required_fields = resolve_required_fields(conversation.tenant, grounded['items'])
    missing = [field for field in required_fields if not cleaned.get(field)]
    return {
        'reply': str(data['reply']).strip()[:1500],
        'ordering': bool(data.get('ordering')),
        'order_ready': bool(data.get('order_ready')) and bool(grounded['items']) and not missing,
        'items': grounded['items'],
        'collected': cleaned,
        'missing': missing,
        'sentiment': sentiment,
        'needs_human': bool(data.get('needs_human')),
        'recommended_products': load_recommended_products(conversation.tenant, data),
        'update_order_id': update_order_id,
        'quick_replies': quick_replies,
        'required_fields': required_fields,
    }


def build_summary_prompt(conversation):
    """Assemble the prompt for a short conversation summary."""
    return f"""Summarize this customer conversation for a busy shop owner.

CONVERSATION (Customer is the buyer; Business is the shop)
{build_history_block(conversation)}

Write 3-5 short bullet lines covering: who the customer is and what they want, any products/prices/sizes discussed, order or delivery status if any, the customer's mood, and the single next step for the owner. Plain text bullets starting with '-'. No markdown of any kind — no asterisks, no bold markers, no headers."""


def summarize_conversation(conversation):
    """Return a short AI summary of the conversation."""
    return call_gemini(build_summary_prompt(conversation), conversation.tenant, 'summary')
