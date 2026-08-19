from django.urls import path

from inbox.views import (
    ConversationDetailView,
    ConversationListView,
    ConversationReadView,
    MessageListView,
    SuggestReplyView,
    SummarizeConversationView,
    ExtractOrderView,
    CustomerDetailView,
)

urlpatterns = [
    path('conversations/', ConversationListView.as_view(), name='inbox_conversations'),
    path('conversations/<int:conversation_id>/', ConversationDetailView.as_view(), name='inbox_conversation_detail'),
    path('conversations/<int:conversation_id>/read/', ConversationReadView.as_view(), name='inbox_conversation_read'),
    path('conversations/<int:conversation_id>/messages/', MessageListView.as_view(), name='inbox_messages'),
    path('conversations/<int:conversation_id>/suggest/', SuggestReplyView.as_view(), name='inbox_suggest_reply'),
    path('conversations/<int:conversation_id>/extract-order/', ExtractOrderView.as_view(), name='inbox_extract_order'),
    path('conversations/<int:conversation_id>/summarize/', SummarizeConversationView.as_view(), name='inbox_summarize'),
    path('customers/<int:customer_id>/', CustomerDetailView.as_view(), name='inbox_customer_detail'),
]
