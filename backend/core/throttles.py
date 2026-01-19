from rest_framework.throttling import UserRateThrottle

class AIAnalysisThrottle(UserRateThrottle):
    scope = 'ai_analysis'

class LogoAnalysisThrottle(UserRateThrottle):
    scope = 'logo_analysis'
