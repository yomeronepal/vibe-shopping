from rest_framework import serializers

from socials.models import ConnectedPage


class ConnectedPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConnectedPage
        fields = [
            'id', 'page_id', 'name',
            'instagram_account_id', 'instagram_username',
            'status', 'created_at',
        ]
