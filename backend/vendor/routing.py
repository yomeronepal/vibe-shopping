from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/vendor/ai-generate/$', consumers.HelperConsumer.as_asgi()),
]
