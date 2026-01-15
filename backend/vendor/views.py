
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

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class ProductViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vendors to manage products.
    """
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

        from core.tasks import detect_vibe
        # Re-run analysis (which now includes Romanized Nepali prompt)
        detect_vibe.delay(product.id)
        
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

    def perform_create(self, serializer):
        """
        # Automatically assign the product to the current user's tenant
        # and trigger AI processing.
        """
        from core.tasks import detect_vibe
        
        tenant = self.request.user.vendor_profile.tenant
        product = serializer.save(tenant=tenant)
        
        # Trigger Async AI Task
        if product.image:
             detect_vibe.delay(product.id)

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
