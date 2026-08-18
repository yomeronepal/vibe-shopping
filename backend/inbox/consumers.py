import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer


class InboxConsumer(AsyncWebsocketConsumer):
    """Streams inbox events to the authenticated tenant's dashboard."""

    async def connect(self):
        token_key = self.get_token_key()
        tenant_id = await self.get_tenant_id(token_key)
        if not tenant_id:
            await self.close()
            return
        self.group_name = f'inbox_{tenant_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        group_name = getattr(self, 'group_name', None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    def get_token_key(self):
        query = parse_qs(self.scope.get('query_string', b'').decode())
        values = query.get('token', [])
        return values[0] if values else ''

    @database_sync_to_async
    def get_tenant_id(self, token_key):
        from rest_framework.authtoken.models import Token
        if not token_key:
            return None
        token = Token.objects.select_related('user').filter(key=token_key).first()
        if not token:
            return None
        profile = getattr(token.user, 'vendor_profile', None)
        return profile.tenant_id if profile else None

    async def inbox_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'message',
            'conversation': event['conversation'],
            'message': event['message'],
        }))

    async def inbox_conversation_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'conversation_update',
            'conversation': event['conversation'],
        }))
