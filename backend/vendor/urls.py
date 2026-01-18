
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VendorSignupView, ProductViewSet, AnalyticsViewSet, TenantViewSet, DraftProductView, POSOrderViewSet

router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='vendor-product')
router.register(r'orders/pos', POSOrderViewSet, basename='vendor-pos-order')
router.register(r'analytics', AnalyticsViewSet, basename='vendor-analytics')
router.register(r'tenant', TenantViewSet, basename='vendor-tenant')

urlpatterns = [
    path('signup/', VendorSignupView.as_view(), name='vendor-signup'),
    path('products/draft/', DraftProductView.as_view(), name='product-draft'),
    path('', include(router.urls)),
]
