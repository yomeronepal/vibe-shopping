from django.conf import settings
from .models import Tenant

class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host().split(':')[0]
        base_domain = getattr(settings, 'TENANT_BASE_DOMAIN', 'vibe-shopping.com')
        
        request.tenant = None
        # 1. Try to resolve from Subdomain/Header
        tenant_from_domain = None
        
        # Check for X-Tenant-Subdomain header (Useful for local dev/testing)
        header_subdomain = request.headers.get('X-Tenant-Subdomain')
        if header_subdomain:
             try:
                tenant_from_domain = Tenant.objects.get(subdomain=header_subdomain)
             except Tenant.DoesNotExist:
                pass
        
        # If not in header, check Host
        if not tenant_from_domain and host.endswith(base_domain):
            prefix = host[:-len(base_domain)]
            if prefix.endswith('.'):
                prefix = prefix[:-1]
            subdomain = prefix
            
            if subdomain and subdomain not in ['www', 'api', 'admin', '']:
                try:
                    tenant_from_domain = Tenant.objects.get(subdomain=subdomain)
                except Tenant.DoesNotExist:
                    pass

        # 2. Try to resolve from Authenticated User
        tenant_from_user = None
        if request.user.is_authenticated and hasattr(request.user, 'vendor_profile'):
            tenant_from_user = request.user.vendor_profile.tenant

        # 3. Conflict Resolution & Assignment
        if tenant_from_domain and tenant_from_user:
            if tenant_from_domain != tenant_from_user:
                from django.http import JsonResponse
                return JsonResponse(
                    {'error': 'Tenant Mismatch: You do not have access to this store context.'}, 
                    status=403
                )
            request.tenant = tenant_from_domain
        elif tenant_from_domain:
            request.tenant = tenant_from_domain
        elif tenant_from_user:
            request.tenant = tenant_from_user
        else:
            request.tenant = None

        response = self.get_response(request)
        return response
