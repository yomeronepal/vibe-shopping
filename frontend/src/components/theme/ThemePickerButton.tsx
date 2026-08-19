import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useShopTheme } from '../../contexts/ShopThemeContext';
import ThemePicker from './ThemePicker';

const ThemePickerButton: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { config } = useShopTheme();
    const { pathname } = useLocation();

    if (pathname.startsWith('/vendor/inbox') || pathname.includes('/invoice') || pathname === '/privacy' || pathname === '/data-deletion') {
        return null;
    }

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-8 right-8 w-14 h-14 rounded-2xl shadow-2xl backdrop-blur-xl transition-all hover:scale-110 active:scale-95 flex items-center justify-center group border-2"
                style={{
                    backgroundColor: `${config.surface}f0`,
                    borderColor: `${config.border}80`,
                    color: config.primary,
                    zIndex: 9999
                }}
                title="Change Theme"
            >
                <span className="material-symbols-outlined text-[28px] group-hover:rotate-180 transition-transform duration-500">
                    palette
                </span>

                <div
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full animate-pulse"
                    style={{ backgroundColor: config.primary }}
                />
            </button>

            <ThemePicker isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
};

export default ThemePickerButton;
