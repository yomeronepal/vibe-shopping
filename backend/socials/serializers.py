from rest_framework import serializers

from core.models import Product, SocialMediaPost
from socials.models import BoostCampaign, ConnectedPage


class ConnectedPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConnectedPage
        fields = [
            'id', 'page_id', 'name',
            'instagram_account_id', 'instagram_username',
            'connection_type', 'status', 'created_at',
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
            'scheduled_for', 'post_url', 'error_message', 'created_at', 'post_format',
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


class BoostCampaignSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='post.product.name', default='')
    post_url = serializers.CharField(source='post.post_url', default='')
    platform = serializers.CharField(source='post.platform', default='')

    class Meta:
        model = BoostCampaign
        fields = [
            'id', 'post_id', 'product_name', 'post_url', 'platform',
            'ad_account_id', 'daily_budget', 'days', 'targeting',
            'status', 'status_note', 'insights', 'ends_at', 'created_at',
        ]
