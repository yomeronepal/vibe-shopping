from rest_framework import viewsets, status, generics
from rest_framework.decorators import api_view, permission_classes, action, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.db import transaction
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from .models import Product, Tenant, VendorProfile, Order, OrderItem, EscrowLedger, Wallet, ProductEvent
from .serializers import ProductSerializer, ProductCreateSerializer, VendorSignupSerializer, BusinessProfileSerializer
from .throttles import AIAnalysisThrottle

# Create your views here.

@api_view(['GET'])
def health_check(request):
    """Health check endpoint"""
    return Response({
        'status': 'healthy',
        'message': 'Vibe Shopping API is running'
    })

@api_view(['POST'])
@permission_classes([AllowAny])
def vendor_login(request):
    """
    Custom login endpoint that returns token and onboarding status
    """
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'error': 'Username and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = authenticate(username=username, password=password)

    if not user:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    token, _ = Token.objects.get_or_create(user=user)

    is_onboarding_complete = False
    tenant_id = None

    if hasattr(user, 'vendor_profile'):
        tenant = user.vendor_profile.tenant
        tenant_id = tenant.id
        metadata = tenant.metadata or {}
        onboarding = metadata.get('onboarding', {})
        is_onboarding_complete = onboarding.get('is_complete', False)

    return Response({
        'token': token.key,
        'user_id': user.id,
        'username': user.username,
        'tenant_id': tenant_id,
        'is_onboarding_complete': is_onboarding_complete
    })





    
    




@api_view(['POST'])
@permission_classes([IsAuthenticated])
def vendor_logout(request):
    """
    Logout endpoint that deletes the user's auth token
    """
    try:
        request.user.auth_token.delete()
        return Response({'message': 'Successfully logged out'}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def get_request_tenant(request):
    """Return the tenant for the authenticated user or None."""
    profile = getattr(request.user, 'vendor_profile', None)
    return profile.tenant if profile else None


class BusinessProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the authenticated user's business profile."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(BusinessProfileSerializer(tenant).data)

    def patch(self, request):
        """Update editable business profile fields."""
        tenant = get_request_tenant(request)
        if not tenant:
            return Response({'error': 'No business found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = BusinessProfileSerializer(tenant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

@api_view(['GET'])
def list_gemini_models(request):
    """
    Debug endpoint to list available Gemini models using google-genai SDK
    """
    try:
        from google import genai
        from django.conf import settings
        
        api_key = settings.GOOGLE_AI_API_KEY
        if not api_key:
            return Response(
                {'error': 'GOOGLE_AI_API_KEY not configured'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        client = genai.Client(api_key=api_key)
        
        # List all available models
        # access .models.list() 
        # The new SDK iterator returns objects with .name, .display_name etc.
        models = []
        for model in client.models.list():
            # Check if generateContent is supported (logic may vary in new SDK, listing all for now)
            models.append({
                'name': model.name,
                'display_name': getattr(model, 'display_name', 'N/A'),
                'description': getattr(model, 'description', ''),
                'supported_actions': getattr(model, 'supported_actions', [])
            })
        
        return Response({
            'available_models': models,
            'count': len(models)
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@throttle_classes([AIAnalysisThrottle])
def generate_product_details_from_text(request):
    """Generate product details from the vendor's written description.

    Request data:
        brief: What the vendor wrote about the product (required).
        price: Product price (optional).

    Returns the same JSON structure as image-based generation.
    """
    brief = (request.data.get('brief') or '').strip()
    if len(brief) < 10:
        return Response(
            {'error': 'Describe the product in a sentence or two first.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    price = request.data.get('price')

    from .services.gemini_service import GeminiProductAnalyzer
    from .utils.ai_tracker import track_ai_usage, estimate_text_tokens

    tenant = None
    if hasattr(request.user, 'vendor_profile'):
        tenant = request.user.vendor_profile.tenant

    try:
        analyzer = GeminiProductAnalyzer()
        result = analyzer.generate_from_brief(brief, price=float(price) if price else None)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if not result.get('success'):
        return Response(
            {'error': result.get('error', 'Generation failed. Try again.')},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    track_ai_usage(
        tenant=tenant,
        ai_provider=result.get('ai_provider', 'gemini'),
        operation_type='product_brief',
        input_tokens=estimate_text_tokens(brief),
        output_tokens=estimate_text_tokens(str(result['data'])),
        success=True,
        user=request.user if request.user.is_authenticated else None,
        metadata={'price': price},
    )
    return Response(result['data'], status=status.HTTP_200_OK)


@api_view(['POST'])
@throttle_classes([AIAnalysisThrottle])
def generate_social_caption(request):
    """Generate a social-media caption for a product or free-form topic.

    Request data:
        product_id: Generate from this product's details (optional).
        context: Free-form topic text when no product is given.
        platform: Optional platform hint ('facebook' or 'instagram').
    """
    tenant = None
    if hasattr(request.user, 'vendor_profile'):
        tenant = request.user.vendor_profile.tenant

    context = (request.data.get('context') or '').strip()
    product_id = request.data.get('product_id')
    if product_id and tenant:
        product = Product.objects.filter(tenant=tenant, id=product_id).first()
        if product is None:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        parts = [f'Product: {product.name}', f'Price: Rs. {product.price}']
        if product.description:
            parts.append(f'Details: {product.description[:400]}')
        if product.tags:
            parts.append(f"Tags: {', '.join(product.tags[:10])}")
        context = '\n'.join(parts)
    if len(context) < 5:
        return Response(
            {'error': 'Pick a product or write a few words about the post first.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from .services.gemini_service import GeminiProductAnalyzer
    from .utils.ai_tracker import track_ai_usage, estimate_text_tokens

    brand_parts = []
    if tenant:
        metadata = tenant.metadata or {}
        brand_parts.append(f'Store: {tenant.name}')
        if metadata.get('bio'):
            brand_parts.append(f"About: {metadata['bio'][:200]}")
        if metadata.get('brandVibe'):
            brand_parts.append(f"Vibes: {', '.join(metadata['brandVibe'][:6])}")

    try:
        analyzer = GeminiProductAnalyzer()
        result = analyzer.generate_caption(
            context,
            platform=request.data.get('platform', ''),
            content_type=request.data.get('content_type', 'caption'),
            tone=request.data.get('tone', ''),
            language=request.data.get('language', ''),
            brand='\n'.join(brand_parts),
        )
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if not result.get('success'):
        return Response(
            {'error': result.get('error', 'Caption generation failed. Try again.')},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    track_ai_usage(
        tenant=tenant,
        ai_provider=result.get('ai_provider', 'gemini'),
        operation_type='caption',
        input_tokens=estimate_text_tokens(context),
        output_tokens=estimate_text_tokens(result['caption']),
        success=True,
        user=request.user if request.user.is_authenticated else None,
        metadata={'product_id': product_id},
    )
    return Response({'caption': result['caption']}, status=status.HTTP_200_OK)


class PublicProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public ViewSet for customers to view products.
    Filters products based on the subdomain (tenant).
    """
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
             return Product.objects.none()
             
        # request.tenant is set by TenantMiddleware
        tenant = getattr(self.request, 'tenant', None)
        
        if tenant:
            queryset = Product.objects.filter(tenant=tenant)
            
            is_active = self.request.query_params.get('is_active', None)
            if is_active is not None:
                 queryset = queryset.filter(is_active=is_active.lower() == 'true')
            else:
                 # Default to active only for public
                 queryset = queryset.filter(is_active=True)
                 
            return queryset
            
        if self.action == 'retrieve':
            return Product.objects.filter(is_active=True)
        return Product.objects.none()

@api_view(['POST'])
@throttle_classes([AIAnalysisThrottle])
def generate_product_details(request):
    """
    Generate comprehensive product details from uploaded image using Gemini AI
    
    Request data:
    - image: Product image file (required)
    - price: Product price (optional)
    
    Returns JSON with:
    - title, description, tags (20-30), category, subcategory
    - attributes (color, material, style, fit, pattern)
    - target_audience, occasions, season
    - care_instructions, seo_keywords, selling_points
    """
    if 'image' not in request.FILES:
        return Response(
            {'error': 'No image provided'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    image_file = request.FILES['image']
    price = request.data.get('price')  # Changed from getlist to get
    
    # Read image data
    image_data = image_file.read()
    
    from .services.gemini_service import GeminiProductAnalyzer
    from .utils.ai_tracker import track_ai_usage, estimate_image_tokens, estimate_text_tokens

    tenant = None
    if hasattr(request.user, 'vendor_profile'):
        tenant = request.user.vendor_profile.tenant

    try:
        analyzer = GeminiProductAnalyzer()
        result = analyzer.analyze_product_image(
            image_data,
            price=float(price) if price else None
        )

        if result['success']:
            ai_provider = result.get('ai_provider', 'gemini')

            input_tokens = estimate_image_tokens(image_data)
            output_tokens = estimate_text_tokens(str(result['data']))

            if tenant:
                track_ai_usage(
                    tenant=tenant,
                    ai_provider=ai_provider,
                    operation_type='product_analysis',
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    success=True,
                    user=request.user if request.user.is_authenticated else None,
                    metadata={'price': price}
                )

            return Response(result['data'], status=status.HTTP_200_OK)
        else:
            if tenant:
                track_ai_usage(
                    tenant=tenant,
                    ai_provider='gemini',
                    operation_type='product_analysis',
                    success=False,
                    error_message=result['error'],
                    user=request.user if request.user.is_authenticated else None
                )

            return Response(
                {'error': result['error']},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    except ValueError as e:
        return Response(
            {'error': f'Configuration error: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    except Exception as e:
        return Response(
            {'error': f'Unexpected error: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

class OrderViewSet(viewsets.GenericViewSet, generics.RetrieveAPIView):
    """
    ViewSet for Customers to place and view orders.
    """
    # serializer_class handled manually for create
    permission_classes = [IsAuthenticated]
    queryset = Order.objects.all()

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user)

    @action(detail=False, methods=['post'])
    def create_order(self, request):
        """
        Place a new order with Escrow protection (BE-07).
        """
        from .serializers import OrderCreateSerializer
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        items_data = serializer.validated_data['items']
        
        # Must have a tenant resolved
        if not request.tenant:
             return Response({'error': 'No shop context (tenant) found.'}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            with transaction.atomic():
                total_amount = 0
                order_items = []
                
                # Create Order Shell
                order = Order.objects.create(
                    tenant=request.tenant,
                    user=request.user,
                    total_amount=0, # Update later
                    status='pending_delivery', # Assume payment success & funds held
                    payment_method=serializer.validated_data.get('payment_method', 'credit_card')
                )
                
                # Process Items
                for item in items_data:
                    product = Product.objects.get(id=item['product_id'], tenant=request.tenant) # Ensure product belongs to this store
                    if not product.is_active:
                         raise ValueError(f"Product {product.name} is not active.")
                    if product.stock < item['quantity']:
                         raise ValueError(f"Insufficient stock for {product.name}.")
                         
                    product.stock -= item['quantity']
                    product.save()
                    from core.models import record_stock_change
                    record_stock_change(product, -item['quantity'], 'online_order', f'Order #{order.id}')
                    
                    line_total = product.price * item['quantity']
                    total_amount += line_total
                    
                    OrderItem.objects.create(
                        order=order,
                        product=product,
                        quantity=item['quantity'],
                        price=product.price
                    )
                    
                    # Track Analytics (BE-09)
                    ProductEvent.objects.create(
                        product=product,
                        event_type='purchase',
                        country='Unknown' # Geo-IP could go here later
                    )
                
                # Update Order Total
                order.total_amount = total_amount
                order.save()
                
                # Create Escrow Ledger
                EscrowLedger.objects.create(
                    order=order,
                    amount=total_amount,
                    status='held'
                )
                
                # Ensure Vendor Wallet Exists (Idempotent)
                Wallet.objects.get_or_create(tenant=request.tenant)
                
                return Response({
                    'message': 'Order placed successfully. Funds held in escrow.',
                    'order_id': order.id,
                    'total_amount': total_amount,
                    'status': order.status
                }, status=status.HTTP_201_CREATED)
                
        except Product.DoesNotExist:
             return Response({'error': 'Product not found or invalid.'}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
             return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
             return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

