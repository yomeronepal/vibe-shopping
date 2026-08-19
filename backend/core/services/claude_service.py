import logging

from django.conf import settings

logger = logging.getLogger(__name__)


class ClaudeError(Exception):
    """Raised when the Claude fallback cannot produce a response."""


def generate_text(prompt, max_tokens=3000):
    """Generate text with the configured Claude fallback model.

    Args:
        prompt: The full prompt to send.
        max_tokens: Cap on the response length.

    Returns:
        The response text.

    Raises:
        ClaudeError: when no key is configured, the API fails,
            or the response is empty.
    """
    import anthropic

    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if not api_key:
        raise ClaudeError('ANTHROPIC_API_KEY is not configured')
    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = client.messages.create(
            model=getattr(settings, 'CLAUDE_FALLBACK_MODEL', 'claude-haiku-4-5-20251001'),
            max_tokens=max_tokens,
            messages=[{'role': 'user', 'content': prompt}],
        )
    except Exception as exc:
        logger.warning('Claude fallback failed: %s', exc)
        raise ClaudeError(str(exc))
    parts = [getattr(block, 'text', '') for block in message.content]
    text = '\n'.join(part for part in parts if part).strip()
    if not text:
        raise ClaudeError('Claude returned an empty response')
    return text
