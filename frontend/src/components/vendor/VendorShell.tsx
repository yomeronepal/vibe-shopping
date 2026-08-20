import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useShopTheme } from '../../contexts/ShopThemeContext';
import { authApi } from '../../api/auth';
import { getStoreProfile } from '../../api/vendor';

interface VendorProfileInfo {
    store_name?: string;
    logo?: string | null;
    offering?: string;
}

function resolveNavLabel(item: { label: string; offeringLabel?: boolean }, offering?: string) {
    if (!item.offeringLabel) return item.label;
    if (offering === 'services') return 'Services';
    if (offering === 'both') return 'Catalog';
    return item.label;
}

const NAV_ITEMS = [
    { to: '/vendor', label: 'Dashboard', icon: 'grid_view', exact: true },
    { to: '/vendor/inbox', label: 'Inbox', icon: 'chat', exact: false },
    { to: '/vendor/orders', label: 'Orders', icon: 'shopping_bag', exact: false },
    { to: '/vendor/customers', label: 'Customers', icon: 'group', exact: false },
    { to: '/vendor/analytics', label: 'Analytics', icon: 'bar_chart', exact: false },
    { to: '/vendor/calendar', label: 'Publishing', icon: 'calendar_month', exact: false },
    { to: '/vendor/products', label: 'Products', icon: 'sell', exact: false, offeringLabel: true },
    { to: '/vendor/settings/profile', label: 'Settings', icon: 'tune', exact: false, match: '/vendor/settings' },
];

export default function VendorShell({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { config: themeConfig } = useShopTheme();
    const [profile, setProfile] = useState<VendorProfileInfo>({});

    const primaryColor = themeConfig.primary;
    const accentColor = themeConfig.accent;

    useEffect(() => {
        getStoreProfile()
            .then((data) => setProfile({ store_name: data.store_name || 'BizAlly', logo: data.logo || null, offering: data.offering || 'products' }))
            .catch(() => setProfile({ store_name: 'BizAlly', logo: null }));
    }, []);

    const handleLogout = async () => {
        await authApi.logout();
        navigate('/vendor/login');
    };

    const isActive = (item: (typeof NAV_ITEMS)[number] & { match?: string }) =>
        item.exact ? location.pathname === item.to : location.pathname.startsWith(item.match ?? item.to);

    return (
        <div
            className="flex h-screen w-full overflow-hidden font-display"
            style={{
                background: `radial-gradient(at 40% 20%, ${primaryColor}15 0px, transparent 50%), radial-gradient(at 80% 0%, ${accentColor}10 0px, transparent 50%), radial-gradient(at 0% 50%, ${primaryColor}08 0px, transparent 50%), ${themeConfig.background}`,
            }}
        >
            <aside className="hidden md:flex flex-col w-72 h-full p-6 z-20 sticky top-0">
                <div
                    className="w-full h-full rounded-2xl flex flex-col justify-between p-6 backdrop-blur-xl border shadow-lg"
                    style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                >
                    <div className="flex flex-col gap-6">
                        <Link to="/vendor" className="flex items-center gap-3 px-2">
                            <div
                                className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/50 shadow-sm flex items-center justify-center"
                                style={{ backgroundColor: profile.logo ? 'white' : primaryColor }}
                            >
                                {profile.logo ? (
                                    <img src={`http://localhost:8000${profile.logo}`} alt="Store logo" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="material-symbols-outlined text-white text-xl">storefront</span>
                                )}
                            </div>
                            <div>
                                <h1 className="text-base font-bold leading-tight" style={{ color: themeConfig.text }}>
                                    {profile.store_name || 'BizAlly'}
                                </h1>
                                <p className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>Vendor Portal</p>
                            </div>
                        </Link>
                        <nav className="flex flex-col gap-2 mt-4">
                            {NAV_ITEMS.map((item) => {
                                const active = isActive(item);
                                return (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${active ? 'font-bold' : 'font-medium hover:opacity-80'}`}
                                        style={{
                                            backgroundColor: active ? `${primaryColor}15` : 'transparent',
                                            color: active ? primaryColor : themeConfig.textSecondary,
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                                        <span className="text-sm">{resolveNavLabel(item, profile.offering)}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                    <div className="flex flex-col gap-4">
                        <div className="h-px" style={{ background: `linear-gradient(to right, transparent, ${themeConfig.border}, transparent)` }}></div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-3 px-2 py-2 rounded-xl transition-all hover:scale-[0.98]"
                            style={{ backgroundColor: `${primaryColor}10`, color: primaryColor, border: `1px solid ${primaryColor}20` }}
                        >
                            <span className="material-symbols-outlined text-[18px]">logout</span>
                            <span className="text-sm font-semibold">Logout</span>
                        </button>
                    </div>
                </div>
            </aside>
            <div
                className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex justify-around py-2 backdrop-blur-xl border-t"
                style={{ backgroundColor: `${themeConfig.surface}95`, borderColor: `${themeConfig.border}60` }}
            >
                {NAV_ITEMS.map((item) => {
                    const active = isActive(item);
                    return (
                        <Link
                            key={item.to}
                            to={item.to}
                            className="flex flex-col items-center gap-0.5 px-3 py-1"
                            style={{ color: active ? primaryColor : themeConfig.textSecondary }}
                        >
                            <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                            <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{resolveNavLabel(item, profile.offering)}</span>
                        </Link>
                    );
                })}
            </div>
            <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10 pb-14 md:pb-0">
                {children}
            </main>
        </div>
    );
}
