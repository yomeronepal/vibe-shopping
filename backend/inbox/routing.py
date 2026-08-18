from django.urls import re_path

from inbox.consumers import InboxConsumer

websocket_urlpatterns = [
    re_path(r'ws/inbox/$', InboxConsumer.as_asgi()),
]
