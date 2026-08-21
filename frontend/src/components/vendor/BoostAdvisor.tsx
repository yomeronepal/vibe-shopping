import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../../contexts/ShopThemeContext';
import { mediaUrl } from '../../api/media';
import { getBoostAdvice, type BoostAdvice, type BoostRecommendation } from '../../api/socials';

function StatChip({ icon, label }: { icon: string; label: string }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <span
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold"
            style={{ backgroundColor: `${themeConfig.border}35`, color: themeConfig.textSecondary }}
        >
            <span className="material-symbols-outlined text-[14px]">{icon}</span>
            {label}
        </span>
    );
}

function PlanChip({ label, value }: { label: string; value: string }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <div
            className="rounded-xl px-3 py-2 text-center"
            style={{ backgroundColor: `${themeConfig.primary}0d` }}
        >
            <p className="text-sm font-extrabold" style={{ color: themeConfig.primary }}>{value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: themeConfig.textSecondary }}>{label}</p>
        </div>
    );
}

function RecommendationCard({ item }: { item: BoostRecommendation }) {
    const { config: themeConfig } = useShopTheme();
    const engagementTotal = item.engagement.likes + item.engagement.comments + item.engagement.shares;

    const copyPlan = () => {
        const plan = item.suggested;
        navigator.clipboard.writeText(
            `Boost plan for "${item.product.name}": Rs. ${plan.daily_budget}/day for ${plan.days} days `
            + `(total Rs. ${plan.total_budget}). Audience: ${plan.audience}. Goal: ${plan.goal}.`,
        );
        toast.success('Plan copied — paste it while setting up the boost');
    };

    return (
        <div
            className="rounded-2xl border p-4 flex flex-col gap-3"
            style={{ backgroundColor: `${themeConfig.surface}95`, borderColor: `${themeConfig.border}60` }}
        >
            <div className="flex items-start gap-3">
                {item.image ? (
                    <img
                        src={mediaUrl(item.image) ?? undefined}
                        alt=""
                        className="size-16 rounded-xl object-cover shrink-0 border"
                        style={{ borderColor: `${themeConfig.border}60` }}
                    />
                ) : (
                    <div className="size-16 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${themeConfig.border}40` }}>
                        <span className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>campaign</span>
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold truncate" style={{ color: themeConfig.text }}>{item.product.name}</p>
                        <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                            style={{ background: item.platform === 'instagram' ? 'linear-gradient(135deg, #f09433, #dc2743)' : '#1877F2' }}
                        >
                            {item.platform === 'instagram' ? 'IG' : 'FB'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <StatChip icon="favorite" label={`${engagementTotal} engagements`} />
                        <StatChip icon="shopping_bag" label={`${item.orders_30d} orders / 30d`} />
                        {item.revenue_30d > 0 && <StatChip icon="payments" label={`Rs. ${item.revenue_30d.toLocaleString()}`} />}
                    </div>
                </div>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: themeConfig.text }}>
                <span className="material-symbols-outlined text-[15px] align-middle mr-1" style={{ color: themeConfig.primary }}>auto_awesome</span>
                {item.reasoning}
            </p>

            <div className="grid grid-cols-4 gap-2">
                <PlanChip label="Per day" value={`Rs. ${item.suggested.daily_budget}`} />
                <PlanChip label="Days" value={String(item.suggested.days)} />
                <PlanChip label="Total" value={`Rs. ${item.suggested.total_budget}`} />
                <PlanChip label="Goal" value="Messages" />
            </div>
            <p className="text-xs -mt-1" style={{ color: themeConfig.textSecondary }}>
                Audience: {item.suggested.audience}
            </p>

            {item.warnings.map((warning) => (
                <p key={warning} className="text-xs font-semibold flex items-start gap-1.5 rounded-lg px-2.5 py-2" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                    <span className="material-symbols-outlined text-[14px] mt-0.5">warning</span>
                    {warning}
                </p>
            ))}

            <div className="flex gap-2 mt-auto">
                <a
                    href={item.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm text-white"
                    style={{ backgroundColor: '#1877F2' }}
                >
                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                    Boost on Facebook
                </a>
                <button
                    onClick={copyPlan}
                    title="Copy the suggested plan"
                    className="px-3.5 py-2.5 rounded-xl font-bold text-sm border"
                    style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                >
                    <span className="material-symbols-outlined text-[18px]">content_copy</span>
                </button>
            </div>
        </div>
    );
}

export default function BoostAdvisor() {
    const { config: themeConfig } = useShopTheme();
    const [advice, setAdvice] = useState<BoostAdvice | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = (refresh = false) => {
        if (refresh) setRefreshing(true);
        getBoostAdvice(refresh)
            .then(setAdvice)
            .catch(() => toast.error('Could not load boost recommendations'))
            .finally(() => {
                setLoading(false);
                setRefreshing(false);
            });
    };

    useEffect(() => load(), []);

    if (!loading && (!advice || advice.recommendations.length === 0)) {
        return (
            <div
                className="rounded-2xl border border-dashed p-6 text-center mb-6"
                style={{ borderColor: themeConfig.border }}
            >
                <span className="material-symbols-outlined text-3xl" style={{ color: themeConfig.textSecondary }}>campaign</span>
                <p className="mt-1 font-semibold text-sm" style={{ color: themeConfig.text }}>No boost picks yet</p>
                <p className="text-xs mt-1" style={{ color: themeConfig.textSecondary }}>
                    Publish product posts and the AI will recommend which ones are worth putting money behind.
                </p>
            </div>
        );
    }

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined" style={{ color: themeConfig.primary }}>campaign</span>
                    <h2 className="text-lg font-bold" style={{ color: themeConfig.text }}>AI Boost Advisor</h2>
                    <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                    >
                        Worth boosting
                    </span>
                </div>
                <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="flex items-center gap-1 text-xs font-bold disabled:opacity-50"
                    style={{ color: themeConfig.textSecondary }}
                >
                    <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
                    {refreshing ? 'Rethinking…' : 'Refresh'}
                </button>
            </div>
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-56 rounded-2xl" style={{ backgroundColor: `${themeConfig.border}40` }} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {advice!.recommendations.map((item) => (
                        <RecommendationCard key={item.post_id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
}
