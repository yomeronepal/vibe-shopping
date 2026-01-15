from rest_framework import serializers
from .models import Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'price', 'stock', 'is_active',
            'ai_generated_title', 'ai_generated_description', 'tags',
            'category', 'subcategory', 'metadata', 'image',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
