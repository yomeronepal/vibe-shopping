from rest_framework import serializers


class OnboardingProfileSerializer(serializers.Serializer):
    """
    Serializer for Step 1: Profile data.
    """
    shop_name = serializers.CharField(max_length=255, required=False)
    bio = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    category = serializers.CharField(max_length=100, required=False)
    brand_vibes = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        default=list
    )
    ai_persona = serializers.IntegerField(min_value=0, max_value=100, required=False, default=65)
    logo = serializers.ImageField(required=False)


class KYCSubmissionSerializer(serializers.Serializer):
    """
    Serializer for Step 2: KYC documents.
    """
    pan_vat_number = serializers.CharField(max_length=50, required=True)
    business_reg_no = serializers.CharField(max_length=50, required=False, allow_blank=True)
    kyc_document = serializers.FileField(required=False)


class OnboardingStatusSerializer(serializers.Serializer):
    """
    Serializer for returning onboarding progress.
    """
    current_step = serializers.IntegerField()
    profile_complete = serializers.BooleanField()
    kyc_status = serializers.ChoiceField(
        choices=['pending', 'submitted', 'approved', 'rejected']
    )
    socials_connected = serializers.BooleanField()
    theme_selected = serializers.BooleanField()
    is_complete = serializers.BooleanField()


class StoreProfileSerializer(serializers.Serializer):
    """Serializer for updating the vendor's store profile."""

    store_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    bio = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    category = serializers.CharField(max_length=100, required=False, allow_blank=True)
    brand_vibes = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    logo = serializers.ImageField(required=False)
    ai_knowledge = serializers.CharField(max_length=6000, required=False, allow_blank=True)
    ai_assistant_enabled = serializers.BooleanField(required=False)
    ai_auto_reply = serializers.BooleanField(required=False)
    ai_tone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    ai_language = serializers.CharField(max_length=20, required=False, allow_blank=True)
    order_fields = serializers.CharField(required=False, allow_blank=True)
    followup_hours = serializers.IntegerField(required=False, min_value=1, max_value=48)
    followup_message = serializers.CharField(max_length=500, required=False, allow_blank=True)
    restricted_topics = serializers.CharField(required=False, allow_blank=True)
