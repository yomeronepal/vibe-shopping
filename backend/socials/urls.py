from django.urls import path

from socials.views import ConnectUrlView, OAuthCallbackView

urlpatterns = [
    path('connect-url/', ConnectUrlView.as_view(), name='socials_connect_url'),
    path('oauth/callback/', OAuthCallbackView.as_view(), name='socials_oauth_callback'),
]
