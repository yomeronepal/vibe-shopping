import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import SettingsTabs from '../components/vendor/SettingsTabs';
import { getStoreProfile, updateAssistantSettings } from '../api/vendor';

const KNOWLEDGE_PLACEHOLDER = `Examples:
Delivery inside Kathmandu valley: Rs. 100, 1-2 days.
Outside valley: Rs. 200, 3-5 days.
Payment: cash on delivery, eSewa, or bank transfer.
Exchange within 7 days with receipt; no cash refunds.`;

export default function VendorAssistantSettingsPage() {
    const { config: themeConfig } = useShopTheme();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(true);
    const [knowledge, setKnowledge] = useState('');

    const primaryColor = themeConfig.primary;

    useEffect(() => {
        getStoreProfile()
            .then((profile) => {
                setEnabled(profile.ai_assistant_enabled);
                setKnowledge(profile.ai_knowledge);
            })
            .catch(() => toast.error('Could not load assistant settings'))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateAssistantSettings(knowledge, enabled);
            toast.success('Assistant settings saved');
        } catch {
            toast.error('Could not save assistant settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-4xl px-4 md:px-6 py-8">
                    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                Settings
                            </h1>
                            <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                                Teach the AI assistant about your business.
                            </p>
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                            style={{ backgroundColor: primaryColor, boxShadow: `0 10px 24px -8px ${primaryColor}70` }}
                        >
                            <span className="material-symbols-outlined text-[20px]">{saving ? 'hourglass_empty' : 'save'}</span>
                            {saving ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>

                    <SettingsTabs />

                    {loading ? (
                        <p className="text-sm" style={{ color: themeConfig.textSecondary }}>Loading assistant settings…</p>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <div className="rounded-3xl shadow-lg p-6 flex items-center justify-between gap-4" style={{ backgroundColor: themeConfig.cardBg }}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <div
                                        className="size-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ background: `linear-gradient(135deg, ${primaryColor}20, ${themeConfig.accent}20)`, color: primaryColor }}
                                    >
                                        <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-lg leading-tight" style={{ color: themeConfig.text }}>AI reply drafts</h3>
                                        <p className="text-xs font-medium mt-0.5" style={{ color: themeConfig.textSecondary }}>
                                            Adds an "AI draft" button to your inbox. Nothing is ever sent without your approval.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={enabled}
                                    onClick={() => setEnabled(!enabled)}
                                    className="relative w-12 h-7 rounded-full transition-colors shrink-0"
                                    style={{ backgroundColor: enabled ? primaryColor : themeConfig.border }}
                                >
                                    <span
                                        className="absolute top-[2px] w-6 h-6 bg-white rounded-full transition-all shadow-sm"
                                        style={{ left: enabled ? '22px' : '2px' }}
                                    />
                                </button>
                            </div>

                            <div className="rounded-3xl shadow-lg p-6" style={{ backgroundColor: themeConfig.cardBg }}>
                                <h3 className="font-bold text-lg" style={{ color: themeConfig.text }}>Business knowledge</h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: themeConfig.textSecondary }}>
                                    Delivery charges, payment options, return policy, opening hours — anything the AI may tell customers.
                                    It already knows your store profile and product catalog; prices and stock always come from the catalog.
                                </p>
                                <textarea
                                    value={knowledge}
                                    onChange={(e) => setKnowledge(e.target.value)}
                                    maxLength={6000}
                                    placeholder={KNOWLEDGE_PLACEHOLDER}
                                    className="w-full min-h-[220px] border-transparent rounded-xl text-sm leading-relaxed p-4 shadow-sm resize-y"
                                    style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                />
                                <p className="mt-2 text-xs text-right" style={{ color: themeConfig.textSecondary }}>
                                    {knowledge.length}/6000
                                </p>
                            </div>

                            <div
                                className="rounded-2xl border p-4 flex items-start gap-2 text-xs leading-relaxed"
                                style={{ backgroundColor: `${themeConfig.surface}60`, borderColor: `${themeConfig.border}60`, color: themeConfig.textSecondary }}
                            >
                                <span className="material-symbols-outlined text-[16px] shrink-0">verified_user</span>
                                The assistant only states prices and availability from your product catalog, and answers policy questions
                                only from the knowledge above. When it doesn't know something, it says it will check with you instead of guessing.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
