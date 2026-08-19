
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VendorSignupView, ProductViewSet, AnalyticsViewSet, TenantViewSet, 
    DraftProductView, POSOrderViewSet, OnboardingViewSet, ThemeViewSet, LogoAnalysisView
)

router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='vendor-product')
router.register(r'orders/pos', POSOrderViewSet, basename='vendor-pos-order')
router.register(r'analytics', AnalyticsViewSet, basename='vendor-analytics')
router.register(r'tenant', TenantViewSet, basename='vendor-tenant')
router.register(r'onboarding', OnboardingViewSet, basename='vendor-onboarding')
router.register(r'themes', ThemeViewSet, basename='vendor-themes')

from vendor.order_views import VendorOrderDetailView, VendorOrderInvoiceSendView, VendorOrderListView
from vendor.product_analytics_views import ProductAnalyticsView

urlpatterns = [
    path('products/<int:product_id>/analytics/', ProductAnalyticsView.as_view(), name='vendor-product-analytics'),
    path('orders/', VendorOrderListView.as_view(), name='vendor-orders'),
    path('orders/<int:order_id>/', VendorOrderDetailView.as_view(), name='vendor-order-detail'),
    path('orders/<int:order_id>/send-invoice/', VendorOrderInvoiceSendView.as_view(), name='vendor-order-send-invoice'),
    path('signup/', VendorSignupView.as_view(), name='vendor-signup'),
    path('products/draft/', DraftProductView.as_view(), name='product-draft'),
    path('onboarding/analyze-logo/', LogoAnalysisView.as_view(), name='analyze-logo'),
    path('', include(router.urls)),
]
