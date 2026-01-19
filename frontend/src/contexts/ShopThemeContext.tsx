import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ShopTheme = 'neon-vibe' | 'minimal' | 'warm-cozy' | 'ai-generated';

export interface ThemeConfig {
    name: string;
    description: string;
    primary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    cardBg: string;
    buttonBg: string;
    buttonText: string;
    gradient: string;
    textGradient: string;
}

const themeConfigs: Record<ShopTheme, ThemeConfig> = {
    'neon-vibe': {
        name: 'Neon Vibe',
        description: 'High contrast, bold typography',
        primary: '#8A2BE2',
        accent: '#a855f7',
        background: '#f5f3f8',
        surface: '#ffffff',
        text: '#1a1a2e',
        textSecondary: '#6b7280',
        border: '#e5e7eb',
        cardBg: '#ffffff',
        buttonBg: '#8A2BE2',
        buttonText: '#ffffff',
        gradient: 'linear-gradient(135deg, #8A2BE2 0%, #a855f7 100%)',
        textGradient: 'linear-gradient(135deg, #8A2BE2, #E040FB)',
    },
    'minimal': {
        name: 'Minimalist',
        description: 'Clean whitespace focus',
        primary: '#0f172a',
        accent: '#64748b',
        background: '#ffffff',
        surface: '#f8fafc',
        text: '#0f172a',
        textSecondary: '#64748b',
        border: '#e2e8f0',
        cardBg: '#ffffff',
        buttonBg: '#0f172a',
        buttonText: '#ffffff',
        gradient: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
        textGradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)', // Blue-cyan for visibility
    },
    'warm-cozy': {
        name: 'Warm & Cozy',
        description: 'Soft palette, rounded corners',
        primary: '#d97706',
        accent: '#f59e0b',
        background: '#fffbeb',
        surface: '#fefce8',
        text: '#451a03',
        textSecondary: '#92400e',
        border: '#fde68a',
        cardBg: '#ffffff',
        buttonBg: '#d97706',
        buttonText: '#ffffff',
        gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
        textGradient: 'linear-gradient(135deg, #ea580c, #f97316)',
    },
    'ai-generated': {
        name: 'AI Generated',
        description: 'Custom theme from your logo',
        primary: '#6366f1',
        accent: '#8b5cf6',
        background: '#faf5ff',
        surface: '#f5f3ff',
        text: '#1e1b4b',
        textSecondary: '#6b7280',
        border: '#e5e7eb',
        cardBg: '#ffffff',
        buttonBg: '#6366f1',
        buttonText: '#ffffff',
        gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        textGradient: 'linear-gradient(135deg, #6366f1, #a855f7)'
    },
};

interface ShopThemeContextType {
    theme: ShopTheme;
    setTheme: (theme: ShopTheme) => void;
    config: ThemeConfig;
    allThemes: typeof themeConfigs;
    setAiThemeConfig: (config: Partial<ThemeConfig>) => void;
}

const ShopThemeContext = createContext<ShopThemeContextType | undefined>(undefined);

export const ShopThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<ShopTheme>(() => {
        const saved = localStorage.getItem('shop-theme');
        return (saved as ShopTheme) || 'neon-vibe';
    });

    const [customThemes, setCustomThemes] = useState<Record<ShopTheme, ThemeConfig>>(() => {
        const savedAiTheme = localStorage.getItem('ai-theme-config');
        if (savedAiTheme) {
            try {
                const aiTheme = JSON.parse(savedAiTheme);
                console.log('Loaded AI theme from localStorage:', aiTheme);
                return {
                    ...themeConfigs,
                    'ai-generated': aiTheme
                };
            } catch (e) {
                console.error('Failed to parse saved AI theme:', e);
            }
        }
        return themeConfigs;
    });

    const setTheme = (newTheme: ShopTheme) => {
        setThemeState(newTheme);
        localStorage.setItem('shop-theme', newTheme);
    };

    const setAiThemeConfig = (config: Partial<ThemeConfig>) => {
        const updatedAiTheme = {
            ...customThemes['ai-generated'],
            ...config
        };
        console.log('Updating AI theme config:', updatedAiTheme);

        setCustomThemes(prev => {
            const newThemes = {
                ...prev,
                'ai-generated': updatedAiTheme
            };

            localStorage.setItem('ai-theme-config', JSON.stringify(updatedAiTheme));

            return newThemes;
        });
    };

    useEffect(() => {
        const config = customThemes[theme];
        const root = document.documentElement;

        root.style.setProperty('--shop-primary', config.primary);
        root.style.setProperty('--shop-accent', config.accent);
        root.style.setProperty('--shop-background', config.background);
        root.style.setProperty('--shop-surface', config.surface);
        root.style.setProperty('--shop-text', config.text);
        root.style.setProperty('--shop-text-secondary', config.textSecondary);
        root.style.setProperty('--shop-border', config.border);
        root.style.setProperty('--shop-card-bg', config.cardBg);
        root.style.setProperty('--shop-button-bg', config.buttonBg);
        root.style.setProperty('--shop-button-text', config.buttonText);
        root.style.setProperty('--shop-gradient', config.gradient);

        document.body.classList.remove('theme-neon-vibe', 'theme-minimal', 'theme-warm-cozy', 'theme-ai-generated');
        document.body.classList.add(`theme-${theme}`);
    }, [theme, customThemes]);

    return (
        <ShopThemeContext.Provider value={{
            theme,
            setTheme,
            config: customThemes[theme],
            allThemes: customThemes,
            setAiThemeConfig
        }}>
            {children}
        </ShopThemeContext.Provider>
    );
};

export const useShopTheme = () => {
    const context = useContext(ShopThemeContext);
    if (!context) {
        throw new Error('useShopTheme must be used within a ShopThemeProvider');
    }
    return context;
};

export { themeConfigs };
