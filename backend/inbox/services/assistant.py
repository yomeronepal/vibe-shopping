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


def call_gemini(prompt):
    """Send the prompt to Gemini and return the raw text response."""
    from google import genai

    api_key = settings.GOOGLE_AI_API_KEY
    if not api_key:
        raise AssistantError('AI is not configured. Add a Google AI API key.')
    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model=settings.GEMINI_ASSISTANT_MODEL,
            contents=prompt,
        )
    except Exception as exc:
        logger.warning('Assistant generation failed: %s', exc)
        raise AssistantError('The AI could not draft a reply right now. Try again.')
    text = (getattr(response, 'text', None) or '').strip()
    if not text:
        raise AssistantError('The AI returned an empty draft. Try again.')
    return text


def suggest_reply(conversation):
    """Return an AI-drafted reply for the conversation."""
    return call_gemini(build_suggestion_prompt(conversation))
