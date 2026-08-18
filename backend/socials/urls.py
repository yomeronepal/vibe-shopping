from django.urls import path

from socials.views import (
    ConnectUrlView,
    OAuthCallbackView,
    PageListView,
    PageConnectView,
    PageDisconnectView,
)

urlpatterns = [
    path('connect-url/', ConnectUrlView.as_view(), name='socials_connect_url'),
    path('oauth/callback/', OAuthCallbackView.as_view(), name='socials_oauth_callback'),
    path('pages/', PageListView.as_view(), name='socials_pages'),
    path('pages/<str:page_id>/connect/', PageConnectView.as_view(), name='socials_page_connect'),
    path('pages/<str:page_id>/disconnect/', PageDisconnectView.as_view(), name='socials_page_disconnect'),
]
