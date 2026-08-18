from django.contrib import admin

from socials.models import ConnectedPage, MetaConnection, WebhookEvent


@admin.register(MetaConnection)
class MetaConnectionAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'fb_user_id', 'status', 'token_expires_at']
    exclude = ['access_token_encrypted']


@admin.register(ConnectedPage)
class ConnectedPageAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'page_id', 'instagram_username', 'status']
    exclude = ['access_token_encrypted']


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ['object_type', 'signature_valid', 'processed', 'received_at']
    readonly_fields = ['payload']
