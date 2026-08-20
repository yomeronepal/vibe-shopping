
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db import transaction
from django.contrib.auth.models import User
from core.models import Product, Tenant, VendorProfile, ProductEvent
# We'll need to move serializers or import them. For now import from core.
from core.serializers import ProductSerializer, ProductCreateSerializer, VendorSignupSerializer
from core.throttles import LogoAnalysisThrottle
from .serializers import OnboardingProfileSerializer, KYCSubmissionSerializer, OnboardingStatusSerializer

class VendorSignupView(generics.CreateAPIView):
    serializer_class = VendorSignupSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                from django.utils.text import slugify
                from rest_framework.authtoken.models import Token
                
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

                # Create auth token for auto-login
                token, _ = Token.objects.get_or_create(user=user)

                return Response({
                    'message': 'Vendor account created successfully',
                    'tenant_id': tenant.id,
                    'user_id': user.id,
                    'token': token.key  # Return token for auto-login
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


class OnboardingViewSet(viewsets.GenericViewSet):
    """
    ViewSet to manage vendor onboarding process.
    """
    permission_classes = [IsAuthenticated]

    def get_tenant(self, request):
        """Helper to get the current user's tenant."""
        if not hasattr(request.user, 'vendor_profile'):
            return None
        return request.user.vendor_profile.tenant

    @action(detail=False, methods=['get'])
    def status(self, request):
        """
        Get current onboarding status for the vendor.
        """
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)

        metadata = tenant.metadata or {}
        onboarding = metadata.get('onboarding', {})
        social_media = metadata.get('social_media', {})

        # Check profile completion
        profile_complete = bool(
            metadata.get('bio') or 
            metadata.get('brandVibe') or 
            metadata.get('niches')
        )

        # Check KYC status
        kyc_data = onboarding.get('kyc', {})
        kyc_status = kyc_data.get('status', 'pending')

        # Check if any socials are connected
        socials_connected = any(
            platform_data.get('connected', False) 
            for platform_data in social_media.values()
        )

        # Check if theme is selected
        theme_selected = bool(metadata.get('shopTheme'))

        # Determine current step
        if not profile_complete:
            current_step = 1
        elif kyc_status == 'pending':
            current_step = 2
        elif not socials_connected and not onboarding.get('socials_skipped', False):
            current_step = 3
        else:
            current_step = 4

        is_complete = onboarding.get('is_complete', False)

        # Get vendor's AI-generated theme from Theme model
        from core.models import Theme
        ai_theme = Theme.objects.filter(tenant=tenant, is_ai_generated=True).first()

        logo_url = None
        if metadata.get('logo'):
            from django.conf import settings
            logo_url = f"{settings.MEDIA_URL}{metadata.get('logo')}"

        return Response({
            'current_step': current_step,
            'profile_complete': profile_complete,
            'kyc_status': kyc_status,
            'socials_connected': socials_connected,
            'theme_selected': theme_selected,
            'is_complete': is_complete,
            'ai_theme': ai_theme.to_dict() if ai_theme else None,
            'store_name': tenant.name,
            'logo': logo_url,
        })

    @action(detail=False, methods=['post'])
    def profile(self, request):
        """
        Save onboarding profile data (Step 1).
        """
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)

        serializer = OnboardingProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Update tenant metadata
        if tenant.metadata is None:
            tenant.metadata = {}

        # Save profile fields to metadata
        if data.get('bio'):
            tenant.metadata['bio'] = data['bio']
        if data.get('category'):
            tenant.metadata['niches'] = [data['category']]
        if data.get('brand_vibes'):
            tenant.metadata['brandVibe'] = data['brand_vibes']
        if data.get('ai_persona') is not None:
            tenant.metadata['aiPersona'] = data['ai_persona']
        if data.get('offering'):
            tenant.metadata['offering'] = data['offering']
        contact = tenant.metadata.get('contact', {})
        for field in ('phone', 'email', 'address'):
            if data.get(field):
                contact[field] = data[field]
        tenant.metadata['contact'] = contact

        # Handle logo upload
        if 'logo' in request.FILES:
            logo_file = request.FILES['logo']
            # Save logo to tenant
            tenant_slug = tenant.subdomain if tenant.subdomain else 'default'
            logo_path = f'uploads/{tenant_slug}/logo/{logo_file.name}'
            
            from django.core.files.storage import default_storage
            saved_path = default_storage.save(logo_path, logo_file)
            tenant.metadata['logo'] = saved_path

        # Mark profile as started in onboarding tracker
        if 'onboarding' not in tenant.metadata:
            tenant.metadata['onboarding'] = {}
        tenant.metadata['onboarding']['profile_saved'] = True

        tenant.save()

        return Response({
            'message': 'Profile saved successfully',
            'metadata': tenant.metadata
        })

    @action(detail=False, methods=['post'])
    def kyc(self, request):
        """
        Submit KYC documents (Step 2).
        """
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)

        serializer = KYCSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if tenant.metadata is None:
            tenant.metadata = {}
        if 'onboarding' not in tenant.metadata:
            tenant.metadata['onboarding'] = {}

        kyc_data = {
            'pan_vat_number': data['pan_vat_number'],
            'business_reg_no': data.get('business_reg_no', ''),
            'status': 'submitted',
            'submitted_at': str(import_datetime_now())
        }

        # Handle KYC document upload
        if 'kyc_document' in request.FILES:
            doc_file = request.FILES['kyc_document']
            tenant_slug = tenant.subdomain if tenant.subdomain else 'default'
            doc_path = f'uploads/{tenant_slug}/kyc/{doc_file.name}'
            
            from django.core.files.storage import default_storage
            saved_path = default_storage.save(doc_path, doc_file)
            kyc_data['document_path'] = saved_path

        tenant.metadata['onboarding']['kyc'] = kyc_data
        tenant.metadata['panVatNumber'] = data['pan_vat_number']
        tenant.metadata['businessRegNo'] = data.get('business_reg_no', '')

        tenant.save()

        return Response({
            'message': 'KYC documents submitted successfully',
            'kyc_status': 'submitted'
        })

    @action(detail=False, methods=['post'], url_path='skip-socials')
    def skip_socials(self, request):
        """
        Skip social media connection (Step 3).
        """
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)

        if tenant.metadata is None:
            tenant.metadata = {}
        if 'onboarding' not in tenant.metadata:
            tenant.metadata['onboarding'] = {}

        tenant.metadata['onboarding']['socials_skipped'] = True
        tenant.save()

        return Response({'message': 'Social media connection skipped'})

    @action(detail=False, methods=['post'])
    def complete(self, request):
        """
        Complete onboarding and activate tenant (Step 4).
        """
        tenant = self.get_tenant(request)
        if not tenant:
            return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)

        # Save theme if provided
        theme = request.data.get('theme')
        if theme:
            if tenant.metadata is None:
                tenant.metadata = {}
            tenant.metadata['shopTheme'] = theme

        # Mark onboarding as complete
        if 'onboarding' not in tenant.metadata:
            tenant.metadata['onboarding'] = {}
        tenant.metadata['onboarding']['is_complete'] = True
        tenant.metadata['onboarding']['completed_at'] = str(import_datetime_now())

        # Activate tenant
        tenant.is_active = True
        tenant.save()

        return Response({
            'message': 'Onboarding completed successfully',
            'tenant_active': True
        })


def import_datetime_now():
    """Helper to get current datetime."""
    from django.utils import timezone
    return timezone.now()


class ThemeViewSet(viewsets.ViewSet):
    """
    ViewSet to list available shop themes.
    """
    permission_classes = [AllowAny]

    def list(self, request):
        """
        GET /api/vendor/themes/ - List all themes (defaults + vendor's themes)
        """
        from core.models import Theme
        
        # Get default themes
        default_themes = Theme.objects.filter(is_default=True)
        
        # Get vendor's themes if authenticated
        vendor_themes = []
        if request.user.is_authenticated and hasattr(request.user, 'vendor_profile'):
            tenant = request.user.vendor_profile.tenant
            vendor_themes = Theme.objects.filter(tenant=tenant)
        
        # Combine and return
        all_themes = list(default_themes) + list(vendor_themes)
        return Response([theme.to_dict() for theme in all_themes])

    def retrieve(self, request, pk=None):
        """
        GET /api/vendor/themes/{id}/ - Get theme by slug or ID
        """
        from core.models import Theme
        
        # Try to find by slug first, then by ID
        theme = Theme.objects.filter(slug=pk).first()
        if not theme:
            try:
                theme = Theme.objects.get(id=int(pk))
            except (ValueError, Theme.DoesNotExist):
                pass
        
        if theme:
            return Response(theme.to_dict())
        return Response({'error': 'Theme not found'}, status=status.HTTP_404_NOT_FOUND)


class LogoAnalysisView(generics.CreateAPIView):
    """
    Analyze uploaded logo and recommend matching theme using Gemini AI.
    POST /api/vendor/onboarding/analyze-logo/
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [LogoAnalysisThrottle]

    def create(self, request, *args, **kwargs):
        if 'logo' not in request.FILES:
            return Response(
                {'error': 'Logo image is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        logo_file = request.FILES['logo']
        logo_data = logo_file.read()

        try:
            from core.services.gemini_service import GeminiLogoAnalyzer
            from core.models import Theme
            from core.utils.ai_tracker import track_ai_usage, estimate_image_tokens, estimate_text_tokens

            tenant = request.user.vendor_profile.tenant

            analyzer = GeminiLogoAnalyzer()
            result = analyzer.analyze_logo(logo_data)

            if result['success']:
                ai_provider = result.get('ai_provider', 'gemini')

                input_tokens = estimate_image_tokens(logo_data)
                output_tokens = estimate_text_tokens(str(result['data']))

                track_ai_usage(
                    tenant=tenant,
                    ai_provider=ai_provider,
                    operation_type='logo_analysis',
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    success=True,
                    user=request.user,
                    metadata={'logo_filename': logo_file.name}
                )
                palette = result['data'].get('custom_palette', {})
                
                # Create or update AI-generated theme for this vendor
                ai_theme, created = Theme.objects.update_or_create(
                    tenant=tenant,
                    is_ai_generated=True,
                    defaults={
                        'name': 'AI Generated Theme',
                        'slug': 'ai-generated',
                        'description': result['data'].get('recommendation_reason', 'Theme generated from logo analysis'),
                        'is_default': False,
                        'primary': palette.get('primary', '#8A2BE2'),
                        'accent': palette.get('accent', '#a855f7'),
                        'background': palette.get('background', '#f5f3f8'),
                        'surface': palette.get('surface', '#ffffff'),
                        'text': palette.get('text', '#1a1a2e'),
                        'text_secondary': palette.get('textSecondary', '#6b7280'),
                        'border': palette.get('border', '#e5e7eb'),
                        'card_bg': palette.get('cardBg', '#ffffff'),
                        'button_bg': palette.get('buttonBg', palette.get('primary', '#8A2BE2')),
                        'button_text': palette.get('buttonText', '#ffffff'),
                        'gradient': palette.get('gradient', f"linear-gradient(135deg, {palette.get('primary', '#8A2BE2')} 0%, {palette.get('accent', '#a855f7')} 100%)"),
                        'text_gradient': palette.get('textGradient', f"linear-gradient(135deg, {palette.get('primary', '#8A2BE2')}, {palette.get('accent', '#a855f7')})"),
                        'brand_style': result['data'].get('brand_style', ''),
                        'brand_keywords': result['data'].get('brand_keywords', []),
                        'recommendation_reason': result['data'].get('recommendation_reason', ''),
                    }
                )
                
                # Get the recommended default theme
                recommended_preset_slug = result['data'].get('recommended_theme', 'neon-vibe')
                recommended_theme = Theme.objects.filter(is_default=True, slug=recommended_preset_slug).first()
                
                return Response({
                    'analysis': result['data'],
                    'ai_theme': ai_theme.to_dict(),
                    'recommended_theme_details': recommended_theme.to_dict() if recommended_theme else None,
                    'saved': True,
                    'created': created
                }, status=status.HTTP_200_OK)
            else:
                ai_provider = result.get('ai_provider', 'gemini')
                input_tokens = estimate_image_tokens(logo_data)

                track_ai_usage(
                    tenant=tenant,
                    ai_provider=ai_provider,
                    operation_type='logo_analysis',
                    input_tokens=input_tokens,
                    output_tokens=0,
                    success=False,
                    error_message=result['error'],
                    user=request.user,
                    metadata={'logo_filename': logo_file.name}
                )

                return Response(
                    {'error': result['error']},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except ValueError as e:
            track_ai_usage(
                tenant=tenant,
                ai_provider='gemini',
                operation_type='logo_analysis',
                success=False,
                error_message=f'Configuration error: {str(e)}',
                user=request.user
            )
            return Response(
                {'error': f'Configuration error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            track_ai_usage(
                tenant=tenant,
                ai_provider='gemini',
                operation_type='logo_analysis',
                success=False,
                error_message=f'Analysis failed: {str(e)}',
                user=request.user
            )
            return Response(
                {'error': f'Analysis failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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

    def perform_update(self, serializer):
        """Save edits, recording manual stock adjustments."""
        from core.models import record_stock_change

        old_stock = serializer.instance.stock
        product = serializer.save()
        delta = product.stock - old_stock
        if delta:
            record_stock_change(product, delta, 'manual', 'Edited by vendor')

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
        Automatically assign the product to the current user's tenant
        and trigger AI processing. Handle variants if provided.
        """
        from core.models import ProductVariant, ProductImage
        import json

        from core.models import record_stock_change

        tenant = self.request.user.vendor_profile.tenant
        product = serializer.save(tenant=tenant)
        if product.stock:
            record_stock_change(product, product.stock, 'initial', 'Product created')

        variants_data = self.request.data.get('variants')
        if variants_data:
            if isinstance(variants_data, str):
                variants_data = json.loads(variants_data)

            for idx, variant_data in enumerate(variants_data):
                variant = ProductVariant.objects.create(
                    product=product,
                    color_name=variant_data.get('color_name'),
                    color_hex=variant_data.get('color_hex', ''),
                    stock_by_size=variant_data.get('stock_by_size', {}),
                    is_default=(idx == 0)
                )

                variant_images = variant_data.get('images', [])
                if variant_images and f'variant_{idx}_images' in self.request.FILES:
                    files = self.request.FILES.getlist(f'variant_{idx}_images')
                    for file_idx, image_file in enumerate(files):
                        ProductImage.objects.create(
                            product=product,
                            variant=variant,
                            image=image_file,
                            display_order=file_idx
                        )

        if product.image:
            from core.tasks import remove_background_task
            remove_background_task.delay(product.id)

    @action(detail=True, methods=['post'], url_path='publish')
    def publish(self, request, pk=None):
        """Publish a draft or archived product to the storefront."""
        product = self.get_object()
        product.status = 'published'
        product.is_active = True
        product.save(update_fields=['status', 'is_active'])
        return Response(ProductSerializer(product).data)

    @action(detail=True, methods=['post'], url_path='sync-social')
    def sync_social(self, request, pk=None):
        """Push the product's updated caption to its published Facebook posts.

        Instagram posts are reported as skipped because the Meta API
        does not support editing published Instagram media.
        """
        from socials.models import ConnectedPage
        from socials.services.meta_graph import MetaGraphClient, MetaGraphError

        product = self.get_object()
        caption = request.data.get('caption') or product.description or product.name
        page = ConnectedPage.objects.filter(tenant=product.tenant, status='connected').first()
        if page is None:
            return Response(
                {'error': 'No connected Facebook Page.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        posts = product.social_posts.filter(status='posted').exclude(platform_post_id='')
        client = MetaGraphClient()
        results = [self.sync_one_post(client, page, post, caption) for post in posts]
        return Response({'caption': caption, 'results': results})

    def sync_one_post(self, client, page, post, caption):
        """Update one published post's caption, or explain why not."""
        from socials.services.meta_graph import MetaGraphError

        base = {'post_id': post.id, 'platform': post.platform}
        if post.platform != 'facebook':
            return {**base, 'status': 'skipped', 'reason': 'Instagram posts cannot be edited via the Meta API.'}
        if post.post_format == 'story':
            return {**base, 'status': 'skipped', 'reason': 'Stories cannot be edited.'}
        if post.platform_post_id.startswith('local-'):
            return {**base, 'status': 'skipped', 'reason': 'Simulated post.'}
        try:
            client.update_page_post_caption(post.platform_post_id, page.get_access_token(), caption)
        except MetaGraphError as exc:
            return {**base, 'status': 'failed', 'error': str(exc)}
        post.caption = caption
        post.save(update_fields=['caption'])
        return {**base, 'status': 'updated'}

    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        """Archive a product, hiding it from the storefront."""
        product = self.get_object()
        product.status = 'archived'
        product.is_active = False
        product.save(update_fields=['status', 'is_active'])
        return Response(ProductSerializer(product).data)

    def destroy(self, request, *args, **kwargs):
        """Delete a product, refusing when order history depends on it."""
        product = self.get_object()
        if product.orderitem_set.exists():
            return Response(
                {'error': 'This product has order history and cannot be deleted. Archive it instead.'},
                status=status.HTTP_409_CONFLICT,
            )
        product.social_posts.update(product=None)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """
        Lookup product by product_code (from QR scan or manual entry).
        URL: /api/vendor/products/lookup/?code=VB-123456
        """
        code = request.query_params.get('code')
        if not code:
            return Response({'error': 'Product code is required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get current vendor's tenant
        if not hasattr(request.user, 'vendor_profile'):
             return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)
        tenant = request.user.vendor_profile.tenant
        
        try:
            # Case-insensitive lookup constrained to this tenant
            product = Product.objects.get(product_code__iexact=code, tenant=tenant)
            serializer = self.get_serializer(product)
            return Response(serializer.data)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

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
    Analytics for BizAlly (BE-09).
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


class POSOrderViewSet(viewsets.GenericViewSet):
    """
    ViewSet for handling POS (Point of Sale) orders.
    """
    permission_classes = [IsAuthenticated]
    
    def create(self, request):
        """
        Create a new POS order.
        """
        from core.serializers import OrderCreateSerializer
        from core.models import Order, OrderItem
        
        # Verify vendor
        if not hasattr(request.user, 'vendor_profile'):
             return Response({'error': 'Vendor profile required'}, status=status.HTTP_403_FORBIDDEN)
        tenant = request.user.vendor_profile.tenant
        
        # Basic validation
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        
        try:
            with transaction.atomic():
                # calculation context
                total_amount = 0
                items_to_create = []
                
                # Verify items and stock
                for item_data in data['items']:
                    try:
                        product = Product.objects.get(id=item_data['product_id'], tenant=tenant)
                    except Product.DoesNotExist:
                         return Response({'error': f"Product ID {item_data['product_id']} not found."}, status=status.HTTP_400_BAD_REQUEST)
                        
                    if product.stock < item_data['quantity']:
                        return Response({'error': f"Insufficient stock for {product.name} (Available: {product.stock})"}, status=status.HTTP_400_BAD_REQUEST)
                    
                    # Calculate price
                    line_total = product.price * item_data['quantity']
                    total_amount += line_total
                    
                    items_to_create.append({
                        'product': product,
                        'quantity': item_data['quantity'],
                        'price': product.price,
                        'size': item_data.get('size', ''),
                        'color': item_data.get('color', ''),
                    })
                
                # Create Order
                order = Order.objects.create(
                    tenant=tenant,
                    user=None,
                    total_amount=total_amount,
                    status=data.get('status', 'completed'),
                    payment_method=data.get('payment_method', 'credit_card'),
                    order_type='pos',
                    customer_name=data.get('customer_name', ''),
                    customer_phone=data.get('customer_phone', ''),
                    customer_email=data.get('customer_email', '')
                )
                
                # Create Order Items and Update Stock
                for item in items_to_create:
                    OrderItem.objects.create(
                        order=order,
                        product=item['product'],
                        quantity=item['quantity'],
                        price=item['price'],
                        size=item.get('size', ''),
                        color=item.get('color', ''),
                    )
                    
                    # Update stock
                    item['product'].stock -= item['quantity']
                    item['product'].save()
                    from core.models import record_stock_change
                    record_stock_change(item['product'], -item['quantity'], 'order', f'Order #{order.id}')
                    
                    # Log event
                    ProductEvent.objects.create(
                        product=item['product'],
                        event_type='purchase',
                        country='POS' 
                    )
                
                return Response({
                    'message': 'Order created successfully',
                    'order_id': order.id,
                    'total_amount': total_amount
                }, status=status.HTTP_201_CREATED)
                
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
