from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def push_inbox_event(tenant_id, event_type, payload):
    """Send an inbox event to the tenant's Channels group."""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'inbox_{tenant_id}', {'type': event_type, **payload}
    )
