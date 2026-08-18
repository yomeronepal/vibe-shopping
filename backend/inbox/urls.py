from django.urls import path

from inbox.views import (
    ConversationDetailView,
    ConversationListView,
    ConversationReadView,
    MessageListView,
)

urlpatterns = [
    path('conversations/', ConversationListView.as_view(), name='inbox_conversations'),
    path('conversations/<int:conversation_id>/', ConversationDetailView.as_view(), name='inbox_conversation_detail'),
    path('conversations/<int:conversation_id>/read/', ConversationReadView.as_view(), name='inbox_conversation_read'),
    path('conversations/<int:conversation_id>/messages/', MessageListView.as_view(), name='inbox_messages'),
]
