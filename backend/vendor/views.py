
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db import transaction
from django.contrib.auth.models import User
from core.models import Product, Tenant, VendorProfile, ProductEvent
# We'll need to move serializers or import them. For now import from core.
from core.serializers import ProductSerializer, ProductCreateSerializer, VendorSignupSerializer

class VendorSignupView(generics.CreateAPIView):
    serializer_class = VendorSignupSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                from django.utils.text import slugify
                
                # Create Tenant
                store_name = serializer.validated_data['store_name']
                subdomain = slugify(store_name)
                
                tenant = Tenant.objects.create(
                    name=store_name,
                    subdomain=subdomain,
                    is_active=False  # Inactive until approved/onboarded
                )

                # Create User
                user = User.objects.create_user(
                    username=serializer.validated_data['username'],
                    email=serializer.validated_data['email'],
                    password=serializer.validated_data['password']
                )

                # Create Vendor Profile
                VendorProfile.objects.create(
                    user=user,
                    tenant=tenant,
                    role='owner'
                )

                return Response({
                    'message': 'Vendor account created successfully',
                    'tenant_id': tenant.id,
                    'user_id': user.id
                }, status=status.HTTP_201_CREATED)

                return Response({
                    'message': 'Vendor account created successfully',
                    'tenant_id': tenant.id,
                    'user_id': user.id
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class TenantViewSet(viewsets.GenericViewSet):
    """
    ViewSet to manage the Vendor's own Tenant (Store).
    """
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Tenant.objects.filter(members__user=self.request.user)

    @action(detail=False, methods=['patch'])
    def current(self, request):
        """
        Update current vendor's tenant (e.g. metadata/niches).
        """
        if not hasattr(request.user, 'vendor_profile'):
             return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)
             
        tenant = request.user.vendor_profile.tenant
        
        # Import here to avoid circular dependencies if any
        from core.serializers import TenantSerializer
        serializer = TenantSerializer(tenant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['get', 'patch'], url_path='social-media')
    def social_media(self, request):
        """
        Get or update social media connections for vendor's tenant.
        Expected format in metadata: {
            'social_media': {
                'instagram': {'connected': true, 'username': '@shop', 'access_token': '...'},
                'facebook': {'connected': true, 'page_id': '...', 'access_token': '...'},
                'tiktok': {'connected': true, 'username': '@shop', 'access_token': '...'}
            }
        }
        """
        if not hasattr(request.user, 'vendor_profile'):
            return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)
        
        tenant = request.user.vendor_profile.tenant
        
        if request.method == 'GET':
            # Return current social media connections
            social_media = tenant.metadata.get('social_media', {})
            return Response({'social_media': social_media})
        
        elif request.method == 'PATCH':
            # Update social media connections
            social_media_data = request.data.get('social_media', {})
            
            # Update metadata with new social media data
            if 'social_media' not in tenant.metadata:
                tenant.metadata['social_media'] = {}
            
            tenant.metadata['social_media'].update(social_media_data)
            tenant.save()
            
            return Response({
                'message': 'Social media connections updated',
                'social_media': tenant.metadata.get('social_media', {})
            })
    
    @action(detail=False, methods=['get'], url_path='oauth/(?P<platform>instagram|facebook|tiktok)/start')
    def oauth_start(self, request, platform=None):
        """
        Generate OAuth URL for platform authentication.
        """
        if not hasattr(request.user, 'vendor_profile'):
            return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)
        
        from core.services.social_media import InstagramService, FacebookService, TikTokService
        from core.models import Tenant
        import secrets
        
        # Initialize service to check credentials
        if platform == 'instagram':
            service = InstagramService()
        elif platform == 'facebook':
            service = FacebookService()
        elif platform == 'tiktok':
            service = TikTokService()
        else:
            return Response({'error': 'Invalid platform'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if OAuth credentials are configured
        if not service.app_id or not service.app_secret:
            # Demo mode: create mock connection without OAuth
            tenant = request.user.vendor_profile.tenant
            
            if 'social_media' not in tenant.metadata:
                tenant.metadata['social_media'] = {}
            
            tenant.metadata['social_media'][platform] = {
                'connected': True,
                'username': f'@demo_{platform}_account',
                'id': f'demo_{platform}_id_123',
                'profile_picture': None,
                'demo_mode': True,  # Flag to indicate this is demo
            }
            
            if platform == 'instagram':
                tenant.metadata['social_media'][platform]['instagram_account_id'] = 'demo_ig_123'
                tenant.metadata['social_media'][platform]['page_id'] = 'demo_page_123'
            elif platform == 'facebook':
                tenant.metadata['social_media'][platform]['page_id'] = 'demo_fb_page_123'
            
            tenant.save()
            
            # Return success response that redirects back to frontend
            from django.shortcuts import redirect
            frontend_url = 'http://localhost:5173'  # Frontend URL
            return redirect(f'{frontend_url}/vendor?oauth_success={platform}&demo=true')
        
        # Real OAuth flow
        # Generate state token for CSRF protection
        state = secrets.token_urlsafe(32)
        
        # Store state in session
        request.session[f'oauth_state_{platform}'] = state
        request.session[f'oauth_tenant_id_{platform}'] = request.user.vendor_profile.tenant.id
        
        # Get redirect URI
        redirect_uri = request.build_absolute_uri(f'/api/vendor/tenant/oauth/{platform}/callback/')
        auth_url = service.get_auth_url(redirect_uri, state)
        
        return Response({
            'auth_url': auth_url,
            'platform': platform
        })
    
    @action(detail=False, methods=['get'], url_path='oauth/(?P<platform>instagram|facebook|tiktok)/callback')
    def oauth_callback(self, request, platform=None):
        """
        Handle OAuth callback and store tokens.
        """
        from core.services.social_media import InstagramService, FacebookService, TikTokService
        from core.models import Tenant
        from django.shortcuts import redirect
        
        frontend_url = 'http://localhost:5173'  # Frontend URL
        code = request.GET.get('code')
        state = request.GET.get('state')
        error = request.GET.get('error')
        
        if error:
            return redirect(f'{frontend_url}/vendor?oauth_error={error}')
        
        # Verify state token
        stored_state = request.session.get(f'oauth_state_{platform}')
        if not stored_state or stored_state != state:
            return redirect(f'{frontend_url}/vendor?oauth_error=invalid_state')
        
        # Get tenant ID from session
        tenant_id = request.session.get(f'oauth_tenant_id_{platform}')
        if not tenant_id:
            return redirect(f'{frontend_url}/vendor?oauth_error=no_tenant')
        
        try:
            tenant = Tenant.objects.get(id=tenant_id)
        except Tenant.DoesNotExist:
            return redirect(f'{frontend_url}/vendor?oauth_error=tenant_not_found')
        
        # Exchange code for token
        redirect_uri = request.build_absolute_uri(f'/api/vendor/tenant/oauth/{platform}/callback/')
        
        if platform == 'instagram':
            service = InstagramService()
        elif platform == 'facebook':
            service = FacebookService()
        elif platform == 'tiktok':
            service = TikTokService()
        else:
            return redirect(f'{frontend_url}/vendor?oauth_error=invalid_platform')
        
        # Exchange code for access token
        token_data = service.exchange_code_for_token(code, redirect_uri)
        
        if 'error' in token_data:
            return redirect(f'{frontend_url}/vendor?oauth_error={token_data["error"]}')
        
        # Get account info
        service.access_token = token_data['access_token']
        account_info = service.get_account_info()
        
        if 'error' in account_info:
            return redirect(f'{frontend_url}/vendor?oauth_error={account_info["error"]}')
        
        # Store credentials in tenant metadata
        if 'social_media' not in tenant.metadata:
            tenant.metadata['social_media'] = {}
        
        tenant.metadata['social_media'][platform] = {
            'connected': True,
            'access_token': token_data['access_token'],
            'username': account_info.get('username'),
            'id': account_info.get('id'),
            'profile_picture': account_info.get('profile_picture'),
        }
        
        # Add platform-specific data
        if platform == 'instagram':
            tenant.metadata['social_media'][platform]['instagram_account_id'] = account_info.get('id')
            tenant.metadata['social_media'][platform]['page_id'] = account_info.get('page_id')
        elif platform == 'facebook':
            tenant.metadata['social_media'][platform]['page_id'] = account_info.get('id')
        
        tenant.save()
        
        # Clear session data
        request.session.pop(f'oauth_state_{platform}', None)
        request.session.pop(f'oauth_tenant_id_{platform}', None)
        
        # Redirect back to vendor dashboard with success
        return redirect(f'{frontend_url}/vendor?oauth_success={platform}')



class ProductViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendors to manage products.
    """
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Filter products by the current user's tenant.
        """
        if getattr(self, 'swagger_fake_view', False):
             return Product.objects.none()
             
        user = self.request.user
        if not hasattr(user, 'vendor_profile'):
            return Product.objects.none()
            
        tenant = user.vendor_profile.tenant
        queryset = Product.objects.filter(tenant=tenant)
        
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return ProductCreateSerializer
        return ProductSerializer

    @action(detail=True, methods=['post'], url_path='generate-copy')
    def generate_copy(self, request, pk=None):
        """
        Trigger AI to regenerate title, description, and copy (BE-05).
        """
        product = self.get_object()
        
        if not product.image:
            return Response(
                {'error': 'Product has no image to analyze.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # from core.tasks import detect_vibe
        # Re-run analysis (which now includes Romanized Nepali prompt)
        # detect_vibe.delay(product.id)
        
        return Response({
            'message': 'Copy generation started. This may take a few seconds.',
            'status': 'processing'
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'], url_path='remove-background')
    def remove_background(self, request, pk=None):
        """
        Trigger background removal (BE-06).
        """
        product = self.get_object()
        
        if not product.image:
             return Response({'error': 'No image.'}, status=status.HTTP_400_BAD_REQUEST)

        from core.tasks import remove_background_task
        remove_background_task.delay(product.id, 'Product')
        
        return Response({
            'message': 'Background removal started.',
            'status': 'processing'
        }, status=status.HTTP_202_ACCEPTED)
    
    @action(detail=True, methods=['post'], url_path='post-to-social')
    def post_to_social(self, request, pk=None):
        """
        Post product to selected social media platforms.
        Request body: {
            'platforms': ['instagram', 'facebook', 'tiktok'],
            'caption': 'Custom caption...',
            'hashtags': ['fashion', 'style']
        }
        """
        product = self.get_object()
        
        if not product.processed_image and not product.image:
            return Response(
                {'error': 'Product needs an image to post.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        platforms = request.data.get('platforms', [])
        caption = request.data.get('caption', '')
        hashtags = request.data.get('hashtags', [])
        
        if not platforms:
            return Response(
                {'error': 'Please select at least one platform.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Build caption with hashtags
        full_caption = caption
        if hashtags:
            hashtag_str = ' '.join([f'#{tag}' for tag in hashtags])
            full_caption = f"{caption}\n\n{hashtag_str}"
        
        # Get tenant
        tenant = request.user.vendor_profile.tenant
        
        # Import here to avoid circular dependency
        from core.models import SocialMediaPost
        from core.tasks import post_to_social_media_task
        
        # Create post records and trigger tasks
        results = []
        for platform in platforms:
            # Create post record
            social_post = SocialMediaPost.objects.create(
                product=product,
                tenant=tenant,
                platform=platform,
                caption=full_caption,
                status='pending'
            )
            
            # Trigger async task
            post_to_social_media_task.delay(
                social_post.id,
                product.id,
                platform,
                full_caption
            )
            
            results.append({
                'platform': platform,
                'status': 'queued',
                'post_id': social_post.id
            })
        
        return Response({
            'message': f'Posting to {len(platforms)} platform(s) in progress...',
            'results': results
        }, status=status.HTTP_202_ACCEPTED)

    def perform_create(self, serializer):
        """
        # Automatically assign the product to the current user's tenant
        # and trigger AI processing.
        """
        
        tenant = self.request.user.vendor_profile.tenant
        product = serializer.save(tenant=tenant)
        
        # Trigger background removal if product has an image
        if product.image:
            from core.tasks import remove_background_task
            remove_background_task.delay(product.id)

class DraftProductView(generics.CreateAPIView):
    """
    Endpoint to upload an image and create a draft product (BE-New).
    This draft ID is then used for WS connection and AI generation.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ProductSerializer # Just for schema generation, not used for validation

    def create(self, request, *args, **kwargs):
        if 'image' not in request.FILES:
             return Response({'error': 'Image is required'}, status=status.HTTP_400_BAD_REQUEST)
             
        image = request.FILES['image']
        tenant = request.user.vendor_profile.tenant
        
        # Create a shell product
        product = Product.objects.create(
            tenant=tenant,
            name="Draft Product", # Placeholder
            price=0.00,           # Placeholder
            stock=0,
            status='draft',
            image=image
        )
        
        # Trigger background removal immediately
        from core.tasks import remove_background_task
        remove_background_task.delay(product.id)
        
        return Response({
            'id': product.id,
            'image_url': product.image.url
        }, status=status.HTTP_201_CREATED)

class AnalyticsViewSet(viewsets.ViewSet):
    """
    Analytics for Vibe Shopping (BE-09).
    """
    def get_permissions(self):
        if self.action == 'track':
            return [AllowAny()]
        return [IsAuthenticated()]

    @action(detail=False, methods=['post'])
    def track(self, request):
        """
        Public endpoint to track interaction events.
        """
        product_id = request.data.get('product_id')
        event_type = request.data.get('event_type')
        country = request.data.get('country')
        
        if not product_id or event_type not in ['view', 'add_to_cart']:
            return Response({'error': 'Invalid data'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # We don't enforce tenant context for public tracking, just product existence
            product = Product.objects.get(id=product_id)
            ProductEvent.objects.create(
                product=product,
                event_type=event_type,
                country=country
            )
            return Response({'status': 'recorded'}, status=status.HTTP_201_CREATED)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'])
    def vibes(self, request):
        """
        Vendor endpoint: Get vibe performance metrics.
        """
        if not hasattr(request.user, 'vendor_profile'):
            return Response({'error': 'Vendor access required'}, status=status.HTTP_403_FORBIDDEN)
            
        tenant = request.user.vendor_profile.tenant
        
        # 1. Get Vendor Products
        products = Product.objects.filter(tenant=tenant)
        
        # 2. Get Events
        events = ProductEvent.objects.filter(product__in=products).select_related('product')
        
        # 3. Aggregate
        vibe_stats = {}
        
        for event in events:
            # Get vibes from product
            vibes = event.product.metadata.get('vibe_tags', [])
            if not vibes:
                continue
                
            for vibe in vibes:
                if vibe not in vibe_stats:
                    vibe_stats[vibe] = {'views': 0, 'add_to_cart': 0, 'purchases': 0, 'countries': set()}
                
                stats = vibe_stats[vibe]
                if event.event_type == 'view':
                    stats['views'] += 1
                elif event.event_type == 'add_to_cart':
                    stats['add_to_cart'] += 1
                elif event.event_type == 'purchase':
                    stats['purchases'] += 1
                
                if event.country:
                    stats['countries'].add(event.country)
        
        # Format for response
        response_data = []
        for vibe, stats in vibe_stats.items():
            response_data.append({
                'vibe': vibe,
                'views': stats['views'],
                'add_to_cart': stats['add_to_cart'],
                'purchases': stats['purchases'],
                'top_countries': list(stats['countries'])[:5] # Limit 
            })
            
        # Sort by views desc
        response_data.sort(key=lambda x: x['views'], reverse=True)
        
        return Response(response_data, status=status.HTTP_200_OK)
