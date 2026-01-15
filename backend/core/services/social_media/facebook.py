"""
Facebook Pages API integration service.
"""
import requests
from typing import Dict, Any
from django.conf import settings
from .base import BaseSocialMediaService
import logging

logger = logging.getLogger(__name__)


class FacebookService(BaseSocialMediaService):
    """
    Facebook Graph API integration for posting to Facebook Pages.
    """
    
    API_VERSION = 'v18.0'
    GRAPH_URL = f'https://graph.facebook.com/{API_VERSION}'
    
    def __init__(self, access_token: str = None):
        super().__init__(access_token)
        self.app_id = getattr(settings, 'FACEBOOK_APP_ID', getattr(settings, 'INSTAGRAM_APP_ID', ''))
        self.app_secret = getattr(settings, 'FACEBOOK_APP_SECRET', getattr(settings, 'INSTAGRAM_APP_SECRET', ''))

    
    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """Generate Facebook OAuth URL."""
        auth_url = "https://www.facebook.com/v18.0/dialog/oauth"
        params = {
            'client_id': self.app_id,
            'redirect_uri': redirect_uri,
            'state': state,
            'scope': 'pages_manage_posts,pages_read_engagement',
        }
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        return f"{auth_url}?{query_string}"
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Exchange code for access token (same as Instagram)."""
        try:
            token_url = f"{self.GRAPH_URL}/oauth/access_token"
            response = requests.get(token_url, params={
                'client_id': self.app_id,
                'client_secret': self.app_secret,
                'redirect_uri': redirect_uri,
                'code': code,
            })
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Facebook token exchange failed: {e}")
            return {'error': str(e)}
    
    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """Refresh token."""
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
            return {'error': str(e)}
    
    def revoke_token(self) -> bool:
        """Revoke access token."""
        try:
            url = f"{self.GRAPH_URL}/me/permissions"
            response = requests.delete(url, params={'access_token': self.access_token})
            return response.status_code == 200
        except:
            return False
    
    def get_account_info(self) -> Dict[str, Any]:
        """Get Facebook page info."""
        try:
            url = f"{self.GRAPH_URL}/me/accounts"
            response = requests.get(url, params={
                'access_token': self.access_token,
                'fields': 'name,id,picture'
            })
            response.raise_for_status()
            pages = response.json().get('data', [])
            
            if pages:
                page = pages[0]  # Use first page
                return {
                    'username': page['name'],
                    'id': page['id'],
                    'profile_picture': page.get('picture', {}).get('data', {}).get('url')
                }
            return {'error': 'No Facebook pages found'}
        except requests.RequestException as e:
            return {'error': str(e)}
    
    def post_product(self, image_url: str, caption: str, page_id: str = None, **kwargs) -> Dict[str, Any]:
        """Post to Facebook Page."""
        try:
            if not page_id:
                account_info = self.get_account_info()
                if 'error' in account_info:
                    return account_info
                page_id = account_info['id']
            
            url = f"{self.GRAPH_URL}/{page_id}/photos"
            response = requests.post(url, data={
                'url': image_url,
                'caption': caption,
                'access_token': self.access_token,
            })
            response.raise_for_status()
            post_id = response.json().get('id')
            
            return {
                'success': True,
                'post_id': post_id,
                'post_url': f"https://www.facebook.com/{page_id}/posts/{post_id}",
            }
        except requests.RequestException as e:
            logger.error(f"Facebook posting failed: {e}")
            return {'success': False, 'error': str(e)}
