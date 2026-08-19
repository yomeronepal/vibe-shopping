import { Link, useLocation } from 'react-router-dom';
import { useShopTheme } from '../../contexts/ShopThemeContext';

const TABS = [
    { to: '/vendor/settings/profile', label: 'Store profile', icon: 'storefront' },
    { to: '/vendor/settings/accounts', label: 'Connected accounts', icon: 'link' },
];

export default function SettingsTabs() {
    const { pathname } = useLocation();
    const { config: themeConfig } = useShopTheme();
    return (
        <div className="flex gap-2 border-b mb-8 overflow-x-auto" style={{ borderColor: `${themeConfig.border}80` }}>
            {TABS.map((tab) => {
                const active = pathname.startsWith(tab.to);
                return (
                    <Link
                        key={tab.to}
                        to={tab.to}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm whitespace-nowrap transition-colors ${active ? 'font-bold' : 'font-semibold'}`}
                        style={{
                            borderColor: active ? themeConfig.primary : 'transparent',
                            color: active ? themeConfig.text : themeConfig.textSecondary,
                        }}
                    >
                        <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
