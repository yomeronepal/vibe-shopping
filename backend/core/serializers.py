from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Product, Tenant, VendorProfile, ProductImage
from django.utils.text import slugify


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'alt_text']

class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'subdomain', 'metadata']
        read_only_fields = ['id', 'name', 'subdomain']

class ProductSerializer(serializers.ModelSerializer):
    tenant = serializers.StringRelatedField(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Product
        fields = [
            'id', 'tenant', 'name', 'description', 'price', 
            'stock', 'is_active', 'status', 'image', 'processed_image', 'images',
            'ai_generated_title', 'ai_generated_description', 
            'tags', 'vibe_tags', 'category', 'subcategory', 'metadata', 'stock_by_size',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['tenant', 'created_at', 'updated_at']

class ProductCreateSerializer(serializers.ModelSerializer):
    gallery_images = serializers.ListField(
        child=serializers.ImageField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'price', 
            'stock', 'image', 'gallery_images', 
            'status',
            # AI Fields
            'ai_generated_title', 'ai_generated_description',
            'tags', 'vibe_tags', 'category', 'subcategory', 'metadata', 'stock_by_size'
        ]
        read_only_fields = ['status'] 
    
    def create(self, validated_data):
        gallery_images = validated_data.pop('gallery_images', [])
        # Force draft initially as per requirements
        validated_data['status'] = 'draft'
        
        product = Product.objects.create(**validated_data)
        
        # Handle Gallery Images
        for img in gallery_images:
            ProductImage.objects.create(product=product, image=img)
            
        return product

class OrderItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)

class OrderCreateSerializer(serializers.Serializer):
    items = OrderItemSerializer(many=True)
    payment_method = serializers.CharField(max_length=50, required=False, default='credit_card')
    
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Order must contain at least one item.")
        return value

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

