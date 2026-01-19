"""
Shop theme configurations for vendor storefronts.
Mirrors the frontend ShopThemeContext definitions.
"""

SHOP_THEMES = {
    'neon-vibe': {
        'id': 'neon-vibe',
        'name': 'Neon Vibe',
        'description': 'High contrast, bold typography',
        'colors': {
            'primary': '#8A2BE2',
            'accent': '#a855f7',
            'background': '#f5f3f8',
            'surface': '#ffffff',
            'text': '#1a1a2e',
            'textSecondary': '#6b7280',
            'border': '#e5e7eb',
            'cardBg': '#ffffff',
            'buttonBg': '#8A2BE2',
            'buttonText': '#ffffff',
        },
        'gradient': 'linear-gradient(135deg, #8A2BE2 0%, #a855f7 100%)',
        'textGradient': 'linear-gradient(135deg, #8A2BE2, #E040FB)',
        'keywords': ['purple', 'violet', 'neon', 'bold', 'vibrant', 'energetic', 'modern'],
    },
    'minimal': {
        'id': 'minimal',
        'name': 'Minimalist',
        'description': 'Clean whitespace focus',
        'colors': {
            'primary': '#0f172a',
            'accent': '#64748b',
            'background': '#ffffff',
            'surface': '#f8fafc',
            'text': '#0f172a',
            'textSecondary': '#64748b',
            'border': '#e2e8f0',
            'cardBg': '#ffffff',
            'buttonBg': '#0f172a',
            'buttonText': '#ffffff',
        },
        'gradient': 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
        'textGradient': 'linear-gradient(135deg, #3b82f6, #06b6d4)',
        'keywords': ['black', 'white', 'gray', 'minimal', 'clean', 'simple', 'professional', 'monochrome'],
    },
    'warm-cozy': {
        'id': 'warm-cozy',
        'name': 'Warm & Cozy',
        'description': 'Soft palette, rounded corners',
        'colors': {
            'primary': '#d97706',
            'accent': '#f59e0b',
            'background': '#fffbeb',
            'surface': '#fefce8',
            'text': '#451a03',
            'textSecondary': '#92400e',
            'border': '#fde68a',
            'cardBg': '#ffffff',
            'buttonBg': '#d97706',
            'buttonText': '#ffffff',
        },
        'gradient': 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
        'textGradient': 'linear-gradient(135deg, #ea580c, #f97316)',
        'keywords': ['orange', 'amber', 'yellow', 'warm', 'cozy', 'friendly', 'earthy', 'natural'],
    },
}


def get_all_themes():
    """Return list of all available themes."""
    return list(SHOP_THEMES.values())


def get_theme(theme_id: str):
    """Get theme by ID."""
    return SHOP_THEMES.get(theme_id)


def get_theme_keywords():
    """Get all theme keywords for matching."""
    return {
        theme_id: theme['keywords']
        for theme_id, theme in SHOP_THEMES.items()
    }
