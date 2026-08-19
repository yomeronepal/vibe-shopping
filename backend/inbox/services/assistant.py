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


def format_product_line(product):
    """Render one catalog line the model may quote from."""
    stock = f'{product.stock} in stock' if product.stock > 0 else 'OUT OF STOCK'
    description = (product.description or '').replace('\n', ' ')[:120]
    return f'- {product.name} — Rs. {format_price(product.price)} — {stock} — {description}'


def build_catalog_block(tenant):
    """List the tenant's live products as the only allowed product facts."""
    products = Product.objects.filter(
        tenant=tenant, status='published', is_active=True,
    ).order_by('-created_at')[:MAX_PRODUCTS]
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


def build_history_block(conversation):
    """Render the recent thread, oldest first."""
    recent = list(conversation.messages.order_by('-sent_at')[:MAX_HISTORY])
    recent.reverse()
    lines = []
    for message in recent:
        speaker = 'Customer' if message.direction == 'in' else 'Business'
        text = message.text or '(attachment)'
        lines.append(f'{speaker}: {text}')
    return '\n'.join(lines) if lines else '(no messages yet)'


def build_suggestion_prompt(conversation):
    """Assemble the grounded prompt for one reply suggestion."""
    tenant = conversation.tenant
    knowledge = (tenant.metadata or {}).get('aiKnowledge', '')
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
1. Product names, prices, and availability must come ONLY from the catalog above. Never invent products, prices, discounts, or delivery times.
2. If the answer is not in the profile, knowledge, or catalog, say you will check and get back to them — do not guess.
3. Reply in the same language the customer used (English, Nepali, or romanized Nepali mix).
4. Sound like a friendly shop owner on Messenger: warm, natural, at most 2-3 short sentences. No hashtags or signatures.
5. If the customer wants to buy, confirm the item, quantity, and total price from the catalog, then ask for their delivery details.

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


def is_auto_suggest_enabled(tenant):
    """Return whether drafts should be generated automatically."""
    metadata = tenant.metadata or {}
    return bool(metadata.get('aiAutoSuggest', True))


def format_order_product_line(product):
    """Render one catalog line with the id the model must reference."""
    stock = f'{product.stock} in stock' if product.stock > 0 else 'OUT OF STOCK'
    return f'- [id {product.id}] {product.name} — Rs. {format_price(product.price)} — {stock}'


def build_order_catalog_block(tenant):
    """List purchasable products with their database ids."""
    products = Product.objects.filter(
        tenant=tenant, status='published', is_active=True,
    ).order_by('-created_at')[:MAX_PRODUCTS]
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
