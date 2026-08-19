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
        'ai_auto_reply': bool(metadata.get('aiAutoReply', False)),
        'ai_tone': metadata.get('aiTone', ''),
        'ai_language': metadata.get('aiLanguage', ''),
        'order_fields': metadata.get('orderFields') or ['Full name', 'Phone number', 'Delivery address'],
        'followup_hours': int(metadata.get('followupHours') or 6),
        'followup_message': metadata.get('followupMessage', ''),
        'restricted_topics': metadata.get('restrictedTopics') or [],
        'knowledge_docs': [
            {'name': doc.get('name', ''), 'chars': len(doc.get('text', ''))}
            for doc in (metadata.get('knowledgeDocs') or [])
        ],
        'website_knowledge': {
            'url': (metadata.get('websiteKnowledge') or {}).get('url', ''),
            'chars': len((metadata.get('websiteKnowledge') or {}).get('text', '')),
        },
    }


def parse_string_list(raw):
    """Parse a JSON-encoded string list, tolerating bad input."""
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
        metadata['brandVibe'] = parse_string_list(data['brand_vibes'])
    if 'ai_knowledge' in data:
        metadata['aiKnowledge'] = data['ai_knowledge']
    if 'ai_assistant_enabled' in data:
        metadata['aiAssistantEnabled'] = data['ai_assistant_enabled']
    if 'ai_auto_reply' in data:
        metadata['aiAutoReply'] = data['ai_auto_reply']
    if 'ai_tone' in data:
        metadata['aiTone'] = data['ai_tone'] if data['ai_tone'] in ('professional', 'casual') else ''
    if 'ai_language' in data:
        metadata['aiLanguage'] = data['ai_language'] if data['ai_language'] in ('english', 'nepali', 'mixed') else ''
    if 'order_fields' in data:
        metadata['orderFields'] = parse_string_list(data['order_fields'])[:10]
    if 'followup_hours' in data:
        metadata['followupHours'] = data['followup_hours']
    if 'followup_message' in data:
        metadata['followupMessage'] = data['followup_message']
    if 'restricted_topics' in data:
        metadata['restrictedTopics'] = parse_string_list(data['restricted_topics'])[:10]


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


class KnowledgeDocumentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Add an uploaded document to the AI knowledge sources."""
        from inbox.services.knowledge import (
            MAX_DOCUMENTS,
            MAX_UPLOAD_BYTES,
            KnowledgeError,
            extract_document_text,
        )

        from .order_views import get_request_tenant as resolve_tenant

        tenant = resolve_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        upload = request.FILES.get('file')
        if upload is None:
            return Response({'error': 'Attach a file.'}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_UPLOAD_BYTES:
            return Response({'error': 'File too large (max 500KB).'}, status=status.HTTP_400_BAD_REQUEST)
        metadata = tenant.metadata or {}
        docs = metadata.get('knowledgeDocs') or []
        if len(docs) >= MAX_DOCUMENTS:
            return Response(
                {'error': f'Maximum {MAX_DOCUMENTS} documents. Remove one first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            text = extract_document_text(upload.name, upload.read())
        except KnowledgeError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        docs = [doc for doc in docs if doc.get('name') != upload.name]
        docs.append({'name': upload.name[:100], 'text': text})
        metadata['knowledgeDocs'] = docs
        tenant.metadata = metadata
        tenant.save()
        return Response({'documents': [{'name': d['name'], 'chars': len(d['text'])} for d in docs]})

    def delete(self, request):
        """Remove a knowledge document by name."""
        from .order_views import get_request_tenant as resolve_tenant

        tenant = resolve_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        name = request.query_params.get('name', '')
        metadata = tenant.metadata or {}
        docs = [doc for doc in (metadata.get('knowledgeDocs') or []) if doc.get('name') != name]
        metadata['knowledgeDocs'] = docs
        tenant.metadata = metadata
        tenant.save()
        return Response({'documents': [{'name': d['name'], 'chars': len(d['text'])} for d in docs]})


class KnowledgeWebsiteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Fetch the business website into the AI knowledge sources."""
        from django.utils import timezone

        from inbox.services.knowledge import KnowledgeError, fetch_website_text

        from .order_views import get_request_tenant as resolve_tenant

        tenant = resolve_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        url = str(request.data.get('url') or '').strip()
        try:
            text = fetch_website_text(url)
        except KnowledgeError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        metadata = tenant.metadata or {}
        metadata['websiteKnowledge'] = {
            'url': url[:300],
            'text': text,
            'fetched_at': timezone.now().isoformat(),
        }
        tenant.metadata = metadata
        tenant.save()
        return Response({'url': url, 'chars': len(text)})

    def delete(self, request):
        """Remove the website knowledge source."""
        from .order_views import get_request_tenant as resolve_tenant

        tenant = resolve_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        metadata = tenant.metadata or {}
        metadata.pop('websiteKnowledge', None)
        tenant.metadata = metadata
        tenant.save()
        return Response({'removed': True})
