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
    if (!open) return null;
    const accentColor = danger ? '#dc2626' : themeConfig.primary;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div
                className="relative w-full max-w-sm rounded-2xl shadow-2xl p-6 border"
                style={{ backgroundColor: themeConfig.cardBg, borderColor: `${themeConfig.border}60` }}
            >
                <div
                    className="size-12 rounded-full flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                >
                    <span className="material-symbols-outlined text-2xl">
                        {danger ? 'delete_forever' : 'inventory_2'}
                    </span>
                </div>
                <h3 className="text-lg font-extrabold tracking-tight" style={{ color: themeConfig.text }}>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: themeConfig.textSecondary }}>{message}</p>
                <div className="mt-6 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold border transition-all hover:shadow-sm"
                        style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5"
                        style={{ backgroundColor: accentColor }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
