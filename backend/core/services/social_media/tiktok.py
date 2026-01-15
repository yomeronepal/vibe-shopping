"""
TikTok API integration service.
"""
import requests
from typing import Dict, Any
from django.conf import settings
from .base import BaseSocialMediaService
import logging

logger = logging.getLogger(__name__)


class TikTokService(BaseSocialMediaService):
    """
    TikTok Content Posting API integration.
    """
    
    AUTH_URL = 'https://www.tiktok.com/auth/authorize/'
    API_URL = 'https://open-api.tiktok.com'
    
    def __init__(self, access_token: str = None):
        super().__init__(access_token)
        self.client_key = getattr(settings, 'TIKTOK_CLIENT_KEY', '')
        self.client_secret = getattr(settings, 'TIKTOK_CLIENT_SECRET', '')
    
    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """Generate TikTok OAuth URL."""
        params = {
            'client_key': self.client_key,
            'redirect_uri': redirect_uri,
            'state': state,
            'scope': 'user.info.basic,video.upload',
            'response_type': 'code',
        }
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        return f"{self.AUTH_URL}?{query_string}"
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Exchange code for access token."""
        try:
            url = f"{self.API_URL}/oauth/access_token/"
            response = requests.post(url, json={
                'client_key': self.client_key,
                'client_secret': self.client_secret,
                'code': code,
                'grant_type': 'authorization_code',
                'redirect_uri': redirect_uri,
            })
            response.raise_for_status()
            data = response.json().get('data', {})
            return {
                'access_token': data.get('access_token'),
                'refresh_token': data.get('refresh_token'),
                'expires_in': data.get('expires_in', 86400),
            }
        except requests.RequestException as e:
            logger.error(f"TikTok token exchange failed: {e}")
            return {'error': str(e)}
    
    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """Refresh access token."""
        try:
            url = f"{self.API_URL}/oauth/refresh_token/"
            response = requests.post(url, json={
                'client_key': self.client_key,
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
            })
            response.raise_for_status()
            return response.json().get('data', {})
        except requests.RequestException as e:
            return {'error': str(e)}
    
    def revoke_token(self) -> bool:
        """Revoke access token."""
        try:
            url = f"{self.API_URL}/oauth/revoke/"
            response = requests.post(url, json={
                'client_key': self.client_key,
                'access_token': self.access_token,
            })
            return response.status_code == 200
        except:
            return False
    
    def get_account_info(self) -> Dict[str, Any]:
        """Get TikTok user info."""
        try:
            url = f"{self.API_URL}/user/info/"
            response = requests.get(url, params={
                'access_token': self.access_token,
                'fields': 'open_id,union_id,avatar_url,display_name'
            })
            response.raise_for_status()
            data = response.json().get('data', {}).get('user', {})
            return {
                'username': data.get('display_name'),
                'id': data.get('open_id'),
                'profile_picture': data.get('avatar_url'),
            }
        except requests.RequestException as e:
            return {'error': str(e)}
    
    def post_product(self, image_url: str, caption: str, **kwargs) -> Dict[str, Any]:
        """
        Post to TikTok. Note: TikTok requires video upload, not just images.
        This is a placeholder - actual implementation would need video creation.
        """
        logger.warning("TikTok posting requires video format - not yet implemented")
        return {
            'success': False,
            'error': 'TikTok posting requires video creation - coming soon!'
        }
