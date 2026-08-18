from rest_framework import serializers

from core.models import Product, SocialMediaPost
from socials.models import ConnectedPage


class ConnectedPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConnectedPage
        fields = [
            'id', 'page_id', 'name',
            'instagram_account_id', 'instagram_username',
            'status', 'created_at',
        ]


class PostProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'name']


class SocialMediaPostSerializer(serializers.ModelSerializer):
    product = PostProductSerializer(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = SocialMediaPost
        fields = [
            'id', 'platform', 'status', 'caption', 'image_url', 'product',
            'scheduled_for', 'post_url', 'error_message', 'created_at',
        ]

    def get_image_url(self, obj):
        """Return the best available image URL, or None."""
        if obj.image:
            return obj.image.url
        if obj.product and obj.product.processed_image:
            return obj.product.processed_image.url
        if obj.product and obj.product.image:
            return obj.product.image.url
        return None
