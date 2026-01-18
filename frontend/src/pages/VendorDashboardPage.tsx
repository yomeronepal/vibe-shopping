import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShopTheme } from '../contexts/ShopThemeContext';

// Dashboard sections
type DashboardSection = 'dashboard' | 'orders' | 'products' | 'analytics' | 'settings';

const VendorDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { config: themeConfig } = useShopTheme();
    const [activeSection, setActiveSection] = useState<DashboardSection>('dashboard');

    const primaryColor = themeConfig.primary;
    const accentColor = themeConfig.accent;

    // Get current date
    const currentDate = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    // Get greeting based on time
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'grid_view' },
        { id: 'orders', label: 'Orders', icon: 'shopping_bag' },
        { id: 'products', label: 'Products', icon: 'sell' },
        { id: 'analytics', label: 'Analytics', icon: 'bar_chart' },
        { id: 'settings', label: 'Settings', icon: 'tune' },
    ] as const;

    const socialIcons = [
        { name: 'Instagram', svg: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z', hoverBg: 'linear-gradient(135deg, #833AB4, #E1306C)' },
        { name: 'TikTok', svg: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.65-1.62-1.12-1.09-1.01-1.79-2.37-2.09-3.86v7.35c0 3.32-2.11 6.27-5.27 7.37-3.15 1.1-6.72-.05-8.8-2.85-2.09-2.81-2.09-6.68 0-9.49 2.08-2.8 5.65-3.95 8.8-2.85.18.06.36.14.53.21v4.29c-.31-.19-.64-.34-.99-.44-1.72-.49-3.56.24-4.57 1.74-1 1.49-1 3.42 0 4.91 1 1.49 2.84 2.22 4.57 1.73 1.72-.49 2.87-2.07 2.87-3.86v-12.16z', hoverBg: '#000000' },
        { name: 'Facebook', svg: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036c-2.148 0-2.797 1.603-2.797 2.898v1.073h4.454l-.45 3.667h-3.994v7.987h-5.027z', hoverBg: '#1877F2' },
    ];

    return (
        <div
            className="flex h-screen w-full overflow-hidden font-display"
            style={{
                background: `radial-gradient(at 40% 20%, ${primaryColor}15 0px, transparent 50%), radial-gradient(at 80% 0%, ${accentColor}10 0px, transparent 50%), radial-gradient(at 0% 50%, ${primaryColor}08 0px, transparent 50%), radial-gradient(at 80% 50%, ${accentColor}08 0px, transparent 50%), ${themeConfig.background}`
            }}
        >
            {/* Side Navigation */}
            <aside className="hidden md:flex flex-col w-72 h-full p-6 z-20 sticky top-0">
                <div
                    className="w-full h-full rounded-2xl flex flex-col justify-between p-6 backdrop-blur-xl border shadow-lg"
                    style={{
                        backgroundColor: `${themeConfig.surface}90`,
                        borderColor: `${themeConfig.border}60`
                    }}
                >
                    {/* Header */}
                    <div className="flex flex-col gap-6">
                        <Link to="/" className="flex items-center gap-3 px-2">
                            <div
                                className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/50 shadow-sm flex items-center justify-center"
                                style={{ backgroundColor: primaryColor }}
                            >
                                <span className="material-symbols-outlined text-white text-xl">auto_awesome</span>
                            </div>
                            <div>
                                <h1 className="text-base font-bold leading-tight" style={{ color: themeConfig.text }}>Vibe Shop</h1>
                                <p className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>Vendor Portal</p>
                            </div>
                        </Link>

                        {/* Nav Items */}
                        <nav className="flex flex-col gap-2 mt-4">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveSection(item.id)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeSection === item.id
                                        ? 'font-bold'
                                        : 'font-medium hover:opacity-80'
                                        }`}
                                    style={{
                                        backgroundColor: activeSection === item.id ? `${primaryColor}15` : 'transparent',
                                        color: activeSection === item.id ? primaryColor : themeConfig.textSecondary
                                    }}
                                >
                                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                                    <span className="text-sm">{item.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Bottom Section */}
                    <div className="flex flex-col gap-4">
                        {/* Gemini Widget */}
                        <div
                            className="relative overflow-hidden rounded-xl border p-4 shadow-sm"
                            style={{
                                background: `linear-gradient(135deg, ${primaryColor}10, ${accentColor}10)`,
                                borderColor: `${themeConfig.border}60`
                            }}
                        >
                            <div
                                className="absolute -right-4 -top-4 w-16 h-16 rounded-full blur-xl"
                                style={{ backgroundColor: `${primaryColor}30` }}
                            ></div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-[18px]" style={{ color: primaryColor }}>colors_spark</span>
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: primaryColor }}>Gemini Tips</span>
                            </div>
                            <p className="text-xs leading-relaxed font-medium" style={{ color: themeConfig.text }}>
                                Complete your KYC to unlock payouts and connect socials to start your vibe.
                            </p>
                        </div>

                        <div className="h-px" style={{ background: `linear-gradient(to right, transparent, ${themeConfig.border}, transparent)` }}></div>

                        {/* Profile */}
                        <button
                            className="flex items-center gap-3 px-2 py-2 rounded-xl transition-colors"
                            style={{ backgroundColor: 'transparent' }}
                        >
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                            >
                                <span className="material-symbols-outlined text-[18px]">person</span>
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold" style={{ color: themeConfig.text }}>Nepal Crafts</p>
                                <p className="text-[10px]" style={{ color: themeConfig.textSecondary }}>Vendor ID: #8821</p>
                            </div>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full overflow-y-auto relative z-10">
                <div className="px-6 md:px-12 py-8 max-w-[1440px] mx-auto w-full">
                    {/* Header Section */}
                    <header className="flex flex-wrap justify-between items-end gap-4 mb-10">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 mb-1" style={{ color: themeConfig.textSecondary }}>
                                <span className="text-sm font-medium">{getGreeting()}</span>
                                <span className="material-symbols-outlined text-[16px]">wb_sunny</span>
                            </div>
                            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                Welcome back, <span
                                    className="bg-clip-text"
                                    style={{
                                        backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        backgroundClip: 'text',
                                        color: 'transparent'
                                    }}
                                >Nepal Crafts</span>
                            </h2>
                            <p className="text-base md:text-lg max-w-xl" style={{ color: themeConfig.textSecondary }}>
                                Here is what is happening with your store today. You have pending actions.
                            </p>
                        </div>
                        <div
                            className="px-4 py-2 rounded-full flex items-center gap-2 shadow-sm text-sm font-medium backdrop-blur-xl border cursor-pointer transition-colors"
                            style={{
                                backgroundColor: `${themeConfig.surface}80`,
                                borderColor: `${themeConfig.border}60`,
                                color: themeConfig.text
                            }}
                        >
                            <span className="material-symbols-outlined text-[18px]" style={{ color: themeConfig.textSecondary }}>calendar_today</span>
                            <span>{currentDate}</span>
                        </div>
                    </header>

                    {/* Bento Grid Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[minmax(180px,auto)]">

                        {/* 1. Action Required Card */}
                        <div
                            className="md:col-span-12 lg:col-span-8 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden backdrop-blur-xl border"
                            style={{
                                backgroundColor: `${themeConfig.surface}80`,
                                borderColor: '#DE628640',
                                boxShadow: '0 0 40px -10px rgba(222, 98, 134, 0.25)'
                            }}
                        >
                            <div
                                className="absolute -left-10 -bottom-10 w-64 h-64 rounded-full blur-[80px] pointer-events-none"
                                style={{ backgroundColor: '#DE628615' }}
                            ></div>
                            <div className="flex flex-col md:flex-row items-start gap-6 relative z-10 flex-1">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center border border-red-200 text-[#DE6286] shadow-inner flex-shrink-0">
                                    <span className="material-symbols-outlined text-[32px]">gpp_maybe</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <h3 className="text-xl md:text-2xl font-bold" style={{ color: themeConfig.text }}>Action Required: Verification Pending</h3>
                                        <span className="bg-red-100 text-[#DE6286] text-xs font-bold px-2 py-1 rounded-md border border-red-200/50 uppercase tracking-wide">High Priority</span>
                                    </div>
                                    <p className="text-base leading-relaxed max-w-xl" style={{ color: themeConfig.textSecondary }}>
                                        Your payouts are currently paused. Please complete your KYC verification to unlock full vendor features and start receiving payments.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/vendor/onboarding?step=2')}
                                className="relative z-10 flex items-center justify-center gap-2 text-white px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide shadow-lg transition-all active:scale-95 whitespace-nowrap min-w-[160px]"
                                style={{ backgroundColor: primaryColor, boxShadow: `0 10px 30px -10px ${primaryColor}60` }}
                            >
                                <span>Verify Now</span>
                                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                            </button>
                        </div>

                        {/* 2. Recent Posts */}
                        <div
                            className="md:col-span-6 lg:col-span-4 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden backdrop-blur-xl border transition-all hover:-translate-y-0.5"
                            style={{
                                backgroundColor: `${themeConfig.surface}80`,
                                borderColor: `${themeConfig.border}60`
                            }}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-bold" style={{ color: themeConfig.text }}>Recent Posts</h3>
                                <button
                                    className="p-1.5 rounded-lg transition-colors"
                                    style={{ color: primaryColor }}
                                >
                                    <span className="material-symbols-outlined text-[20px]">add</span>
                                </button>
                            </div>
                            <div
                                className="flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all hover:border-opacity-80"
                                style={{ borderColor: themeConfig.border }}
                            >
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                                    style={{ backgroundColor: `${themeConfig.border}50` }}
                                >
                                    <span className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>post_add</span>
                                </div>
                                <p className="text-sm font-semibold" style={{ color: themeConfig.text }}>Create your first post</p>
                                <p className="text-xs mt-1" style={{ color: themeConfig.textSecondary }}>Start engaging your audience</p>
                            </div>
                        </div>

                        {/* 3. Social Hub Card */}
                        <div
                            className="md:col-span-6 lg:col-span-5 rounded-2xl p-6 md:p-8 flex flex-col justify-between relative backdrop-blur-xl border transition-all hover:-translate-y-0.5"
                            style={{
                                backgroundColor: `${themeConfig.surface}80`,
                                borderColor: `${themeConfig.border}60`
                            }}
                        >
                            <div
                                className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] pointer-events-none"
                                style={{ backgroundColor: `${accentColor}15` }}
                            ></div>
                            <div className="flex flex-col gap-1 mb-6 relative z-10">
                                <h3 className="text-lg font-bold" style={{ color: themeConfig.text }}>Social Connections</h3>
                                <p className="text-sm" style={{ color: themeConfig.textSecondary }}>Enable AI post generation by connecting your accounts.</p>
                            </div>
                            <div className="flex items-center gap-4 mb-8">
                                {socialIcons.map((social) => (
                                    <div key={social.name} className="flex flex-col items-center gap-2 group cursor-pointer">
                                        <div
                                            className="w-14 h-14 rounded-2xl border flex items-center justify-center transition-all duration-300 shadow-sm group-hover:text-white"
                                            style={{
                                                backgroundColor: `${themeConfig.border}30`,
                                                borderColor: themeConfig.border,
                                                color: themeConfig.textSecondary
                                            }}
                                        >
                                            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                                                <path d={social.svg} />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>{social.name}</span>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => navigate('/vendor/onboarding?step=3')}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-bold text-sm transition-all"
                                style={{
                                    borderColor: `${primaryColor}50`,
                                    color: primaryColor
                                }}
                            >
                                <span>Connect Accounts</span>
                                <span className="material-symbols-outlined text-[18px]">link</span>
                            </button>
                        </div>

                        {/* 4. Sales Overview */}
                        <div
                            className="md:col-span-12 lg:col-span-7 rounded-2xl p-6 md:p-8 flex flex-col relative overflow-hidden backdrop-blur-xl border transition-all hover:-translate-y-0.5"
                            style={{
                                backgroundColor: `${themeConfig.surface}80`,
                                borderColor: `${themeConfig.border}60`
                            }}
                        >
                            <div className="flex items-center justify-between mb-8 relative z-10">
                                <div>
                                    <h3 className="text-lg font-bold" style={{ color: themeConfig.text }}>Sales Overview</h3>
                                    <p className="text-sm" style={{ color: themeConfig.textSecondary }}>Real-time performance tracking</p>
                                </div>
                                <div className="flex gap-2">
                                    <span
                                        className="px-3 py-1 rounded-full text-xs font-semibold border"
                                        style={{
                                            backgroundColor: `${themeConfig.surface}80`,
                                            borderColor: themeConfig.border,
                                            color: themeConfig.textSecondary
                                        }}
                                    >Weekly</span>
                                </div>
                            </div>

                            {/* Empty State */}
                            <div className="flex-1 flex flex-col items-center justify-center py-6 relative z-10">
                                <div className="relative w-48 h-32 mb-6">
                                    <div className="absolute bottom-0 left-0 w-8 h-12 rounded-t-lg" style={{ backgroundColor: `${themeConfig.border}50` }}></div>
                                    <div className="absolute bottom-0 left-10 w-8 h-20 rounded-t-lg" style={{ backgroundColor: `${themeConfig.border}50` }}></div>
                                    <div className="absolute bottom-0 left-20 w-8 h-8 rounded-t-lg" style={{ backgroundColor: `${themeConfig.border}50` }}></div>
                                    <div className="absolute bottom-0 left-[7.5rem] w-8 h-16 rounded-t-lg" style={{ backgroundColor: `${themeConfig.border}50` }}></div>
                                    <div className="absolute bottom-0 right-0 w-8 h-24 rounded-t-lg" style={{ backgroundColor: `${themeConfig.border}50` }}></div>

                                    <div
                                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 backdrop-blur-sm p-3 rounded-full shadow-sm border"
                                        style={{ backgroundColor: `${themeConfig.surface}cc`, borderColor: themeConfig.border }}
                                    >
                                        <span className="material-symbols-outlined text-[24px]" style={{ color: themeConfig.textSecondary }}>bar_chart_off</span>
                                    </div>
                                </div>
                                <h4 className="text-base font-bold mb-1" style={{ color: themeConfig.text }}>No data available yet</h4>
                                <p className="text-sm max-w-xs text-center" style={{ color: themeConfig.textSecondary }}>Start selling products to see your analytics and stats populate here.</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-12 text-center pb-8 opacity-60">
                        <p className="text-xs font-medium tracking-wide uppercase" style={{ color: themeConfig.textSecondary }}>Vibe Shop Vendor Console © 2024</p>
                    </div>
                </div>
            </main>

            {/* Mobile Bottom Nav */}
            <div
                className="fixed bottom-0 left-0 w-full backdrop-blur-xl border-t p-4 flex justify-between md:hidden z-50"
                style={{
                    backgroundColor: `${themeConfig.surface}ee`,
                    borderColor: `${themeConfig.border}60`
                }}
            >
                {[
                    { id: 'dashboard', icon: 'grid_view', label: 'Home' },
                    { id: 'orders', icon: 'shopping_bag', label: 'Orders' },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id as DashboardSection)}
                        className="flex flex-col items-center gap-1"
                        style={{ color: activeSection === item.id ? primaryColor : themeConfig.textSecondary }}
                    >
                        <span className="material-symbols-outlined">{item.icon}</span>
                        <span className={`text-[10px] ${activeSection === item.id ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                    </button>
                ))}

                {/* Center Add Button */}
                <div
                    className="relative -top-8 rounded-full p-4 shadow-lg border-4"
                    style={{
                        backgroundColor: primaryColor,
                        borderColor: themeConfig.surface,
                        boxShadow: `0 10px 30px -10px ${primaryColor}60`
                    }}
                >
                    <span className="material-symbols-outlined text-white">add</span>
                </div>

                {[
                    { id: 'analytics', icon: 'bar_chart', label: 'Stats' },
                    { id: 'settings', icon: 'person', label: 'Profile' },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id as DashboardSection)}
                        className="flex flex-col items-center gap-1"
                        style={{ color: activeSection === item.id ? primaryColor : themeConfig.textSecondary }}
                    >
                        <span className="material-symbols-outlined">{item.icon}</span>
                        <span className={`text-[10px] ${activeSection === item.id ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default VendorDashboardPage;
