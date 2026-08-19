from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Product, Tenant, VendorProfile, ProductImage, ProductVariant
from django.utils.text import slugify


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'processed_image', 'alt_text', 'display_order', 'variant']

class ProductVariantSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    total_stock = serializers.ReadOnlyField()

    class Meta:
        model = ProductVariant
        fields = ['id', 'color_name', 'color_hex', 'stock_by_size', 'is_default', 'images', 'total_stock', 'created_at']
        read_only_fields = ['id', 'total_stock', 'created_at']

class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'subdomain', 'metadata']
        read_only_fields = ['id', 'name', 'subdomain']

class ProductSerializer(serializers.ModelSerializer):
    tenant = serializers.StringRelatedField(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'tenant', 'name', 'description', 'price',
            'stock', 'is_active', 'status', 'image', 'processed_image', 'images', 'variants',
            'product_code', 'qr_code',
            'ai_generated_title', 'ai_generated_description',
            'tags', 'vibe_tags', 'weather_tags', 'category', 'subcategory', 'metadata', 'stock_by_size',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['tenant', 'product_code', 'qr_code', 'created_at', 'updated_at']

class ProductCreateSerializer(serializers.ModelSerializer):
    gallery_images = serializers.ListField(
        child=serializers.ImageField(),
        write_only=True,
        required=False
    )
    status = serializers.ChoiceField(choices=['draft', 'published'], default='published')
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'price',
            'stock', 'image', 'gallery_images',
            'status',
            'ai_generated_title', 'ai_generated_description',
            'tags', 'vibe_tags', 'weather_tags', 'category', 'subcategory', 'metadata', 'stock_by_size'
        ]

    def create(self, validated_data):
        """Create the product, syncing visibility to its status."""
        gallery_images = validated_data.pop('gallery_images', [])
        validated_data['is_active'] = validated_data.get('status', 'published') == 'published'
        product = Product.objects.create(**validated_data)
        for img in gallery_images:
            ProductImage.objects.create(product=product, image=img)
        return product

class OrderItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)

class OrderCreateSerializer(serializers.Serializer):
    items = OrderItemSerializer(many=True)
    order_type = serializers.ChoiceField(choices=['online', 'pos'], default='online')
    payment_method = serializers.CharField(max_length=50, required=False, default='credit_card')
    
    # POS customer info (optional for online orders)
    customer_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    customer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    customer_email = serializers.EmailField(required=False, allow_blank=True)
    
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Order must contain at least one item.")
        return value
    
    def validate(self, data):
        # For POS orders, require at least one customer contact method
        if data.get('order_type') == 'pos':
            if not any([data.get('customer_name'), data.get('customer_phone'), data.get('customer_email')]):
                raise serializers.ValidationError(
                    "For POS orders, please provide at least customer name, phone, or email."
                )
        return data

class VendorSignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    store_name = serializers.CharField(max_length=255)

    def validate_store_name(self, value):
        from django.utils.text import slugify
        if Tenant.objects.filter(name=value).exists():
            raise serializers.ValidationError("Store name already exists.")

        subdomain = slugify(value)
        if not subdomain:
            raise serializers.ValidationError("Store name must contain valid characters.")
        if Tenant.objects.filter(subdomain=subdomain).exists():
            raise serializers.ValidationError("Store name generates a subdomain that already exists. Please choose a different name.")

        return value

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists.")
        return value

class BusinessProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'subdomain', 'metadata', 'is_active', 'created_at']
        read_only_fields = ['id', 'subdomain', 'is_active', 'created_at']
