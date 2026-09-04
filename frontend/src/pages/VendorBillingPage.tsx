import { useEffect, useState } from 'react';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import SettingsTabs from '../components/vendor/SettingsTabs';
import { getBilling, type BillingInfo } from '../api/billing';

const STATUS_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
    active: { label: 'Active', bg: '#dcfce7', fg: '#15803d' },
    grace: { label: 'Renewal due', bg: '#fef3c7', fg: '#b45309' },
    expired: { label: 'Expired', bg: '#fee2e2', fg: '#b91c1c' },
};

function formatLimit(limit: number | null): string {
    return limit === null ? 'Unlimited' : limit.toLocaleString();
}

export default function VendorBillingPage() {
    const { config: themeConfig } = useShopTheme();
    const [billing, setBilling] = useState<BillingInfo | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getBilling()
            .then(setBilling)
            .catch((err: any) => setError(err.response?.data?.error || 'Could not load billing.'))
            .finally(() => setLoading(false));
    }, []);

    const currentPlan = billing?.plans.find((plan) => plan.key === billing?.plan);
    const statusStyle = billing ? STATUS_STYLES[billing.status] : null;
    const usagePct = billing?.usage.limit
        ? Math.min(100, Math.round((billing.usage.used / billing.usage.limit) * 100))
        : 0;

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-8 pb-24 md:pb-8">
                    <h1 className="text-3xl font-extrabold tracking-tight mb-6" style={{ color: themeConfig.text }}>
                        Settings
                    </h1>
                    <SettingsTabs />

                    {loading && (
                        <div className="h-40 rounded-2xl animate-pulse" style={{ backgroundColor: `${themeConfig.border}40` }} />
                    )}

                    {!loading && error && (
                        <p className="font-semibold" style={{ color: themeConfig.textSecondary }}>{error}</p>
                    )}

                    {billing && currentPlan && statusStyle && (
                        <>
                            <div
                                className="rounded-2xl border p-6"
                                style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                            >
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="text-sm font-semibold" style={{ color: themeConfig.textSecondary }}>
                                            Current plan{billing.is_trial ? ' — free trial' : ''}
                                        </p>
                                        <p className="text-2xl font-extrabold" style={{ color: themeConfig.text }}>
                                            {currentPlan.name}
                                            {!billing.is_trial && (
                                                <span className="text-base font-bold ml-2" style={{ color: themeConfig.textSecondary }}>
                                                    Rs {currentPlan.price.toLocaleString()}/month
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <span
                                        className="px-3 py-1.5 rounded-full text-sm font-bold"
                                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}
                                    >
                                        {statusStyle.label}
                                    </span>
                                </div>
                                <p className="text-sm mt-3" style={{ color: themeConfig.textSecondary }}>
                                    {billing.status === 'expired'
                                        ? 'Your AI assistant has stopped replying. Renew to switch it back on — your data is safe.'
                                        : billing.status === 'grace'
                                            ? 'Renew now to keep your AI replying to customers.'
                                            : `Renews ${new Date(billing.period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — ${billing.days_left} day${billing.days_left === 1 ? '' : 's'} left.`}
                                </p>

                                <div className="mt-5">
                                    <div className="flex justify-between text-sm font-semibold mb-1.5">
                                        <span style={{ color: themeConfig.text }}>AI replies this month</span>
                                        <span style={{ color: themeConfig.textSecondary }}>
                                            {billing.usage.used.toLocaleString()} / {formatLimit(billing.usage.limit)}
                                        </span>
                                    </div>
                                    <div className="h-2 rounded-full" style={{ backgroundColor: `${themeConfig.border}50` }}>
                                        <div
                                            className="h-2 rounded-full transition-all"
                                            style={{
                                                width: billing.usage.limit === null ? '100%' : `${usagePct}%`,
                                                backgroundColor: usagePct >= 90 ? '#dc2626' : themeConfig.primary,
                                                opacity: billing.usage.limit === null ? 0.35 : 1,
                                            }}
                                        />
                                    </div>
                                    {billing.usage.limit !== null && usagePct >= 90 && (
                                        <p className="text-xs mt-1.5 font-semibold" style={{ color: '#b45309' }}>
                                            Almost at your monthly limit — upgrade so the AI keeps replying.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: themeConfig.text }}>Plans</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {billing.plans.map((plan) => {
                                    const isCurrent = plan.key === billing.plan && !billing.is_trial;
                                    return (
                                        <div
                                            key={plan.key}
                                            className="rounded-2xl border p-5"
                                            style={{
                                                backgroundColor: `${themeConfig.surface}90`,
                                                borderColor: isCurrent ? themeConfig.primary : `${themeConfig.border}60`,
                                                borderWidth: isCurrent ? 2 : 1,
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <p className="font-extrabold" style={{ color: themeConfig.text }}>{plan.name}</p>
                                                {isCurrent && (
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${themeConfig.primary}15`, color: themeConfig.primary }}>
                                                        Current
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xl font-extrabold mt-1" style={{ color: themeConfig.text }}>
                                                Rs {plan.price.toLocaleString()}
                                                <span className="text-sm font-semibold" style={{ color: themeConfig.textSecondary }}>/month</span>
                                            </p>
                                            <p className="text-sm mt-2 font-semibold" style={{ color: themeConfig.text }}>
                                                {formatLimit(plan.monthly_ai_replies)} AI replies/month
                                            </p>
                                            <p className="text-xs mt-1.5" style={{ color: themeConfig.textSecondary }}>{plan.pitch}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            <div
                                className="mt-8 rounded-2xl border p-6"
                                style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="material-symbols-outlined" style={{ color: themeConfig.primary }}>qr_code_2</span>
                                    <h3 className="font-bold text-lg" style={{ color: themeConfig.text }}>How to pay or upgrade</h3>
                                </div>
                                <p className="text-sm" style={{ color: themeConfig.textSecondary }}>
                                    {billing.payment_instructions}
                                </p>
                                <p className="text-xs mt-3" style={{ color: themeConfig.textSecondary }}>
                                    Your plan is activated within a few hours of sending the receipt.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
