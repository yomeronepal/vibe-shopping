from rest_framework import serializers

from inbox.models import Conversation, Customer, Message


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'platform', 'platform_user_id', 'name', 'profile_pic_url']


class ConversationSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    page_id = serializers.CharField(source='page.page_id', read_only=True)

    class Meta:
        model = Conversation
        fields = [
            'id', 'platform', 'status', 'unread_count', 'ai_paused',
            'last_message_at', 'last_message_preview', 'customer', 'page_id',
        ]


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'direction', 'text', 'attachments', 'platform_message_id', 'source', 'sent_by_ai', 'sent_at']
