from django.contrib import admin

from inbox.models import Conversation, Customer, Message


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['name', 'platform', 'platform_user_id', 'tenant']


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ['customer', 'platform', 'status', 'unread_count', 'last_message_at', 'tenant']
    list_filter = ['status', 'platform']


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['conversation', 'direction', 'sent_at', 'platform_message_id']
