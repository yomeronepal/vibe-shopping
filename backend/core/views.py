from rest_framework import viewsets, status, generics
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db import transaction
from django.contrib.auth.models import User
from .models import Product, Tenant, VendorProfile, Order, OrderItem, EscrowLedger, Wallet, ProductEvent
from .serializers import ProductSerializer, ProductCreateSerializer, VendorSignupSerializer

# Create your views here.

@api_view(['GET'])
def health_check(request):
    """Health check endpoint"""
    return Response({
        'status': 'healthy',
        'message': 'Vibe Shopping API is running'
    })





    
    




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
            
        return Product.objects.none()  # Or return global marketplace products if applicable

@api_view(['POST'])
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
    
    # Import service here to avoid circular imports
    from .services.gemini_service import GeminiProductAnalyzer
    
    try:
        # Analyze with Gemini AI
        analyzer = GeminiProductAnalyzer()
        result = analyzer.analyze_product_image(
            image_data,
            price=float(price) if price else None
        )
        
        if result['success']:
            return Response(result['data'], status=status.HTTP_200_OK)
        else:
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
                         
                    # Deduct Stock
                    product.stock -= item['quantity']
                    product.save()
                    
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

