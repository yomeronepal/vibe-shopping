import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { getAnalyticsSummary, type AnalyticsSummary } from '../api/vendor';

const WINDOWS = [7, 30, 90];

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <div
            className="flex-1 min-w-[150px] rounded-2xl border p-4 backdrop-blur-xl shadow-sm"
            style={{ backgroundColor: `${themeConfig.surface}85`, borderColor: `${themeConfig.border}60` }}
        >
            <p className="text-2xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>{value}</p>
            <p className="text-xs font-medium mt-1" style={{ color: themeConfig.textSecondary }}>{label}</p>
            {hint && <p className="text-[10px] mt-0.5" style={{ color: themeConfig.textSecondary }}>{hint}</p>}
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <div
            className="rounded-2xl border p-6 backdrop-blur-xl shadow-sm"
            style={{ backgroundColor: `${themeConfig.surface}85`, borderColor: `${themeConfig.border}60` }}
        >
            <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined" style={{ color: themeConfig.primary }}>{icon}</span>
                <h3 className="text-lg font-bold" style={{ color: themeConfig.text }}>{title}</h3>
            </div>
            {children}
        </div>
    );
}

function StatRow({ label, value }: { label: string; value: string }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <div className="flex items-center justify-between py-1.5">
            <span className="text-sm" style={{ color: themeConfig.textSecondary }}>{label}</span>
            <span className="text-sm font-bold" style={{ color: themeConfig.text }}>{value}</span>
        </div>
    );
}

function RankedList({ rows }: { rows: { label: string; value: string }[] }) {
    const { config: themeConfig } = useShopTheme();
    if (rows.length === 0) {
        return <p className="text-sm py-2" style={{ color: themeConfig.textSecondary }}>No data in this period yet.</p>;
    }
    return (
        <div className="divide-y" style={{ borderColor: `${themeConfig.border}40` }}>
            {rows.map((row, index) => (
                <div key={index} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm truncate" style={{ color: themeConfig.text }}>
                        <span className="font-bold mr-2" style={{ color: themeConfig.primary }}>{index + 1}.</span>
                        {row.label}
                    </span>
                    <span className="text-sm font-bold shrink-0" style={{ color: themeConfig.text }}>{row.value}</span>
                </div>
            ))}
        </div>
    );
}

export default function VendorAnalyticsPage() {
    const { config: themeConfig } = useShopTheme();
    const [days, setDays] = useState(30);
    const [data, setData] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getAnalyticsSummary(days)
            .then(setData)
            .catch(() => toast.error('Could not load analytics. Refresh to retry.'))
            .finally(() => setLoading(false));
    }, [days]);

    const pct = (value: number) => `${Math.round(value * 100)}%`;

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-5xl px-4 md:px-6 py-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                Analytics
                            </h1>
                            <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                                Sales, social, and AI performance at a glance.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: `${themeConfig.border}40` }}>
                            {WINDOWS.map((window) => (
                                <button
                                    key={window}
                                    onClick={() => setDays(window)}
                                    className="px-3 py-1 rounded-full text-xs font-bold transition-colors"
                                    style={days === window
                                        ? { backgroundColor: themeConfig.surface, color: themeConfig.primary }
                                        : { color: themeConfig.textSecondary }}
                                >
                                    {window}d
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading || !data ? (
                        <div className="mt-6 flex flex-wrap gap-4 animate-pulse">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="flex-1 min-w-[150px] h-24 rounded-2xl" style={{ backgroundColor: `${themeConfig.border}40` }} />
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className="mt-6 flex flex-wrap gap-4">
                                <Kpi label="Revenue" value={`Rs. ${data.sales.revenue.toLocaleString()}`} />
                                <Kpi label="Orders" value={String(data.sales.total_orders)} />
                                <Kpi label="Avg. order value" value={`Rs. ${data.sales.average_order_value.toLocaleString()}`} />
                                <Kpi
                                    label="Chat → order conversion"
                                    value={pct(data.sales.conversion_rate)}
                                    hint={`${data.sales.conversations} conversation(s)`}
                                />
                            </div>

                            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                <Section title="Sales" icon="payments">
                                    <StatRow label="Repeat customers" value={String(data.sales.repeat_customers)} />
                                    <StatRow label="Cancelled orders" value={String(data.sales.cancelled_orders)} />
                                    <StatRow label="Returned orders" value={String(data.sales.returned_orders)} />
                                    <p className="text-xs font-bold uppercase tracking-wide mt-4 mb-1" style={{ color: themeConfig.textSecondary }}>Best sellers</p>
                                    <RankedList rows={data.sales.best_sellers.map((row) => ({
                                        label: row.name.slice(0, 40),
                                        value: `${row.units} sold`,
                                    }))} />
                                </Section>

                                <Section title="Social" icon="forum">
                                    <StatRow label="Messages received" value={String(data.social.messages_received)} />
                                    <StatRow label="Comments received" value={String(data.social.comments_received)} />
                                    <StatRow
                                        label="Avg. response time"
                                        value={data.social.average_response_minutes === null ? '—' : `${data.social.average_response_minutes} min`}
                                    />
                                    <StatRow
                                        label="Followers (FB / IG)"
                                        value={`${data.social.followers.facebook ?? '—'} / ${data.social.followers.instagram ?? '—'}`}
                                    />
                                    <p className="text-xs font-bold uppercase tracking-wide mt-4 mb-1" style={{ color: themeConfig.textSecondary }}>Best posts</p>
                                    <RankedList rows={data.social.best_posts.map((row) => ({
                                        label: `${row.platform === 'instagram' ? 'IG' : 'FB'} · ${row.caption}`,
                                        value: `${row.engagement} eng.`,
                                    }))} />
                                    <p className="text-xs font-bold uppercase tracking-wide mt-4 mb-1" style={{ color: themeConfig.textSecondary }}>Best products by engagement</p>
                                    <RankedList rows={data.social.best_products.map((row) => ({
                                        label: row.name.slice(0, 40),
                                        value: `${row.engagement} eng.`,
                                    }))} />
                                </Section>

                                <Section title="AI assistant" icon="smart_toy">
                                    <StatRow label="AI-handled conversations" value={String(data.ai.ai_conversations)} />
                                    <StatRow label="Resolved by AI alone" value={pct(data.ai.resolution_rate)} />
                                    <StatRow label="Handed to a human" value={pct(data.ai.handoff_rate)} />
                                    <StatRow label="Orders placed by the bot" value={String(data.ai.ai_orders)} />
                                    <StatRow label="Bot order revenue" value={`Rs. ${data.ai.ai_order_revenue.toLocaleString()}`} />
                                    <StatRow label="AI conversation → order" value={pct(data.ai.ai_conversion_rate)} />
                                </Section>

                                <Section title="AI usage & cost" icon="receipt_long">
                                    {data.ai.usage.length === 0 ? (
                                        <p className="text-sm py-2" style={{ color: themeConfig.textSecondary }}>No AI calls in this period.</p>
                                    ) : (
                                        data.ai.usage.map((row) => (
                                            <StatRow
                                                key={row.provider}
                                                label={`${row.provider} — ${row.calls} call(s), ${row.tokens.toLocaleString()} tokens`}
                                                value={`$${row.cost_usd.toFixed(4)}`}
                                            />
                                        ))
                                    )}
                                    <StatRow label="Failed AI calls" value={String(data.ai.failed_calls)} />
                                </Section>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
