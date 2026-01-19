import React, { useState, useEffect } from 'react';
import { useShopTheme, type ShopTheme } from '../../contexts/ShopThemeContext';
import toast from 'react-hot-toast';

interface ThemePickerProps {
    isOpen: boolean;
    onClose: () => void;
}

const ThemePicker: React.FC<ThemePickerProps> = ({ isOpen, onClose }) => {
    const { theme: currentTheme, setTheme, allThemes } = useShopTheme();
    const [selectedTheme, setSelectedTheme] = useState<ShopTheme>(currentTheme);

    useEffect(() => {
        if (isOpen) {
            setSelectedTheme(currentTheme);
        }
    }, [isOpen, currentTheme]);

    if (!isOpen) return null;

    const themeOptions: Array<{ id: ShopTheme; icon: string }> = [
        { id: 'neon-vibe', icon: 'electric_bolt' },
        { id: 'minimal', icon: 'minimize' },
        { id: 'warm-cozy', icon: 'local_fire_department' },
        { id: 'ai-generated', icon: 'auto_awesome' },
    ];

    const handleApply = () => {
        console.log('=== THEME CHANGE DEBUG ===');
        console.log('Selected theme:', selectedTheme);
        console.log('Current theme before:', currentTheme);
        console.log('All themes available:', Object.keys(allThemes));
        console.log('Theme config for selected:', allThemes[selectedTheme]);

        setTheme(selectedTheme);

        console.log('setTheme called');
        toast.success(`Theme changed to ${allThemes[selectedTheme].name}!`);

        setTimeout(() => {
            console.log('Current theme after (1s delay):', currentTheme);
            console.log('=== END DEBUG ===');
        }, 1000);

        onClose();
    };

    return (
        <>
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                style={{ zIndex: 10000 }}
                onClick={onClose}
            />
            <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none" style={{ zIndex: 10001 }}>
                <div
                    className="w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden pointer-events-auto animate-pop-in"
                    style={{ backgroundColor: allThemes[selectedTheme].surface }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        className="px-8 py-6 border-b flex items-center justify-between"
                        style={{ borderColor: allThemes[selectedTheme].border }}
                    >
                        <div>
                            <h2 className="text-2xl font-black tracking-tight" style={{ color: allThemes[selectedTheme].text }}>
                                Choose Your Theme
                            </h2>
                            <p className="text-sm mt-1" style={{ color: allThemes[selectedTheme].textSecondary }}>
                                Select a visual style for your shop experience
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-xl transition-all hover:scale-110 flex items-center justify-center"
                            style={{ backgroundColor: `${allThemes[selectedTheme].primary}10`, color: allThemes[selectedTheme].primary }}
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {themeOptions.map((option) => {
                                const themeConfig = allThemes[option.id];
                                const isSelected = selectedTheme === option.id;
                                const isCurrent = currentTheme === option.id;

                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => setSelectedTheme(option.id)}
                                        className="relative group rounded-2xl overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{
                                            border: `3px solid ${isSelected ? themeConfig.primary : themeConfig.border}`,
                                            backgroundColor: themeConfig.cardBg
                                        }}
                                    >
                                        {isCurrent && (
                                            <div
                                                className="absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider z-10"
                                                style={{
                                                    backgroundColor: themeConfig.primary,
                                                    color: themeConfig.buttonText
                                                }}
                                            >
                                                Current
                                            </div>
                                        )}

                                        <div
                                            className="p-6 pb-4"
                                            style={{ background: `linear-gradient(135deg, ${themeConfig.background}, ${themeConfig.surface})` }}
                                        >
                                            <div
                                                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
                                                style={{ background: themeConfig.gradient }}
                                            >
                                                <span className="material-symbols-outlined text-4xl" style={{ color: themeConfig.buttonText }}>
                                                    {option.icon}
                                                </span>
                                            </div>

                                            <h3 className="text-xl font-black mb-1" style={{ color: themeConfig.text }}>
                                                {themeConfig.name}
                                            </h3>
                                            <p className="text-sm mb-4" style={{ color: themeConfig.textSecondary }}>
                                                {themeConfig.description}
                                            </p>

                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-8 h-8 rounded-lg shadow-sm border"
                                                        style={{ backgroundColor: themeConfig.primary, borderColor: themeConfig.border }}
                                                    />
                                                    <div
                                                        className="w-8 h-8 rounded-lg shadow-sm border"
                                                        style={{ backgroundColor: themeConfig.accent, borderColor: themeConfig.border }}
                                                    />
                                                    <div
                                                        className="w-8 h-8 rounded-lg shadow-sm border"
                                                        style={{ backgroundColor: themeConfig.background, borderColor: themeConfig.border }}
                                                    />
                                                    <div
                                                        className="w-8 h-8 rounded-lg shadow-sm border"
                                                        style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border }}
                                                    />
                                                    <div
                                                        className="w-8 h-8 rounded-lg shadow-sm border"
                                                        style={{ backgroundColor: themeConfig.text, borderColor: themeConfig.border }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="px-6 pb-6 pt-2">
                                            <div
                                                className="rounded-xl p-4 border space-y-2"
                                                style={{
                                                    backgroundColor: themeConfig.background,
                                                    borderColor: themeConfig.border
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-6 h-6 rounded-full"
                                                        style={{ backgroundColor: themeConfig.primary }}
                                                    />
                                                    <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: themeConfig.border }} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-4 h-4 rounded"
                                                        style={{ backgroundColor: themeConfig.accent }}
                                                    />
                                                    <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: themeConfig.border }} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-5 h-5 rounded"
                                                        style={{ backgroundColor: themeConfig.textSecondary }}
                                                    />
                                                    <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: themeConfig.border }} />
                                                </div>
                                            </div>
                                        </div>

                                        {isSelected && (
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    boxShadow: `inset 0 0 0 3px ${themeConfig.primary}`,
                                                    borderRadius: '1rem'
                                                }}
                                            >
                                                <div
                                                    className="absolute -top-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                                                    style={{ backgroundColor: themeConfig.primary, color: themeConfig.buttonText }}
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">check</span>
                                                </div>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div
                        className="px-8 py-6 border-t flex items-center justify-between"
                        style={{ borderColor: allThemes[selectedTheme].border, backgroundColor: allThemes[selectedTheme].background }}
                    >
                        <div className="flex items-center gap-2" style={{ color: allThemes[selectedTheme].textSecondary }}>
                            <span className="material-symbols-outlined text-[18px]">info</span>
                            <span className="text-sm font-medium">Theme applies instantly across all pages</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                                style={{
                                    backgroundColor: allThemes[selectedTheme].surface,
                                    color: allThemes[selectedTheme].text,
                                    border: `2px solid ${allThemes[selectedTheme].border}`
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApply}
                                className="px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center gap-2"
                                style={{
                                    backgroundColor: allThemes[selectedTheme].buttonBg,
                                    color: allThemes[selectedTheme].buttonText,
                                    boxShadow: `0 10px 30px -10px ${allThemes[selectedTheme].primary}60`
                                }}
                            >
                                <span>Apply Theme</span>
                                <span className="material-symbols-outlined text-[18px]">check</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ThemePicker;
