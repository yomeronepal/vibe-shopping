import logging

from django.conf import settings

from core.models import Product

logger = logging.getLogger(__name__)

MAX_PRODUCTS = 30
MAX_HISTORY = 12


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
    """Render per-size stock like S:2, M:0."""
    sizes = stock_by_size or {}
    return ', '.join(f'{size}:{count}' for size, count in sizes.items())


def format_availability_details(product):
    """Render size and color availability for one product."""
    details = []
    sizes = format_size_counts(product.stock_by_size)
    if sizes:
        details.append(f'sizes [{sizes}]')
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


def format_product_line(product):
    """Render one catalog line the model may quote from."""
    stock = f'{product.stock} in stock' if product.stock > 0 else 'OUT OF STOCK'
    description = (product.description or '').replace('\n', ' ')[:120]
    line = f'- {product.name} — Rs. {format_price(product.price)} — {stock}'
    availability = format_availability_details(product)
    if availability:
        line += f' — {availability}'
    return f'{line} — {description}'


def build_catalog_block(tenant):
    """List the tenant's live products as the only allowed product facts."""
    products = Product.objects.filter(
        tenant=tenant, status='published', is_active=True,
    ).prefetch_related('variants').order_by('-created_at')[:MAX_PRODUCTS]
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


def get_order_fields(tenant):
    """Return the info fields the vendor wants collected before an order."""
    metadata = tenant.metadata or {}
    fields = metadata.get('orderFields')
    if isinstance(fields, list) and fields:
        return [str(field)[:60] for field in fields][:10]
    return list(DEFAULT_ORDER_FIELDS)


def build_suggestion_prompt(conversation):
    """Assemble the grounded prompt for one reply suggestion."""
    tenant = conversation.tenant
    knowledge = (tenant.metadata or {}).get('aiKnowledge', '')
    order_fields = ', '.join(get_order_fields(tenant))
    return f"""You are the customer-support assistant for a small business in Nepal that sells through Facebook and Instagram messages.

BUSINESS PROFILE
{build_business_block(tenant)}

BUSINESS KNOWLEDGE (policies and FAQs — the only extra facts you may state)
{knowledge or '(none provided)'}

PRODUCT CATALOG (the ONLY source of product names, prices, and availability)
{build_catalog_block(tenant)}

CONVERSATION SO FAR (Customer is the buyer; Business is you)
{build_history_block(conversation)}

TASK
Write the Business's next reply. Rules:
1. Product names, prices, and availability must come ONLY from the catalog above. Sizes and colors listed there (with per-size stock counts) are the only ones that exist; a count of 0 means out of stock. Never invent products, prices, discounts, or delivery times.
2. If the answer is not in the profile, knowledge, or catalog, say you will check and get back to them — do not guess.
3. Reply in the same language the customer used (English, Nepali, or romanized Nepali mix).
4. Sound like a friendly shop owner on Messenger: warm, natural, at most 2-3 short sentences. No hashtags or signatures.
5. If the customer wants to buy, confirm the item, quantity, and total price from the catalog, then collect what is still missing from this list: {order_fields}.
6. When something they want is unavailable, or they ask for suggestions, recommend 1-2 fitting products FROM THE CATALOG ONLY.

Return ONLY the reply text, nothing else."""


def call_claude_fallback(prompt):
    """Try the Claude fallback; raise AssistantError when it also fails."""
    from core.services.claude_service import ClaudeError, generate_text

    try:
        return generate_text(prompt)
    except ClaudeError as exc:
        logger.warning('Claude fallback also failed: %s', exc)
        raise AssistantError('The AI could not draft a reply right now. Try again.')


def call_gemini(prompt):
    """Generate text with Gemini, falling back to Claude on failure."""
    from google import genai

    api_key = settings.GOOGLE_AI_API_KEY
    if not api_key:
        return call_claude_fallback(prompt)
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=settings.GEMINI_ASSISTANT_MODEL,
            contents=prompt,
        )
        text = (getattr(response, 'text', None) or '').strip()
    except Exception as exc:
        logger.warning('Gemini generation failed, trying Claude: %s', exc)
        return call_claude_fallback(prompt)
    if not text:
        return call_claude_fallback(prompt)
    return text


def suggest_reply(conversation):
    """Return an AI-drafted reply for the conversation."""
    return call_gemini(build_suggestion_prompt(conversation))


def is_auto_reply_enabled(tenant):
    """Return whether the tenant lets the bot answer customers itself."""
    metadata = tenant.metadata or {}
    return is_assistant_enabled(tenant) and bool(metadata.get('aiAutoReply', False))


def format_order_product_line(product):
    """Render one catalog line with the id the model must reference."""
    stock = f'{product.stock} in stock' if product.stock > 0 else 'OUT OF STOCK'
    line = f'- [id {product.id}] {product.name} — Rs. {format_price(product.price)} — {stock}'
    availability = format_availability_details(product)
    if availability:
        line += f' — {availability}'
    return line


def build_order_catalog_block(tenant):
    """List purchasable products with their database ids."""
    products = Product.objects.filter(
        tenant=tenant, status='published', is_active=True,
    ).prefetch_related('variants').order_by('-created_at')[:MAX_PRODUCTS]
    lines = [format_order_product_line(product) for product in products]
    return '\n'.join(lines) if lines else '(no products published yet)'


def build_order_prompt(conversation):
    """Assemble the JSON-extraction prompt for order capture."""
    tenant = conversation.tenant
    return f"""You extract purchase orders from a shop's customer chat.

PRODUCT CATALOG (only these products can be ordered; use the exact id)
{build_order_catalog_block(tenant)}

CONVERSATION (Customer is the buyer; Business is the shop)
{build_history_block(conversation)}

TASK
Decide whether the customer has clearly asked to buy something. Respond with ONLY a JSON object, no markdown, in this exact shape:
{{"order_detected": true or false, "items": [{{"product_id": <catalog id>, "quantity": <positive integer>}}], "customer_name": "<name if the customer stated one, else empty string>", "note": "<one short sentence explaining your decision>"}}

Rules:
1. order_detected is true only when the customer explicitly wants to buy, not when they are just asking questions.
2. Only use product ids from the catalog. If the requested product is not in the catalog, leave it out.
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


def coerce_extracted_item(item, products):
    """Validate one extracted line against the catalog; None if invalid."""
    if not isinstance(item, dict):
        return None
    product = products.get(item.get('product_id'))
    if product is None:
        return None
    try:
        quantity = max(1, int(item.get('quantity', 1)))
    except (TypeError, ValueError):
        quantity = 1
    return {
        'product_id': product.id,
        'name': product.name,
        'price': format_price(product.price),
        'quantity': quantity,
        'stock': product.stock,
    }


def validate_order_extraction(tenant, data, conversation):
    """Ground the model's extraction in the real catalog."""
    products = {
        product.id: product
        for product in Product.objects.filter(tenant=tenant, status='published', is_active=True)
    }
    raw_items = data.get('items') if isinstance(data.get('items'), list) else []
    items = [entry for entry in (coerce_extracted_item(item, products) for item in raw_items) if entry]
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
    raw = call_gemini(build_order_prompt(conversation))
    data = parse_model_json(raw)
    if not isinstance(data, dict):
        raise AssistantError('The AI returned an unreadable answer. Try again.')
    return validate_order_extraction(conversation.tenant, data, conversation)


def build_order_flow_prompt(conversation):
    """Assemble the combined reply + order-state prompt for the bot."""
    tenant = conversation.tenant
    knowledge = (tenant.metadata or {}).get('aiKnowledge', '')
    fields = get_order_fields(tenant)
    fields_json = ', '.join(f'"{field}": "<value or empty string>"' for field in fields)
    return f"""You run the chat for a small Nepali business selling on Facebook and Instagram. You both answer the customer and collect order information.

BUSINESS PROFILE
{build_business_block(tenant)}

BUSINESS KNOWLEDGE (policies and FAQs — the only extra facts you may state)
{knowledge or '(none provided)'}

PRODUCT CATALOG (only these can be ordered; use the exact id; the ONLY source of prices and stock)
{build_order_catalog_block(tenant)}

INFORMATION TO COLLECT BEFORE PLACING AN ORDER
{', '.join(fields)}

CONVERSATION SO FAR (Customer is the buyer; Business is you)
{build_history_block(conversation)}

TASK
Respond with ONLY a JSON object, no markdown, in this exact shape:
{{"reply": "<your next message to the customer>", "ordering": true or false, "order_ready": true or false, "items": [{{"product_id": <catalog id>, "quantity": <positive integer>}}], "collected": {{{fields_json}}}, "missing": ["<fields still not provided>"], "sentiment": "positive" or "neutral" or "negative", "needs_human": true or false}}

Rules:
1. reply follows the shop's voice: warm, 1-3 short sentences, same language as the customer, simple everyday words, plain text, no markdown.
2. Product facts only from the catalog; policy facts only from the knowledge; otherwise say you will check. Sizes and colors listed in a catalog line (with their per-size stock counts) are the ONLY sizes and colors that exist for that product; a size with count 0 is out of stock.
3. ordering is true when the customer clearly wants to buy something from the catalog.
3b. Never mention any product that is not in the catalog, and always use the exact catalog names.
3c. If the customer's latest message is unclear, only an emoji or short reaction, or an attachment you cannot see, reply with ONE short friendly question asking what they would like — do not guess or apologize repeatedly.
4. Fill collected only with values the customer actually stated anywhere in the conversation; never invent them.
5. When ordering and fields are missing, the reply must naturally ask for the missing fields (all of them at once) and order_ready is false.
6. order_ready is true ONLY when ordering is true, items are known, and every field in the list has been collected. Then the reply confirms the items, total price from the catalog, and tells the customer their order is being placed.
7. When the customer is not ordering, just answer their question; items and collected may be empty.
8. When something they want is unavailable, or they ask for suggestions, recommend 1-2 fitting products FROM THE CATALOG ONLY.
9. sentiment reflects the customer's mood in their recent messages.
10. needs_human is true when the customer is upset or angry, explicitly asks for a person, complains about an already-placed order, or asks for a refund/return — then the reply must warmly say a team member will follow up shortly, and nothing else."""


def advance_order_conversation(conversation):
    """Return the bot's reply plus validated order state for the thread."""
    raw = call_gemini(build_order_flow_prompt(conversation))
    data = parse_model_json(raw)
    if not isinstance(data, dict) or not str(data.get('reply', '')).strip():
        raise AssistantError('The AI returned an unreadable answer. Try again.')
    grounded = validate_order_extraction(conversation.tenant, data, conversation)
    collected = data.get('collected') if isinstance(data.get('collected'), dict) else {}
    cleaned = {str(k)[:60]: str(v)[:200] for k, v in collected.items() if str(v).strip()}
    fields = get_order_fields(conversation.tenant)
    missing = [field for field in fields if not cleaned.get(field)]
    sentiment = str(data.get('sentiment', '')).lower()
    if sentiment not in ('positive', 'neutral', 'negative'):
        sentiment = 'neutral'
    return {
        'reply': str(data['reply']).strip()[:1500],
        'ordering': bool(data.get('ordering')),
        'order_ready': bool(data.get('order_ready')) and bool(grounded['items']) and not missing,
        'items': grounded['items'],
        'collected': cleaned,
        'missing': missing,
        'sentiment': sentiment,
        'needs_human': bool(data.get('needs_human')),
    }


def build_summary_prompt(conversation):
    """Assemble the prompt for a short conversation summary."""
    return f"""Summarize this customer conversation for a busy shop owner.

CONVERSATION (Customer is the buyer; Business is the shop)
{build_history_block(conversation)}

Write 3-5 short bullet lines covering: who the customer is and what they want, any products/prices/sizes discussed, order or delivery status if any, the customer's mood, and the single next step for the owner. Plain text bullets starting with '-'. No markdown of any kind — no asterisks, no bold markers, no headers."""


def summarize_conversation(conversation):
    """Return a short AI summary of the conversation."""
    return call_gemini(build_summary_prompt(conversation))
