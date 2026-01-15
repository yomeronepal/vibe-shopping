
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VendorSignupView, ProductViewSet, AnalyticsViewSet

router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='vendor-product')
router.register(r'analytics', AnalyticsViewSet, basename='vendor-analytics')

urlpatterns = [
    path('signup/', VendorSignupView.as_view(), name='vendor-signup'),
    path('', include(router.urls)),
]
