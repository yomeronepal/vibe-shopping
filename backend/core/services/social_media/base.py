"""
Base class for social media posting services.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class BaseSocialMediaService(ABC):
    """
    Abstract base class for social media platform integrations.
    """
    
    def __init__(self, access_token: Optional[str] = None):
        self.access_token = access_token
    
    @abstractmethod
    def post_product(
        self,
        image_url: str,
        caption: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Post product to social media platform.
        
        Args:
            image_url: URL to product image
            caption: Post caption/description
            **kwargs: Platform-specific parameters
            
        Returns:
            Dict with:
                - success: bool
                - post_url: str (if successful)
                - post_id: str (if successful)
                - error: str (if failed)
        """
        pass
    
    @abstractmethod
    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """
        Generate OAuth authorization URL.
        
        Args:
            redirect_uri: Callback URL after authorization
            state: CSRF protection token
            
        Returns:
            Authorization URL
        """
        pass
    
    @abstractmethod
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access token.
        
        Args:
            code: Authorization code from OAuth callback
            redirect_uri: Same redirect URI used in auth URL
            
        Returns:
            Dict with:
                - access_token: str
                - expires_in: int
                - user_id: str (optional)
                - username: str (optional)
        """
        pass
    
    @abstractmethod
    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh an expired access token.
        
        Args:
            refresh_token: Refresh token
            
        Returns:
            Dict with new access_token and expires_in
        """
        pass
    
    @abstractmethod
    def revoke_token(self) -> bool:
        """
        Revoke access token (disconnect account).
        
        Returns:
            True if successful, False otherwise
        """
        pass
    
    @abstractmethod
    def get_account_info(self) -> Dict[str, Any]:
        """
        Get connected account information.
        
        Returns:
            Dict with:
                - username: str
                - id: str
                - profile_picture: str (optional)
        """
        pass
