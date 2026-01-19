from django.contrib import admin
from .models import (
    Tenant, VendorProfile, Product, ProductImage,
    Wallet, WalletTransaction, Order, OrderItem,
    EscrowLedger, ProductEvent, SocialMediaPost, AITokenUsage
)

# Register your models here.

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'subdomain', 'subscription', 'is_active', 'created_at']
    list_filter = ['is_active', 'subscription', 'created_at']
    search_fields = ['name', 'subdomain']
    prepopulated_fields = {'subdomain': ('name',)}
    readonly_fields = ['created_at', 'updated_at']

@admin.register(VendorProfile)
class VendorProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'tenant', 'role', 'created_at']
    list_filter = ['role', 'created_at']
    search_fields = ['user__username', 'tenant__name']
    readonly_fields = ['created_at', 'updated_at']

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'price', 'stock', 'status', 'is_active', 'created_at']
    list_filter = ['is_active', 'status', 'created_at', 'tenant']
    search_fields = ['name', 'description', 'ai_generated_title']
    list_editable = ['price', 'stock', 'is_active', 'status']
    date_hierarchy = 'created_at'
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Basic Info', {
            'fields': ('tenant', 'name', 'description', 'price', 'stock', 'is_active', 'status')
        }),
        ('Images', {
            'fields': ('image', 'processed_image')
        }),
        ('AI Generated', {
            'fields': ('ai_generated_title', 'ai_generated_description', 'tags', 'vibe_tags', 'category', 'subcategory', 'metadata'),
            'classes': ('collapse',)
        }),
        ('Inventory', {
            'fields': ('stock_by_size',),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )

@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ['product', 'alt_text', 'created_at']
    list_filter = ['created_at']
    search_fields = ['product__name', 'alt_text']
    readonly_fields = ['created_at', 'updated_at']

@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'balance', 'created_at', 'updated_at']
    list_filter = ['created_at']
    search_fields = ['tenant__name']
    readonly_fields = ['created_at', 'updated_at']

@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ['wallet', 'amount', 'transaction_type', 'description', 'created_at']
    list_filter = ['transaction_type', 'created_at']
    search_fields = ['wallet__tenant__name', 'description']
    readonly_fields = ['created_at']
    date_hierarchy = 'created_at'

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'tenant', 'user', 'total_amount', 'status', 'payment_method', 'created_at']
    list_filter = ['status', 'payment_method', 'created_at']
    search_fields = ['tenant__name', 'user__username']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'

@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ['order', 'product', 'quantity', 'price']
    list_filter = ['order__status']
    search_fields = ['order__id', 'product__name']

@admin.register(EscrowLedger)
class EscrowLedgerAdmin(admin.ModelAdmin):
    list_display = ['id', 'order', 'amount', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['order__id', 'order__tenant__name']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'

@admin.register(ProductEvent)
class ProductEventAdmin(admin.ModelAdmin):
    list_display = ['product', 'event_type', 'country', 'created_at']
    list_filter = ['event_type', 'country', 'created_at']
    search_fields = ['product__name', 'country']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'

@admin.register(SocialMediaPost)
class SocialMediaPostAdmin(admin.ModelAdmin):
    list_display = ['product', 'tenant', 'platform', 'status', 'post_url', 'created_at']
    list_filter = ['platform', 'status', 'created_at']
    search_fields = ['product__name', 'tenant__name', 'caption', 'platform_post_id']
    readonly_fields = ['created_at', 'updated_at', 'metadata']
    date_hierarchy = 'created_at'
    fieldsets = (
        ('Basic Info', {
            'fields': ('product', 'tenant', 'platform', 'status')
        }),
        ('Post Details', {
            'fields': ('caption', 'post_url', 'platform_post_id')
        }),
        ('Analytics & Errors', {
            'fields': ('metadata', 'error_message'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )

@admin.register(AITokenUsage)
class AITokenUsageAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'ai_provider', 'operation_type', 'total_tokens', 'estimated_cost', 'success', 'created_at']
    list_filter = ['ai_provider', 'operation_type', 'success', 'created_at', 'tenant']
    search_fields = ['tenant__name', 'user__username', 'product__name', 'error_message']
    readonly_fields = ['created_at', 'updated_at', 'total_tokens', 'estimated_cost']
    date_hierarchy = 'created_at'
    fieldsets = (
        ('Usage Info', {
            'fields': ('tenant', 'user', 'product', 'ai_provider', 'operation_type')
        }),
        ('Token Metrics', {
            'fields': ('input_tokens', 'output_tokens', 'total_tokens', 'estimated_cost')
        }),
        ('Status', {
            'fields': ('success', 'error_message')
        }),
        ('Metadata', {
            'fields': ('metadata',),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('tenant', 'user', 'product')
