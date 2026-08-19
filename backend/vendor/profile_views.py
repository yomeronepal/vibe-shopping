import json

from django.conf import settings
from django.core.files.storage import default_storage
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .order_views import get_request_tenant
from .serializers import StoreProfileSerializer


def build_profile_payload(tenant):
    """Assemble the store profile response from the tenant record."""
    metadata = tenant.metadata or {}
    contact = metadata.get('contact', {})
    logo = metadata.get('logo')
    return {
        'store_name': tenant.name,
        'subdomain': tenant.subdomain,
        'logo': f'{settings.MEDIA_URL}{logo}' if logo else None,
        'bio': metadata.get('bio', ''),
        'category': (metadata.get('niches') or [''])[0],
        'brand_vibes': metadata.get('brandVibe', []),
        'phone': contact.get('phone', ''),
        'email': contact.get('email', ''),
        'address': contact.get('address', ''),
        'ai_knowledge': metadata.get('aiKnowledge', ''),
        'ai_assistant_enabled': bool(metadata.get('aiAssistantEnabled', True)),
        'ai_auto_suggest': bool(metadata.get('aiAutoSuggest', True)),
    }


def parse_brand_vibes(raw):
    """Parse the JSON-encoded vibe list, tolerating bad input."""
    try:
        parsed = json.loads(raw) if raw else []
    except ValueError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(vibe) for vibe in parsed]


def apply_profile_fields(tenant, metadata, data):
    """Copy the provided profile fields onto the tenant."""
    if data.get('store_name', '').strip():
        tenant.name = data['store_name'].strip()
    if 'bio' in data:
        metadata['bio'] = data['bio']
    if 'category' in data:
        metadata['niches'] = [data['category']] if data['category'] else []
    if 'brand_vibes' in data:
        metadata['brandVibe'] = parse_brand_vibes(data['brand_vibes'])
    if 'ai_knowledge' in data:
        metadata['aiKnowledge'] = data['ai_knowledge']
    if 'ai_assistant_enabled' in data:
        metadata['aiAssistantEnabled'] = data['ai_assistant_enabled']
    if 'ai_auto_suggest' in data:
        metadata['aiAutoSuggest'] = data['ai_auto_suggest']


def apply_contact_fields(metadata, data):
    """Merge the provided contact fields into tenant metadata."""
    contact = metadata.get('contact', {})
    for field in ('phone', 'email', 'address'):
        if field in data:
            contact[field] = data[field]
    metadata['contact'] = contact


def save_logo(request, tenant, metadata):
    """Store an uploaded logo file and record its path."""
    if 'logo' not in request.FILES:
        return
    logo_file = request.FILES['logo']
    tenant_slug = tenant.subdomain or 'default'
    saved_path = default_storage.save(f'uploads/{tenant_slug}/logo/{logo_file.name}', logo_file)
    metadata['logo'] = saved_path


class VendorStoreProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the vendor's store profile."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(build_profile_payload(tenant))

    def patch(self, request):
        """Update only the store profile fields that were provided."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = StoreProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        metadata = tenant.metadata or {}
        apply_profile_fields(tenant, metadata, data)
        apply_contact_fields(metadata, data)
        save_logo(request, tenant, metadata)
        tenant.metadata = metadata
        tenant.save()
        return Response(build_profile_payload(tenant))
