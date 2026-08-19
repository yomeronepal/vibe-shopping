import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import SettingsTabs from '../components/vendor/SettingsTabs';
import TagEditor from '../components/vendor/TagEditor';
import { deleteKnowledgeDoc, fetchWebsiteKnowledge, getStoreProfile, removeWebsiteKnowledge, updateAssistantSettings, uploadKnowledgeDoc } from '../api/vendor';

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
    const [autoReply, setAutoReply] = useState(false);
    const [orderFields, setOrderFields] = useState<string[]>([]);
    const [tone, setTone] = useState('');
    const [language, setLanguage] = useState('');
    const [followupHours, setFollowupHours] = useState(6);
    const [followupMessage, setFollowupMessage] = useState('');
    const [restrictedTopics, setRestrictedTopics] = useState<string[]>([]);
    const [maxDiscount, setMaxDiscount] = useState(0);
    const [maxOrderValue, setMaxOrderValue] = useState(0);
    const [docs, setDocs] = useState<{ name: string; chars: number }[]>([]);
    const [website, setWebsite] = useState<{ url: string; chars: number }>({ url: '', chars: 0 });
    const [websiteInput, setWebsiteInput] = useState('');
    const [fetchingSite, setFetchingSite] = useState(false);
    const [knowledge, setKnowledge] = useState('');

    const primaryColor = themeConfig.primary;

    useEffect(() => {
        getStoreProfile()
            .then((profile) => {
                setEnabled(profile.ai_assistant_enabled);
                setAutoReply(profile.ai_auto_reply);
                setOrderFields(profile.order_fields);
                setTone(profile.ai_tone);
                setLanguage(profile.ai_language);
                setFollowupHours(profile.followup_hours);
                setFollowupMessage(profile.followup_message);
                setRestrictedTopics(profile.restricted_topics);
                setMaxDiscount(profile.ai_max_discount);
                setMaxOrderValue(profile.max_auto_order_value);
                setDocs(profile.knowledge_docs);
                setWebsite(profile.website_knowledge);
                setWebsiteInput(profile.website_knowledge.url);
                setKnowledge(profile.ai_knowledge);
            })
            .catch(() => toast.error('Could not load assistant settings'))
            .finally(() => setLoading(false));
    }, []);

    const handleDocUpload = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        try {
            setDocs(await uploadKnowledgeDoc(file));
            toast.success(`${file.name} added to knowledge`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not read that file');
        }
    };

    const handleDocDelete = async (name: string) => {
        try {
            setDocs(await deleteKnowledgeDoc(name));
        } catch {
            toast.error('Could not remove the document');
        }
    };

    const handleFetchWebsite = async () => {
        if (!websiteInput.trim()) return;
        setFetchingSite(true);
        try {
            const result = await fetchWebsiteKnowledge(websiteInput.trim());
            setWebsite(result);
            toast.success('Website content added to knowledge');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not fetch that page');
        } finally {
            setFetchingSite(false);
        }
    };

    const handleRemoveWebsite = async () => {
        try {
            await removeWebsiteKnowledge();
            setWebsite({ url: '', chars: 0 });
            setWebsiteInput('');
        } catch {
            toast.error('Could not remove the website content');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateAssistantSettings(knowledge, enabled, autoReply, orderFields, tone, language, followupHours, followupMessage, restrictedTopics, maxDiscount, maxOrderValue);
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
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div
                                            className="size-10 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ background: `linear-gradient(135deg, ${primaryColor}20, ${themeConfig.accent}20)`, color: primaryColor }}
                                        >
                                            <span className="material-symbols-outlined text-2xl">smart_toy</span>
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-lg leading-tight" style={{ color: themeConfig.text }}>Auto-reply bot</h3>
                                            <p className="text-xs font-medium mt-0.5" style={{ color: themeConfig.textSecondary }}>
                                                The AI answers customers by itself, instantly, using only your catalog and knowledge.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={autoReply}
                                        onClick={() => setAutoReply(!autoReply)}
                                        disabled={!enabled}
                                        className="relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-40"
                                        style={{ backgroundColor: autoReply && enabled ? primaryColor : themeConfig.border }}
                                    >
                                        <span
                                            className="absolute top-[2px] w-6 h-6 bg-white rounded-full transition-all shadow-sm"
                                            style={{ left: autoReply && enabled ? '22px' : '2px' }}
                                        />
                                    </button>
                                </div>
                                {autoReply && enabled && (
                                    <p
                                        className="mt-4 flex items-start gap-2 text-xs leading-relaxed rounded-xl p-3"
                                        style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.textSecondary }}
                                    >
                                        <span className="material-symbols-outlined text-[16px] shrink-0">info</span>
                                        Bot replies are labeled AI in your inbox and conversations stay marked unread so you can review them.
                                        You can pause the bot for any single conversation from its thread header.
                                    </p>
                                )}
                            </div>

                            <div className="rounded-3xl shadow-lg p-6" style={{ backgroundColor: themeConfig.cardBg }}>
                                <h3 className="font-bold text-lg" style={{ color: themeConfig.text }}>Voice & language</h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: themeConfig.textSecondary }}>
                                    How the assistant sounds in every reply — drafts and the auto-reply bot alike.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Tone</label>
                                        <select
                                            value={tone}
                                            onChange={(e) => setTone(e.target.value)}
                                            className="w-full rounded-xl text-sm py-2.5 px-3 shadow-sm border-transparent focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                        >
                                            <option value="">Friendly (default)</option>
                                            <option value="professional">Professional</option>
                                            <option value="casual">Casual</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Language</label>
                                        <select
                                            value={language}
                                            onChange={(e) => setLanguage(e.target.value)}
                                            className="w-full rounded-xl text-sm py-2.5 px-3 shadow-sm border-transparent focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                        >
                                            <option value="">Match the customer (default)</option>
                                            <option value="english">Always English</option>
                                            <option value="nepali">Always Nepali (romanized)</option>
                                            <option value="mixed">Always mixed Nepali-English</option>
                                        </select>
                                    </div>
                                </div>
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

                            <div className="rounded-3xl shadow-lg p-6" style={{ backgroundColor: themeConfig.cardBg }}>
                                <h3 className="font-bold text-lg" style={{ color: themeConfig.text }}>Abandoned-order follow-up</h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: themeConfig.textSecondary }}>
                                    When a customer starts ordering but goes quiet, the bot sends one gentle nudge (only while the bot is on).
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Wait (hours)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={48}
                                            value={followupHours}
                                            onChange={(e) => setFollowupHours(Math.min(48, Math.max(1, parseInt(e.target.value) || 6)))}
                                            className="w-full rounded-xl text-sm py-2.5 px-3 shadow-sm border-transparent focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Message (blank = default)</label>
                                        <textarea
                                            value={followupMessage}
                                            onChange={(e) => setFollowupMessage(e.target.value)}
                                            maxLength={500}
                                            placeholder="Namaste! Tapaile order garna khojnu bhayeko thiyo — hami yahi chhau…"
                                            className="w-full min-h-[64px] rounded-xl text-sm leading-relaxed p-3 shadow-sm resize-none border-transparent focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl shadow-lg p-6" style={{ backgroundColor: themeConfig.cardBg }}>
                                <h3 className="font-bold text-lg" style={{ color: themeConfig.text }}>Order information to collect</h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: themeConfig.textSecondary }}>
                                    Before placing a chat order, the AI asks the customer for each of these. Once it has them all
                                    (plus the products they want), the order is created automatically.
                                </p>
                                <TagEditor label="Fields" tags={orderFields} placeholder="Add field, press Enter" onChange={setOrderFields} />
                            </div>

                            <div className="rounded-3xl shadow-lg p-6" style={{ backgroundColor: themeConfig.cardBg }}>
                                <h3 className="font-bold text-lg" style={{ color: themeConfig.text }}>More knowledge sources</h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: themeConfig.textSecondary }}>
                                    Documents (price lists, policies) and your website — the AI reads them alongside the knowledge box.
                                </p>
                                <div className="space-y-2 mb-4">
                                    {docs.map((doc) => (
                                        <div key={doc.name} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: `${themeConfig.surface}80` }}>
                                            <span className="text-sm font-semibold truncate" style={{ color: themeConfig.text }}>
                                                <span className="material-symbols-outlined text-[16px] align-middle mr-1" style={{ color: themeConfig.primary }}>description</span>
                                                {doc.name}
                                            </span>
                                            <span className="text-xs shrink-0" style={{ color: themeConfig.textSecondary }}>{doc.chars} chars</span>
                                            <button onClick={() => handleDocDelete(doc.name)} aria-label={`Remove ${doc.name}`} className="material-symbols-outlined text-[16px]" style={{ color: '#dc2626' }}>delete</button>
                                        </div>
                                    ))}
                                    {docs.length < 3 && (
                                        <label
                                            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-2.5 text-sm font-bold cursor-pointer"
                                            style={{ borderColor: `${primaryColor}40`, color: primaryColor }}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                            Upload document (.txt, .md, .csv, .pdf)
                                            <input type="file" accept=".txt,.md,.csv,.pdf" className="hidden" onChange={(e) => handleDocUpload(e.target.files)} />
                                        </label>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={websiteInput}
                                        onChange={(e) => setWebsiteInput(e.target.value)}
                                        placeholder="https://your-website.com"
                                        className="flex-1 rounded-xl text-sm py-2.5 px-3 shadow-sm border-transparent focus:outline-none"
                                        style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                    />
                                    <button
                                        onClick={handleFetchWebsite}
                                        disabled={fetchingSite}
                                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        {fetchingSite ? 'Fetching…' : 'Fetch'}
                                    </button>
                                </div>
                                {website.chars > 0 && (
                                    <p className="mt-2 flex items-center gap-2 text-xs" style={{ color: themeConfig.textSecondary }}>
                                        <span className="material-symbols-outlined text-[14px]" style={{ color: '#16a34a' }}>check_circle</span>
                                        {website.url} — {website.chars} chars in knowledge
                                        <button onClick={handleRemoveWebsite} className="font-bold underline" style={{ color: '#dc2626' }}>remove</button>
                                    </p>
                                )}
                            </div>

                            <div className="rounded-3xl shadow-lg p-6" style={{ backgroundColor: themeConfig.cardBg }}>
                                <h3 className="font-bold text-lg" style={{ color: themeConfig.text }}>Business rules</h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: themeConfig.textSecondary }}>
                                    Hard limits the AI can never cross.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Max discount % (0 = never offer discounts)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={90}
                                            value={maxDiscount}
                                            onChange={(e) => setMaxDiscount(Math.min(90, Math.max(0, parseInt(e.target.value) || 0)))}
                                            className="w-full rounded-xl text-sm py-2.5 px-3 shadow-sm border-transparent focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Max auto-order value Rs. (0 = no limit)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={maxOrderValue}
                                            onChange={(e) => setMaxOrderValue(Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-full rounded-xl text-sm py-2.5 px-3 shadow-sm border-transparent focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                        />
                                        <p className="text-[11px] mt-1 ml-1" style={{ color: themeConfig.textSecondary }}>
                                            Bigger orders pause the bot and wait for you to confirm.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl shadow-lg p-6" style={{ backgroundColor: themeConfig.cardBg }}>
                                <h3 className="font-bold text-lg" style={{ color: themeConfig.text }}>Restricted topics</h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: themeConfig.textSecondary }}>
                                    The assistant will politely refuse to discuss these and steer back to your shop.
                                </p>
                                <TagEditor label="Topics" tags={restrictedTopics} placeholder="Add topic, press Enter" onChange={setRestrictedTopics} />
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
