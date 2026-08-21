import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../../contexts/ShopThemeContext';
import { mediaUrl } from '../../api/media';
import {
    getBoostAdvice,
    listAdAccounts,
    listBoosts,
    launchBoost,
    setBoostAction,
    type AdAccount,
    type Boost,
    type BoostAdvice,
    type BoostRecommendation,
} from '../../api/socials';

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

const BOOST_STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
    active: { bg: '#dcfce7', fg: '#15803d' },
    paused: { bg: '#fef3c7', fg: '#b45309' },
    completed: { bg: '#e0e7ff', fg: '#4338ca' },
    failed: { bg: '#fee2e2', fg: '#b91c1c' },
};

function BoostModal({ item, accounts, onClose, onLaunched }: {
    item: BoostRecommendation;
    accounts: AdAccount[];
    onClose: () => void;
    onLaunched: (boost: Boost) => void;
}) {
    const { config: themeConfig } = useShopTheme();
    const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
    const [dailyBudget, setDailyBudget] = useState(item.suggested.daily_budget);
    const [days, setDays] = useState(item.suggested.days);
    const [launching, setLaunching] = useState(false);

    const handleLaunch = async () => {
        setLaunching(true);
        try {
            const boost = await launchBoost({
                post_id: item.post_id,
                ad_account_id: accountId,
                daily_budget: dailyBudget,
                days,
            });
            toast.success('Boost launched — the AI will watch its spending for you');
            onLaunched(boost);
            onClose();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not launch the boost');
        } finally {
            setLaunching(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative w-full max-w-md rounded-[28px] shadow-2xl border p-6"
                role="dialog"
                aria-modal="true"
                style={{ backgroundColor: themeConfig.cardBg, borderColor: `${themeConfig.border}50` }}
            >
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-extrabold" style={{ color: themeConfig.text }}>Boost "{item.product.name.slice(0, 28)}"</h3>
                    <button onClick={onClose} aria-label="Close" className="material-symbols-outlined z-10" style={{ color: themeConfig.textSecondary }}>close</button>
                </div>
                <p className="text-xs mb-4" style={{ color: themeConfig.textSecondary }}>
                    Runs a "get more messages" ad — people who tap it land straight in your AI's chat.
                </p>
                <label className="block text-xs font-bold mb-1.5" style={{ color: themeConfig.textSecondary }}>Ad account</label>
                <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-xl text-sm py-2.5 px-3 mb-4 focus:outline-none"
                    style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                >
                    {accounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                    ))}
                </select>
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <label className="block">
                        <span className="block text-xs font-bold mb-1.5" style={{ color: themeConfig.textSecondary }}>Budget per day (Rs.)</span>
                        <input
                            type="number"
                            min={150}
                            value={dailyBudget}
                            onChange={(e) => setDailyBudget(parseInt(e.target.value) || 0)}
                            className="w-full rounded-xl text-sm py-2.5 px-3 focus:outline-none"
                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                        />
                    </label>
                    <label className="block">
                        <span className="block text-xs font-bold mb-1.5" style={{ color: themeConfig.textSecondary }}>Days</span>
                        <input
                            type="number"
                            min={1}
                            max={30}
                            value={days}
                            onChange={(e) => setDays(parseInt(e.target.value) || 1)}
                            className="w-full rounded-xl text-sm py-2.5 px-3 focus:outline-none"
                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                        />
                    </label>
                </div>
                <div className="rounded-xl p-3 mb-4 text-sm" style={{ backgroundColor: `${themeConfig.primary}0d`, color: themeConfig.text }}>
                    Total: <span className="font-extrabold">Rs. {(dailyBudget * days).toLocaleString()}</span>
                    <span className="text-xs" style={{ color: themeConfig.textSecondary }}> · {item.suggested.audience}</span>
                </div>
                <p className="text-[11px] mb-4 leading-snug" style={{ color: themeConfig.textSecondary }}>
                    The AI checks results every few hours and auto-pauses if money is being spent without
                    bringing conversations. You can pause anytime.
                </p>
                <button
                    onClick={handleLaunch}
                    disabled={launching || !accountId}
                    className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                    style={{ backgroundColor: themeConfig.primary }}
                >
                    {launching ? 'Launching…' : `Launch boost — Rs. ${(dailyBudget * days).toLocaleString()}`}
                </button>
            </div>
        </div>
    );
}

function ActiveBoostRow({ boost, onAction }: { boost: Boost; onAction: (id: number, action: 'pause' | 'resume') => void }) {
    const { config: themeConfig } = useShopTheme();
    const palette = BOOST_STATUS_STYLES[boost.status] ?? BOOST_STATUS_STYLES.active;
    const insights = boost.insights || {};
    return (
        <div
            className="rounded-xl border p-3 flex items-center gap-3 flex-wrap"
            style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm truncate" style={{ color: themeConfig.text }}>{boost.product_name || `Post #${boost.post_id}`}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize" style={{ backgroundColor: palette.bg, color: palette.fg }}>
                        {boost.status}
                    </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: themeConfig.textSecondary }}>
                    Rs. {boost.daily_budget}/day × {boost.days}d
                    {insights.spend !== undefined && ` · spent Rs. ${Number(insights.spend).toLocaleString()}`}
                    {insights.conversations_started !== undefined && ` · ${insights.conversations_started} chats`}
                    {insights.cost_per_conversation ? ` · Rs. ${insights.cost_per_conversation}/chat` : ''}
                </p>
                {boost.status_note && (
                    <p className="text-xs mt-0.5 font-semibold" style={{ color: boost.status === 'paused' ? '#b45309' : themeConfig.textSecondary }}>
                        {boost.status_note}
                    </p>
                )}
            </div>
            {(boost.status === 'active' || boost.status === 'paused') && (
                <button
                    onClick={() => onAction(boost.id, boost.status === 'active' ? 'pause' : 'resume')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0"
                    style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                >
                    {boost.status === 'active' ? 'Pause' : 'Resume'}
                </button>
            )}
        </div>
    );
}

function RecommendationCard({ item, onBoost }: { item: BoostRecommendation; onBoost?: (item: BoostRecommendation) => void }) {
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
                {onBoost ? (
                    <button
                        onClick={() => onBoost(item)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm text-white"
                        style={{ backgroundColor: themeConfig.primary }}
                    >
                        <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                        Boost now
                    </button>
                ) : (
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
                )}
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
    const [accounts, setAccounts] = useState<AdAccount[]>([]);
    const [boosts, setBoosts] = useState<Boost[]>([]);
    const [boostTarget, setBoostTarget] = useState<BoostRecommendation | null>(null);

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

    useEffect(() => {
        load();
        listAdAccounts().then(setAccounts).catch(() => setAccounts([]));
        listBoosts().then(setBoosts).catch(() => {});
    }, []);

    const handleBoostAction = async (id: number, action: 'pause' | 'resume') => {
        try {
            const updated = await setBoostAction(id, action);
            setBoosts((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            toast.success(action === 'pause' ? 'Boost paused' : 'Boost resumed');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not update the boost');
        }
    };

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
                <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="mt-3 px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-50"
                    style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                >
                    {refreshing ? 'Checking…' : 'Check again'}
                </button>
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
                        <RecommendationCard
                            key={item.post_id}
                            item={item}
                            onBoost={accounts.length > 0 ? setBoostTarget : undefined}
                        />
                    ))}
                </div>
            )}
            {boosts.length > 0 && (
                <div className="mt-5">
                    <h3 className="text-sm font-bold mb-2" style={{ color: themeConfig.textSecondary }}>
                        Your boosts
                    </h3>
                    <div className="flex flex-col gap-2">
                        {boosts.map((boost) => (
                            <ActiveBoostRow key={boost.id} boost={boost} onAction={handleBoostAction} />
                        ))}
                    </div>
                </div>
            )}
            {boostTarget && (
                <BoostModal
                    item={boostTarget}
                    accounts={accounts}
                    onClose={() => setBoostTarget(null)}
                    onLaunched={(boost) => setBoosts((prev) => [boost, ...prev])}
                />
            )}
        </div>
    );
}
