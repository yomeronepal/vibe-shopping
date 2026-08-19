import { useEffect } from 'react';
import { useShopTheme } from '../../contexts/ShopThemeContext';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
    const { config: themeConfig } = useShopTheme();

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    const accentColor = danger ? '#ef4444' : themeConfig.primary;
    const accentDeep = danger ? '#b91c1c' : themeConfig.accent;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
                onClick={onCancel}
            />
            <div
                className="relative w-full max-w-[380px] rounded-[28px] shadow-2xl border overflow-hidden animate-pop-in"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                style={{ backgroundColor: themeConfig.cardBg, borderColor: `${themeConfig.border}50` }}
            >
                <div
                    className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[220px] rounded-full blur-3xl opacity-60"
                    style={{ background: `radial-gradient(circle, ${accentColor}30, transparent 70%)` }}
                />
                <button
                    onClick={onCancel}
                    aria-label="Close"
                    className="absolute top-4 right-4 size-8 rounded-full flex items-center justify-center transition-colors hover:scale-105"
                    style={{ backgroundColor: `${themeConfig.surface}`, color: themeConfig.textSecondary }}
                >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>

                <div className="relative px-7 pt-10 pb-7 text-center">
                    <div
                        className="mx-auto size-[76px] rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${accentColor}12` }}
                    >
                        <div
                            className="size-14 rounded-full flex items-center justify-center text-white shadow-lg"
                            style={{
                                background: `linear-gradient(135deg, ${accentColor}, ${accentDeep})`,
                                boxShadow: `0 12px 28px -10px ${accentColor}90`,
                            }}
                        >
                            <span className="material-symbols-outlined text-[28px]">
                                {danger ? 'delete_forever' : 'inventory_2'}
                            </span>
                        </div>
                    </div>

                    <h3 className="mt-5 text-xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                        {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: themeConfig.textSecondary }}>
                        {message}
                    </p>

                    <div className="mt-7 grid grid-cols-2 gap-3">
                        <button
                            onClick={onCancel}
                            className="py-3 rounded-2xl text-sm font-bold border transition-all hover:shadow-md active:scale-[0.98]"
                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className="py-3 rounded-2xl text-sm font-bold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                            style={{
                                background: `linear-gradient(135deg, ${accentColor}, ${accentDeep})`,
                                boxShadow: `0 10px 24px -8px ${accentColor}80`,
                            }}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
