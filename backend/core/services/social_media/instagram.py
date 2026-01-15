"""
Instagram Business API integration service.
"""
import requests
from typing import Dict, Any
from django.conf import settings
from .base import BaseSocialMediaService
import logging

logger = logging.getLogger(__name__)


class InstagramService(BaseSocialMediaService):
    """
    Instagram Graph API integration for posting to Instagram Business accounts.
    Requires a connected Facebook Page with Instagram Business account.
    """
    
    API_VERSION = 'v18.0'
    GRAPH_URL = f'https://graph.facebook.com/{API_VERSION}'
    
    def __init__(self, access_token: str = None):
        super().__init__(access_token)
        self.app_id = getattr(settings, 'INSTAGRAM_APP_ID', '')
        self.app_secret = getattr(settings, 'INSTAGRAM_APP_SECRET', '')
    
    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """
        Generate Instagram OAuth URL (via Facebook OAuth).
        """
        auth_url = f"https://www.facebook.com/v18.0/dialog/oauth"
        params = {
            'client_id': self.app_id,
            'redirect_uri': redirect_uri,
            'state': state,
            'scope': 'instagram_basic,instagram_content_publish,pages_read_engagement',
        }
        
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        return f"{auth_url}?{query_string}"
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """
        Exchange code for long-lived access token.
        """
        try:
            # Step 1: Get short-lived token
            token_url = f"{self.GRAPH_URL}/oauth/access_token"
            response = requests.get(token_url, params={
                'client_id': self.app_id,
                'client_secret': self.app_secret,
                'redirect_uri': redirect_uri,
                'code': code,
            })
            response.raise_for_status()
            short_token = response.json()['access_token']
            
            # Step 2: Exchange for long-lived token
            long_token_url = f"{self.GRAPH_URL}/oauth/access_token"
            response = requests.get(long_token_url, params={
                'grant_type': 'fb_exchange_token',
                'client_id': self.app_id,
                'client_secret': self.app_secret,
                'fb_exchange_token': short_token,
            })
            response.raise_for_status()
            data = response.json()
            
            return {
                'access_token': data['access_token'],
                'expires_in': data.get('expires_in', 5184000),  # ~60 days
            }
            
        except requests.RequestException as e:
            logger.error(f"Instagram token exchange failed: {e}")
            return {'error': str(e)}
    
    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh long-lived token (extends expiration).
        """
        try:
            url = f"{self.GRAPH_URL}/oauth/access_token"
            response = requests.get(url, params={
                'grant_type': 'fb_exchange_token',
                'client_id': self.app_id,
                'client_secret': self.app_secret,
                'fb_exchange_token': self.access_token,
            })
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Instagram token refresh failed: {e}")
            return {'error': str(e)}
    
    def revoke_token(self) -> bool:
        """
        Revoke access token.
        """
        try:
            url = f"{self.GRAPH_URL}/me/permissions"
            response = requests.delete(url, params={'access_token': self.access_token})
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Instagram token revocation failed: {e}")
            return False
    
    def get_account_info(self) -> Dict[str, Any]:
        """
        Get Instagram Business account info.
        """
        try:
            # Get Facebook pages
            url = f"{self.GRAPH_URL}/me/accounts"
            response = requests.get(url, params={
                'access_token': self.access_token,
                'fields': 'instagram_business_account,name'
            })
            response.raise_for_status()
            pages = response.json().get('data', [])
            
            # Find page with Instagram account
            for page in pages:
                if 'instagram_business_account' in page:
                    ig_account_id = page['instagram_business_account']['id']
                    
                    # Get Instagram account details
                    ig_url = f"{self.GRAPH_URL}/{ig_account_id}"
                    ig_response = requests.get(ig_url, params={
                        'access_token': self.access_token,
                        'fields': 'username,profile_picture_url'
                    })
                    ig_response.raise_for_status()
                    ig_data = ig_response.json()
                    
                    return {
                        'username': ig_data.get('username'),
                        'id': ig_account_id,
                        'profile_picture': ig_data.get('profile_picture_url'),
                        'page_id': page['id'],
                        'page_name': page['name']
                    }
            
            return {'error': 'No Instagram Business account found'}
            
        except requests.RequestException as e:
            logger.error(f"Failed to get Instagram account info: {e}")
            return {'error': str(e)}
    
    def post_product(
        self,
        image_url: str,
        caption: str,
        instagram_account_id: str = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Post product image to Instagram.
        
        Args:
            image_url: Publicly accessible URL to product image
            caption: Post caption with hashtags
            instagram_account_id: Instagram Business Account ID
        """
        try:
            if not instagram_account_id:
                # Try to get account ID
                account_info = self.get_account_info()
                if 'error' in account_info:
                    return account_info
                instagram_account_id = account_info['id']
            
            # Step 1: Create media container
            container_url = f"{self.GRAPH_URL}/{instagram_account_id}/media"
            container_response = requests.post(container_url, data={
                'image_url': image_url,
                'caption': caption,
                'access_token': self.access_token,
            })
            container_response.raise_for_status()
            container_id = container_response.json().get('id')
            
            if not container_id:
                return {'success': False, 'error': 'Failed to create media container'}
            
            # Step 2: Publish container
            publish_url = f"{self.GRAPH_URL}/{instagram_account_id}/media_publish"
            publish_response = requests.post(publish_url, data={
                'creation_id': container_id,
                'access_token': self.access_token,
            })
            publish_response.raise_for_status()
            post_id = publish_response.json().get('id')
            
            return {
                'success': True,
                'post_id': post_id,
                'post_url': f"https://www.instagram.com/p/{post_id}/",
            }
            
        except requests.RequestException as e:
            logger.error(f"Instagram posting failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
