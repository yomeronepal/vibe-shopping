import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import CustomerPanel from '../components/vendor/CustomerPanel';
import { listCustomersPage, sendCampaign, type CustomerCard } from '../api/inbox';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
    'prospect': { bg: '#f3f4f6', fg: '#4b5563' },
    'customer': { bg: '#dbeafe', fg: '#1d4ed8' },
    'repeat customer': { bg: '#dcfce7', fg: '#15803d' },
};

export default function VendorCustomersPage() {
    const { config: themeConfig } = useShopTheme();
    const [customers, setCustomers] = useState<CustomerCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [openCustomerId, setOpenCustomerId] = useState<number | null>(null);
    const [campaignOpen, setCampaignOpen] = useState(false);
    const [campaignMessage, setCampaignMessage] = useState('');
    const [campaignAudience, setCampaignAudience] = useState<'all' | 'buyers' | 'prospects'>('all');
    const [campaignSending, setCampaignSending] = useState(false);
    const [nextPage, setNextPage] = useState<number | null>(null);
    const [totalCount, setTotalCount] = useState(0);

    const handleCampaignSend = async () => {
        if (campaignMessage.trim().length < 5) {
            toast.error('Write the message first');
            return;
        }
        setCampaignSending(true);
        try {
            const result = await sendCampaign(campaignMessage.trim(), campaignAudience);
            toast.success(`Sent to ${result.sent} customer(s)${result.skipped ? ` — ${result.skipped} skipped (messaging window closed)` : ''}`);
            setCampaignOpen(false);
            setCampaignMessage('');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not send the campaign');
        } finally {
            setCampaignSending(false);
        }
    };

    const loadCustomers = (page = 1, q = search) => {
        listCustomersPage(page, q)
            .then((data) => {
                setCustomers((prev) => (page === 1 ? data.results : [...prev, ...data.results]));
                setNextPage(data.next);
                setTotalCount(data.count);
            })
            .catch(() => toast.error('Could not load customers. Refresh to retry.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        const handle = window.setTimeout(() => loadCustomers(1), search ? 350 : 0);
        return () => window.clearTimeout(handle);
    }, [search]);

    const closePanel = () => {
        setOpenCustomerId(null);
        loadCustomers(1);
    };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-5xl px-4 md:px-6 py-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                Customers
                            </h1>
                            <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                                Everyone who has messaged or bought from your store.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={() => setCampaignOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white shadow-md transition-all hover:-translate-y-0.5"
                            style={{ backgroundColor: themeConfig.primary }}
                        >
                            <span className="material-symbols-outlined text-[18px]">campaign</span>
                            Message customers
                        </button>
                        <div
                            className="flex items-center gap-2 rounded-xl px-3 py-2 min-w-[240px] border"
                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border }}
                        >
                            <span className="material-symbols-outlined text-[18px]" style={{ color: themeConfig.textSecondary }}>search</span>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name, phone, email…"
                                className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm"
                                style={{ color: themeConfig.text }}
                            />
                        </div>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        {customers.map((customer) => {
                            const palette = STATUS_COLORS[customer.status] ?? STATUS_COLORS.prospect;
                            return (
                                <button
                                    key={customer.id}
                                    onClick={() => setOpenCustomerId(customer.id)}
                                    className="w-full text-left rounded-2xl border p-4 backdrop-blur-xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                                    style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                                >
                                    <div className="flex items-center gap-4">
                                        {customer.profile_pic_url ? (
                                            <img src={customer.profile_pic_url} alt="" className="size-11 rounded-full object-cover shrink-0" />
                                        ) : (
                                            <div
                                                className="size-11 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                                                style={{ backgroundColor: themeConfig.primary }}
                                            >
                                                {(customer.name || '?').charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold" style={{ color: themeConfig.text }}>
                                                    {customer.name || customer.platform_user_id}
                                                </span>
                                                <span
                                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                                                    style={{ background: customer.platform === 'instagram' ? 'linear-gradient(135deg, #f09433, #dc2743)' : '#1877F2' }}
                                                >
                                                    {customer.platform === 'instagram' ? 'IG' : 'FB'}
                                                </span>
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                                                    style={{ backgroundColor: palette.bg, color: palette.fg }}
                                                >
                                                    {customer.status}
                                                </span>
                                                {customer.tags.slice(0, 3).map((tag) => (
                                                    <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}>
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-xs mt-0.5 truncate" style={{ color: themeConfig.textSecondary }}>
                                                {[customer.phone, customer.location, customer.email].filter(Boolean).join(' · ') || 'No contact details yet'}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-extrabold" style={{ color: themeConfig.text }}>
                                                Rs. {customer.total_spent.toLocaleString()}
                                            </p>
                                            <p className="text-xs" style={{ color: themeConfig.textSecondary }}>
                                                {customer.order_count} order{customer.order_count === 1 ? '' : 's'}
                                                {customer.last_active_at && ` · active ${new Date(customer.last_active_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        {nextPage && !loading && (
                            <div className="flex justify-center py-2">
                                <button
                                    onClick={() => loadCustomers(nextPage)}
                                    className="px-6 py-2.5 rounded-xl font-bold text-sm border"
                                    style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                >
                                    Load more ({customers.length} of {totalCount})
                                </button>
                            </div>
                        )}
                        {!loading && customers.length === 0 && (
                            <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: themeConfig.border }}>
                                <span className="material-symbols-outlined text-4xl" style={{ color: themeConfig.textSecondary }}>group</span>
                                <p className="mt-2 font-semibold" style={{ color: themeConfig.text }}>
                                    {search ? 'No customers match' : 'No customers yet'}
                                </p>
                                <p className="text-sm mt-1" style={{ color: themeConfig.textSecondary }}>
                                    {search ? 'Try a different name or number.' : 'People who message your Page or Instagram will appear here automatically.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {openCustomerId !== null && (
                <CustomerPanel customerId={openCustomerId} onClose={closePanel} />
            )}
            {campaignOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in" onClick={() => setCampaignOpen(false)} />
                    <div
                        className="relative w-full max-w-md rounded-[28px] shadow-2xl border p-6 animate-pop-in"
                        role="dialog"
                        aria-modal="true"
                        style={{ backgroundColor: themeConfig.cardBg, borderColor: `${themeConfig.border}50` }}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-lg font-extrabold" style={{ color: themeConfig.text }}>Message customers</h3>
                            <button onClick={() => setCampaignOpen(false)} aria-label="Close" className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>close</button>
                        </div>
                        <p className="text-xs mb-4" style={{ color: themeConfig.textSecondary }}>
                            Announce new products or offers. Meta only delivers within each customer's messaging window — others are skipped.
                        </p>
                        <label className="block text-xs font-bold mb-1.5" style={{ color: themeConfig.textSecondary }}>Send to</label>
                        <select
                            value={campaignAudience}
                            onChange={(e) => setCampaignAudience(e.target.value as typeof campaignAudience)}
                            className="w-full rounded-xl text-sm py-2.5 px-3 mb-4 border-transparent focus:outline-none"
                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                        >
                            <option value="all">All customers</option>
                            <option value="buyers">Buyers (for repeat-purchase offers)</option>
                            <option value="prospects">Prospects (never ordered)</option>
                        </select>
                        <label className="block text-xs font-bold mb-1.5" style={{ color: themeConfig.textSecondary }}>Message</label>
                        <textarea
                            value={campaignMessage}
                            onChange={(e) => setCampaignMessage(e.target.value)}
                            maxLength={900}
                            placeholder="Naya collection aayo! Herna DM garnus…"
                            className="w-full min-h-[110px] rounded-xl text-sm leading-relaxed p-3 resize-none border-transparent focus:outline-none"
                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                        />
                        <button
                            onClick={handleCampaignSend}
                            disabled={campaignSending}
                            className="mt-4 w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                            style={{ backgroundColor: themeConfig.primary }}
                        >
                            {campaignSending ? 'Sending…' : 'Send campaign'}
                        </button>
                    </div>
                </div>
            )}
        </VendorShell>
    );
}
