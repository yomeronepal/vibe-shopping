from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import health_check, generate_product_details, list_gemini_models, PublicProductViewSet, OrderViewSet

router = DefaultRouter()
router.register(r'public/products', PublicProductViewSet, basename='public-product')
router.register(r'orders', OrderViewSet, basename='order')

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('gemini/models/', list_gemini_models, name='list_gemini_models'),
    path('products/generate-details/', generate_product_details, name='generate_product_details'),
    path('', include(router.urls)),
]
