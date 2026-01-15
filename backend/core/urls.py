from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProductViewSet, health_check, generate_product_details, list_gemini_models

router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='product')

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('ai/generate-product/', generate_product_details, name='generate-product'),
    path('ai/list-models/', list_gemini_models, name='list-models'),
    path('', include(router.urls)),
]
