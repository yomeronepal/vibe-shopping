import logging

from socials.services.meta_graph import MetaGraphClient, MetaGraphError

logger = logging.getLogger(__name__)


def build_messenger_profile(tenant):
    """Assemble the greeting, get-started, icebreakers, and menu."""
    name = tenant.name[:40]
    return {
        'get_started': {'payload': 'GET_STARTED'},
        'greeting': [{
            'locale': 'default',
            'text': f'Namaste! {name} ma swagat chha 🙏 Products, prices, ra orders — jaile pani sodhnus!',
        }],
        'ice_breakers': [
            {'question': '🛍 K k products chha?', 'payload': 'SHOW_PRODUCTS'},
            {'question': '📦 Mero order ko status?', 'payload': 'ORDER_STATUS'},
            {'question': '👤 Team sanga kura garne', 'payload': 'TALK_HUMAN'},
        ],
        'persistent_menu': [{
            'locale': 'default',
            'composer_input_disabled': False,
            'call_to_actions': [
                {'type': 'postback', 'title': '🛍 Products herne', 'payload': 'SHOW_PRODUCTS'},
                {'type': 'postback', 'title': '📦 Mero order status', 'payload': 'ORDER_STATUS'},
                {'type': 'postback', 'title': '👤 Team sanga kura', 'payload': 'TALK_HUMAN'},
            ],
        }],
    }


def setup_messenger_profile(page):
    """Apply the storefront chat profile to the page; returns success."""
    try:
        MetaGraphClient().set_messenger_profile(
            page.page_id, page.get_access_token(), build_messenger_profile(page.tenant),
        )
        logger.info('Messenger profile configured for page %s', page.page_id)
        return True
    except MetaGraphError as exc:
        logger.warning('Messenger profile setup failed for page %s: %s', page.page_id, exc)
        return False
