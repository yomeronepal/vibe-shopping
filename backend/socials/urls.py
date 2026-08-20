from django.urls import path

from socials.views import (
    ConnectUrlView,
    OAuthCallbackView,
    PageListView,
    PageConnectView,
    PageDisconnectView,
    PageProfileImportView,
    InstagramConnectUrlView,
    InstagramOAuthCallbackView,
    PostDetailView,
    PostRetryView,
    PublishPostView,
)

urlpatterns = [
    path('posts/', PublishPostView.as_view(), name='socials_publish_post'),
    path('posts/<int:post_id>/', PostDetailView.as_view(), name='socials_post_detail'),
    path('posts/<int:post_id>/retry/', PostRetryView.as_view(), name='socials_post_retry'),
    path('connect-url/', ConnectUrlView.as_view(), name='socials_connect_url'),
    path('instagram/connect-url/', InstagramConnectUrlView.as_view(), name='socials_instagram_connect_url'),
    path('instagram/oauth/callback/', InstagramOAuthCallbackView.as_view(), name='socials_instagram_oauth_callback'),
    path('oauth/callback/', OAuthCallbackView.as_view(), name='socials_oauth_callback'),
    path('pages/', PageListView.as_view(), name='socials_pages'),
    path('pages/<str:page_id>/connect/', PageConnectView.as_view(), name='socials_page_connect'),
    path('pages/import-profile/', PageProfileImportView.as_view(), name='socials_page_import_profile'),
    path('pages/<str:page_id>/disconnect/', PageDisconnectView.as_view(), name='socials_page_disconnect'),
]
