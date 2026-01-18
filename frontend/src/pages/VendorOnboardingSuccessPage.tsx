import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useShopTheme } from '../contexts/ShopThemeContext';

const VendorOnboardingSuccessPage: React.FC = () => {
    const navigate = useNavigate();
    const { config: themeConfig } = useShopTheme();
    const [copied, setCopied] = useState(false);

    const shopUrl = 'vibeshop.com/neon-vibe'; // This would come from backend/context

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(`https://${shopUrl}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const primaryColor = themeConfig.primary;
    const accentColor = themeConfig.accent;

    return (
        <div
            className="font-display min-h-screen flex flex-col overflow-x-hidden relative"
            style={{
                backgroundColor: themeConfig.background,
                color: themeConfig.text
            }}
        >
            {/* Animated Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
                {/* Blurred gradient orbs */}
                <div
                    className="absolute top-[-10%] left-[-10%] w-[900px] h-[900px] rounded-full blur-[120px] animate-pulse"
                    style={{ backgroundColor: `${primaryColor}25` }}
                ></div>
                <div
                    className="absolute bottom-[-10%] right-[-5%] w-[800px] h-[800px] rounded-full blur-[100px]"
                    style={{ backgroundColor: `${accentColor}20` }}
                ></div>
                <div
                    className="absolute top-[40%] right-[30%] w-[500px] h-[500px] rounded-full blur-[80px]"
                    style={{ backgroundColor: `${themeConfig.surface}90` }}
                ></div>

                {/* Floating decorative icons */}
                <div className="absolute top-[15%] left-[5%] text-6xl opacity-20 animate-bounce" style={{ color: primaryColor, animationDuration: '3s' }}>
                    <span className="material-symbols-outlined">local_mall</span>
                </div>
                <div className="absolute top-[25%] right-[8%] text-5xl opacity-15 animate-pulse" style={{ color: accentColor, animationDuration: '4s' }}>
                    <span className="material-symbols-outlined">star</span>
                </div>
                <div className="absolute bottom-[20%] left-[10%] text-4xl opacity-20 animate-bounce" style={{ color: primaryColor, animationDuration: '5s' }}>
                    <span className="material-symbols-outlined">auto_awesome</span>
                </div>
                <div className="absolute bottom-[30%] right-[15%] text-5xl opacity-15 animate-pulse" style={{ color: accentColor, animationDuration: '3.5s' }}>
                    <span className="material-symbols-outlined">storefront</span>
                </div>

                {/* Confetti */}
                {[...Array(12)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute -top-10 animate-confetti-fall"
                        style={{
                            left: `${5 + i * 8}%`,
                            width: `${6 + (i % 3) * 4}px`,
                            height: `${8 + (i % 4) * 6}px`,
                            backgroundColor: i % 3 === 0 ? primaryColor : i % 3 === 1 ? accentColor : '#fbbf24',
                            borderRadius: i % 2 === 0 ? '2px' : '50%',
                            animationDuration: `${3 + (i % 4) * 0.8}s`,
                            animationDelay: `${i * 0.25}s`
                        }}
                    ></div>
                ))}
            </div>

            {/* Header */}
            <header
                className="flex items-center justify-between px-6 py-6 md:px-12 backdrop-blur-sm sticky top-0 z-50"
                style={{ borderColor: `${themeConfig.border}40` }}
            >
                <Link to="/" className="flex items-center gap-3">
                    <div
                        className="size-10 rounded-2xl flex items-center justify-center shadow-sm border"
                        style={{
                            backgroundColor: `${themeConfig.surface}ee`,
                            borderColor: themeConfig.surface,
                            color: primaryColor
                        }}
                    >
                        <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                    </div>
                    <h2 className="text-xl font-bold tracking-tight" style={{ color: themeConfig.text }}>Vibe Shop</h2>
                </Link>

                {/* Progress indicator showing completion - clickable to go back */}
                <div
                    className="hidden md:flex items-center gap-1 px-2 py-1.5 rounded-full border shadow-sm backdrop-blur-xl"
                    style={{
                        backgroundColor: `${themeConfig.surface}99`,
                        borderColor: `${themeConfig.border}80`
                    }}
                >
                    {[
                        { num: 1, label: 'Profile' },
                        { num: 2, label: 'KYC' },
                        { num: 3, label: 'Connect' },
                        { num: 4, label: 'Launch' }
                    ].map((s, i) => (
                        <React.Fragment key={s.num}>
                            {i > 0 && <div className="w-px h-4" style={{ backgroundColor: themeConfig.border }}></div>}
                            <button
                                onClick={() => s.num < 4 && navigate(`/vendor/onboarding?step=${s.num}`)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm transition-all duration-300 ${s.num === 4 ? 'font-bold rounded-full shadow-sm cursor-default' : 'font-medium cursor-pointer hover:opacity-80'
                                    }`}
                                style={{
                                    color: s.num === 4 ? primaryColor : themeConfig.textSecondary,
                                    backgroundColor: s.num === 4 ? themeConfig.surface : 'transparent'
                                }}
                                disabled={s.num === 4}
                            >
                                <span
                                    className="flex items-center justify-center size-5 rounded-full text-[10px] transition-colors duration-500"
                                    style={{
                                        backgroundColor: s.num === 4 ? primaryColor : '#22c55e',
                                        color: '#fff',
                                        boxShadow: s.num === 4 ? `0 0 15px ${primaryColor}50` : undefined
                                    }}
                                >
                                    <span className="material-symbols-outlined text-xs font-bold">
                                        {s.num === 4 ? 'rocket_launch' : 'check'}
                                    </span>
                                </span>
                                <span>{s.num === 4 ? 'Live!' : s.label}</span>
                            </button>
                        </React.Fragment>
                    ))}
                </div>

                <div
                    className="size-10 rounded-full border-2 shadow-md"
                    style={{
                        background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                        borderColor: themeConfig.surface
                    }}
                ></div>
            </header>

            {/* Main Content */}
            <main className="flex-grow flex flex-col items-center justify-center relative px-4 pb-10 z-10">
                <div className="w-full max-w-lg relative mt-6 animate-fade-in">
                    {/* Success Card */}
                    <div
                        className="rounded-[24px] p-8 md:p-12 text-center shadow-xl border backdrop-blur-xl relative overflow-hidden"
                        style={{
                            backgroundColor: `${themeConfig.cardBg}ee`,
                            borderColor: `${themeConfig.border}80`
                        }}
                    >
                        {/* Glow effect behind card */}
                        <div
                            className="absolute top-[-50px] left-[50%] -translate-x-1/2 w-[300px] h-[300px] rounded-full blur-[60px] pointer-events-none"
                            style={{ backgroundColor: `${primaryColor}20` }}
                        ></div>

                        {/* Celebration Icon */}
                        <div className="relative mx-auto size-24 mb-8">
                            <div
                                className="absolute inset-0 rounded-full animate-ping opacity-20"
                                style={{ backgroundColor: `${primaryColor}30` }}
                            ></div>
                            <div
                                className="relative size-24 rounded-full shadow-lg flex items-center justify-center border"
                                style={{
                                    background: `linear-gradient(135deg, ${themeConfig.surface}, white)`,
                                    borderColor: `${primaryColor}20`
                                }}
                            >
                                <span className="material-symbols-outlined text-5xl animate-bounce" style={{ color: primaryColor }}>celebration</span>
                            </div>
                            <span className="absolute -top-2 -right-2 text-yellow-400 material-symbols-outlined text-xl animate-bounce" style={{ animationDelay: '100ms' }}>star</span>
                            <span className="absolute bottom-0 -left-2 material-symbols-outlined text-lg animate-pulse" style={{ color: accentColor, animationDelay: '700ms' }}>spark</span>
                            <span className="absolute top-0 -left-1 text-pink-400 material-symbols-outlined text-sm animate-ping" style={{ animationDelay: '500ms' }}>star</span>
                        </div>

                        {/* Title */}
                        <h1
                            className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight leading-tight"
                            style={{ color: primaryColor }}
                        >
                            Your Shop is Live!
                        </h1>
                        <p
                            className="font-medium text-lg mb-10 leading-relaxed max-w-xs mx-auto"
                            style={{ color: themeConfig.textSecondary }}
                        >
                            Your digital storefront is open for business. The world is ready for your vibe.
                        </p>

                        {/* Shop URL with Copy */}
                        <div
                            className="rounded-[20px] p-2 pl-5 flex items-center justify-between shadow-inner mb-10 backdrop-blur-md border transition-all hover:shadow-lg"
                            style={{
                                backgroundColor: `${themeConfig.surface}90`,
                                borderColor: themeConfig.border
                            }}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="size-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse"></div>
                                <span className="font-semibold truncate text-sm tracking-wide" style={{ color: themeConfig.textSecondary }}>{shopUrl}</span>
                            </div>
                            <button
                                onClick={handleCopyLink}
                                className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-[16px] shadow-sm border transition-all active:scale-95 relative"
                                style={{
                                    backgroundColor: themeConfig.surface,
                                    borderColor: copied ? `${primaryColor}40` : themeConfig.border,
                                    color: copied ? primaryColor : themeConfig.textSecondary
                                }}
                            >
                                <span className="material-symbols-outlined text-sm align-middle mr-1">
                                    {copied ? 'check_circle' : 'content_copy'}
                                </span>
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="grid grid-cols-3 gap-4 mb-10">
                            {[
                                { icon: 'post_add', label: 'Create Post' },
                                { icon: 'dashboard', label: 'Dashboard' },
                                { icon: 'ios_share', label: 'Share Store' }
                            ].map((action, i) => (
                                <button
                                    key={action.label}
                                    className="flex flex-col items-center gap-3 p-4 rounded-[20px] border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group"
                                    style={{
                                        backgroundColor: `${themeConfig.surface}50`,
                                        borderColor: 'transparent'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = themeConfig.surface;
                                        e.currentTarget.style.borderColor = `${primaryColor}20`;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = `${themeConfig.surface}50`;
                                        e.currentTarget.style.borderColor = 'transparent';
                                    }}
                                >
                                    <div
                                        className="size-12 rounded-2xl shadow-sm border flex items-center justify-center transition-all group-hover:shadow-lg"
                                        style={{
                                            backgroundColor: themeConfig.surface,
                                            borderColor: themeConfig.border,
                                            color: themeConfig.textSecondary
                                        }}
                                    >
                                        <span
                                            className="material-symbols-outlined text-2xl transition-colors group-hover:animate-bounce"
                                            style={{ animationDelay: `${i * 100}ms` }}
                                        >{action.icon}</span>
                                    </div>
                                    <span
                                        className="text-[11px] font-bold uppercase tracking-wide transition-colors"
                                        style={{ color: themeConfig.textSecondary }}
                                    >{action.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Main CTA Button */}
                        <button
                            onClick={() => navigate('/vendor')}
                            className="group w-full py-4 rounded-[20px] text-white font-bold text-lg shadow-xl transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden"
                            style={{
                                background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                                boxShadow: `0 20px 40px -10px ${primaryColor}40`
                            }}
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                Enter Dashboard
                                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </span>
                            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </button>
                    </div>

                    {/* Bottom floating message */}
                    <div className="mt-8 flex justify-center">
                        <div
                            className="rounded-full px-6 py-3 flex items-center gap-3 shadow-xl backdrop-blur-md border transition-transform hover:scale-105 cursor-default animate-bounce"
                            style={{
                                backgroundColor: `${themeConfig.surface}cc`,
                                borderColor: `${themeConfig.border}60`,
                                animationDuration: '3s'
                            }}
                        >
                            <div
                                className="size-8 rounded-full p-[2px] shadow-lg"
                                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
                            >
                                <div
                                    className="w-full h-full rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: themeConfig.surface }}
                                >
                                    <span
                                        className="material-symbols-outlined text-sm bg-clip-text"
                                        style={{
                                            backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            color: 'transparent'
                                        }}
                                    >auto_awesome</span>
                                </div>
                            </div>
                            <span className="text-sm font-semibold" style={{ color: themeConfig.text }}>
                                Your vibe is officially out there. Let's make some sales!
                            </span>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default VendorOnboardingSuccessPage;
