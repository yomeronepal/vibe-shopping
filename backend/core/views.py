from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Product
from .serializers import ProductSerializer

# Create your views here.

@api_view(['GET'])
def health_check(request):
    """Health check endpoint"""
    return Response({
        'status': 'healthy',
        'message': 'Vibe Shopping API is running'
    })


class ProductViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Product model.
    Provides CRUD operations for products.
    """
    queryset = Product.objects.filter(is_active=True)
    serializer_class = ProductSerializer
    
    
    def get_queryset(self):
        """
        Optionally filter products by query parameters.
        """
        queryset = Product.objects.all()
        is_active = self.request.query_params.get('is_active', None)
        
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset


@api_view(['GET'])
def list_gemini_models(request):
    """
    Debug endpoint to list available Gemini models
    """
    try:
        import google.generativeai as genai
        from django.conf import settings
        
        api_key = settings.GOOGLE_AI_API_KEY
        if not api_key:
            return Response(
                {'error': 'GOOGLE_AI_API_KEY not configured'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        genai.configure(api_key=api_key)
        
        # List all available models
        models = []
        for model in genai.list_models():
            if 'generateContent' in model.supported_generation_methods:
                models.append({
                    'name': model.name,
                    'display_name': model.display_name,
                    'description': model.description,
                    'supported_methods': model.supported_generation_methods
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

