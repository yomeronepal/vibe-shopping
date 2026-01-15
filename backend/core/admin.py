from django.contrib import admin
from .models import Product, Tenant, VendorProfile

# Register your models here.

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'subdomain', 'subscription', 'is_active', 'created_at']
    list_filter = ['is_active', 'subscription', 'created_at']
    search_fields = ['name', 'subdomain']
    prepopulated_fields = {'subdomain': ('name',)}

@admin.register(VendorProfile)
class VendorProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'tenant', 'role', 'created_at']
    list_filter = ['role', 'created_at']
    search_fields = ['user__username', 'tenant__name']

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'price', 'stock', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at', 'tenant']
    search_fields = ['name', 'description']
    list_editable = ['price', 'stock', 'is_active']
    date_hierarchy = 'created_at'
