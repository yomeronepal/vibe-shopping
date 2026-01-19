from core.models import AITokenUsage
import logging

logger = logging.getLogger(__name__)

def track_ai_usage(
    tenant,
    ai_provider,
    operation_type,
    input_tokens=0,
    output_tokens=0,
    success=True,
    error_message='',
    user=None,
    product=None,
    metadata=None
):
    """
    Track AI token usage for cost monitoring and analytics.

    Args:
        tenant: Tenant instance
        ai_provider: 'gemini' or 'openai'
        operation_type: Type of operation (product_analysis, logo_analysis, etc.)
        input_tokens: Number of input tokens used
        output_tokens: Number of output tokens used
        success: Whether the operation succeeded
        error_message: Error message if failed
        user: User who triggered the operation (optional)
        product: Product being analyzed (optional)
        metadata: Additional metadata (optional)

    Returns:
        AITokenUsage instance
    """
    try:
        usage = AITokenUsage.objects.create(
            tenant=tenant,
            user=user,
            product=product,
            ai_provider=ai_provider,
            operation_type=operation_type,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            success=success,
            error_message=error_message,
            metadata=metadata or {}
        )

        logger.info(
            f"AI Usage Tracked: {ai_provider} - {operation_type} | "
            f"Tokens: {usage.total_tokens} | Cost: ${usage.estimated_cost:.6f} | "
            f"Tenant: {tenant.name}"
        )

        return usage

    except Exception as e:
        logger.error(f"Failed to track AI usage: {e}")
        return None


def estimate_image_tokens(image_data: bytes, base_tokens=258) -> int:
    """
    Estimate tokens for image input.
    Gemini charges based on image size:
    - Images up to 768x768: ~258 tokens
    - Each additional tile (512x512): ~258 tokens

    Args:
        image_data: Image bytes
        base_tokens: Base token count per tile

    Returns:
        Estimated token count
    """
    from PIL import Image
    import io

    try:
        img = Image.open(io.BytesIO(image_data))
        width, height = img.size

        pixels = width * height
        base_pixels = 768 * 768
        tile_pixels = 512 * 512

        if pixels <= base_pixels:
            return base_tokens

        extra_pixels = pixels - base_pixels
        extra_tiles = (extra_pixels + tile_pixels - 1) // tile_pixels

        return base_tokens + (extra_tiles * base_tokens)

    except Exception as e:
        logger.error(f"Failed to estimate image tokens: {e}")
        return base_tokens


def estimate_text_tokens(text: str) -> int:
    """
    Rough estimate of text tokens.
    ~1 token per 4 characters for English text.

    Args:
        text: Input text

    Returns:
        Estimated token count
    """
    return len(text) // 4
