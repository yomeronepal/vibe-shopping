from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import health_check, generate_product_details, generate_product_details_from_text, generate_store_bio, privacy_page, data_deletion_page, generate_social_caption, list_gemini_models, PublicProductViewSet, OrderViewSet, vendor_login, vendor_logout, BusinessProfileView

router = DefaultRouter()
router.register(r'public/products', PublicProductViewSet, basename='public-product')
router.register(r'orders', OrderViewSet, basename='order')

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('gemini/models/', list_gemini_models, name='list_gemini_models'),
    path('products/generate-details/', generate_product_details, name='generate_product_details'),
    path('products/generate-details-from-text/', generate_product_details_from_text, name='generate_product_details_from_text'),
    path('store/generate-bio/', generate_store_bio, name='generate_store_bio'),
    path('legal/privacy/', privacy_page, name='legal_privacy'),
    path('legal/data-deletion/', data_deletion_page, name='legal_data_deletion'),
    path('products/generate-caption/', generate_social_caption, name='generate_social_caption'),
    path('auth/login/', vendor_login, name='vendor_login'),
    path('auth/logout/', vendor_logout, name='vendor_logout'),
    path('business/', BusinessProfileView.as_view(), name='business_profile'),
    path('', include(router.urls)),
]
