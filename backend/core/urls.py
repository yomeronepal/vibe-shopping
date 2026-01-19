from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import health_check, generate_product_details, list_gemini_models, PublicProductViewSet, OrderViewSet, vendor_login, vendor_logout

router = DefaultRouter()
router.register(r'public/products', PublicProductViewSet, basename='public-product')
router.register(r'orders', OrderViewSet, basename='order')

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('gemini/models/', list_gemini_models, name='list_gemini_models'),
    path('products/generate-details/', generate_product_details, name='generate_product_details'),
    path('auth/login/', vendor_login, name='vendor_login'),
    path('auth/logout/', vendor_logout, name='vendor_logout'),
    path('', include(router.urls)),
]
