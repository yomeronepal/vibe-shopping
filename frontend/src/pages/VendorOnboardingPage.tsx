import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { vendorApi, saveAiSetup, generateStoreBio } from '../api/vendor';
import { getConnectUrl, getInstagramConnectUrl, importPageProfile, listConnectedPages } from '../api/socials';
import { useShopTheme, type ShopTheme } from '../contexts/ShopThemeContext';

const AI_PREVIEWS: Record<string, string> = {
    professional: 'Namaste! Yo product Rs. 2,200 ma available chha. Order garna chahanuhunchha bhane details share garnus.',
    casual: 'Namaste! 😍 Yo ta Rs. 2,200 ma paincha ni! Linus na — details pathaunus matra!',
    default: 'Namaste! Yo product Rs. 2,200 ma available chha. Order garna man lage bhannus hai!',
};

const CATEGORIES = ['Fashion & Apparel', 'Home & Living', 'Tech & Gadgets', 'Art & Collectibles', 'Beauty & Wellness', 'Sports & Outdoors'];

const VendorOnboardingPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { theme: selectedShopTheme, setTheme: setShopTheme, config: themeConfig, allThemes, setAiThemeConfig } = useShopTheme();

    // Initialize step from URL parameter or default to 1
    const initialStep = parseInt(searchParams.get('step') || '1', 10);
    const [step, setStep] = useState(initialStep >= 1 && initialStep <= 5 ? initialStep : 1);
    const [loading, setLoading] = useState(false);

    // Sync step with URL changes
    useEffect(() => {
        const urlStep = parseInt(searchParams.get('step') || '1', 10);
        if (urlStep >= 1 && urlStep <= 5) {
            setStep(urlStep);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    useEffect(() => {
        const loadSavedTheme = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    navigate('/vendor/login');
                    return;
                }

                const status = await vendorApi.getOnboardingStatus();
                console.log('Onboarding status:', status);

                if (status.is_complete) {
                    navigate('/vendor');
                    return;
                }

                if (status.ai_theme) {
                    setAiAnalysis(status.ai_theme);

                    if (status.ai_theme.recommended_preset) {
                        setAiRecommendedTheme(status.ai_theme.recommended_preset);
                    }

                    const palette = status.ai_theme.custom_palette || status.ai_theme.colors;
                    if (palette) {
                        console.log('Loading saved AI theme palette:', palette);
                        const aiTheme = {
                            name: 'AI Generated',
                            description: status.ai_theme.recommendation_reason || 'Custom theme from your logo',
                            primary: palette.primary,
                            accent: palette.accent,
                            background: palette.background,
                            surface: palette.surface,
                            text: palette.text,
                            textSecondary: palette.textSecondary,
                            border: palette.border,
                            cardBg: palette.cardBg,
                            buttonBg: palette.buttonBg || palette.primary,
                            buttonText: palette.buttonText || '#ffffff',
                            gradient: palette.gradient || `linear-gradient(135deg, ${palette.primary} 0%, ${palette.accent} 100%)`,
                            textGradient: palette.textGradient || `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`
                        };

                        setAiThemeConfig(aiTheme);
                    }
                }
            } catch (error) {
                console.error('Failed to load onboarding status:', error);
                navigate('/vendor/login');
            }
        };
        loadSavedTheme();
    }, [setAiThemeConfig, navigate]);

    // Step 1: Profile state
    const [shopName, setShopName] = useState('');
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [offering, setOffering] = useState<'products' | 'services' | 'both'>('products');
    const [contactPhone, setContactPhone] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactAddress, setContactAddress] = useState('');
    const [kDelivery, setKDelivery] = useState('');
    const [kPayment, setKPayment] = useState('');
    const [kReturns, setKReturns] = useState('');
    const [kFaqs, setKFaqs] = useState('');
    const [aiTone, setAiTone] = useState('');
    const [aiLanguage, setAiLanguage] = useState('mixed');
    const [autoReply, setAutoReply] = useState(true);
    const [pageConnected, setPageConnected] = useState(false);
    const [importing, setImporting] = useState(false);
    const [bio, setBio] = useState('');
    const [bioSells, setBioSells] = useState('');
    const [bioAudience, setBioAudience] = useState('');
    const [bioSpecial, setBioSpecial] = useState('');
    const [generatingBio, setGeneratingBio] = useState(false);
    const [aiPersona, setAiPersona] = useState(65);
    const [logo, setLogo] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Step 2: KYC state
    const [panVatNumber, setPanVatNumber] = useState('');
    const [businessRegNo, setBusinessRegNo] = useState('');
    const [kycDocument, setKycDocument] = useState<File | null>(null);
    const [kycDocPreview, setKycDocPreview] = useState<string | null>(null);

    // AI Theme Recommendation state
    const [aiRecommendedTheme, setAiRecommendedTheme] = useState<string | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<any>(null);
    const [analyzingLogo, setAnalyzingLogo] = useState(false);


    const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogo(file);
            const reader = new FileReader();
            reader.onloadend = () => setLogoPreview(reader.result as string);
            reader.readAsDataURL(file);

            setAnalyzingLogo(true);
            try {
                const result = await vendorApi.analyzeLogoForTheme(file);
                console.log('Logo analysis result:', result);

                if (result.analysis) {
                    setAiRecommendedTheme(result.analysis.recommended_theme);
                    setAiAnalysis(result.analysis);

                    const palette = result.analysis.custom_palette || result.analysis.colors;
                    console.log('Extracted palette:', palette);

                    if (palette) {
                        const aiTheme = {
                            name: 'AI Generated',
                            description: result.analysis.recommendation_reason || 'Custom theme from your logo',
                            primary: palette.primary,
                            accent: palette.accent,
                            background: palette.background,
                            surface: palette.surface,
                            text: palette.text,
                            textSecondary: palette.textSecondary,
                            border: palette.border,
                            cardBg: palette.cardBg,
                            buttonBg: palette.buttonBg || palette.primary,
                            buttonText: palette.buttonText || '#ffffff',
                            gradient: palette.gradient || `linear-gradient(135deg, ${palette.primary} 0%, ${palette.accent} 100%)`,
                            textGradient: palette.textGradient || `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`
                        };

                        console.log('Setting AI theme config:', aiTheme);
                        setAiThemeConfig(aiTheme);
                        setShopTheme('ai-generated');
                    }
                }
            } catch (error) {
                console.error('Failed to analyze logo:', error);
            } finally {
                setAnalyzingLogo(false);
            }
        }
    };


    const handleKycDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setKycDocument(file);
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => setKycDocPreview(reader.result as string);
                reader.readAsDataURL(file);
            } else {
                setKycDocPreview(file.name);
            }
        }
    };

    const handleGenerateBio = async () => {
        if (bioSells.trim().length < 3) {
            toast.error('Tell us what you sell first');
            return;
        }
        setGeneratingBio(true);
        try {
            const result = await generateStoreBio({
                sells: bioSells.trim(),
                audience: bioAudience.trim(),
                special: bioSpecial.trim(),
            });
            setBio(result.bio);
            toast.success('Bio drafted — edit it however you like');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not generate the bio');
        } finally {
            setGeneratingBio(false);
        }
    };

    useEffect(() => {
        if (step !== 3) return;
        listConnectedPages()
            .then((pages) => setPageConnected(pages.some((p) => p.status === 'connected')))
            .catch(() => {});
    }, [step]);

    const handleStartInstagramConnect = async () => {
        try {
            const url = await getInstagramConnectUrl();
            window.open(url, '_blank');
            toast('Finish connecting in the new tab, then come back here.', { icon: '🔗' });
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not start the Instagram connection.');
        }
    };

    const handleStartConnect = async () => {
        try {
            const url = await getConnectUrl();
            window.open(url, '_blank');
            toast('Finish connecting in the new tab, then come back here.', { icon: '🔗' });
        } catch {
            toast.error('Could not start the Facebook connection.');
        }
    };

    const handleImportFromFacebook = async () => {
        setImporting(true);
        try {
            const result = await importPageProfile();
            if (result.imported.length === 0) {
                toast('Nothing new to import — your profile already has those details.', { icon: 'ℹ️' });
            } else {
                toast.success(`Imported from Facebook: ${result.imported.join(', ')}`);
            }
        } catch {
            toast.error('Could not import from Facebook.');
        } finally {
            setImporting(false);
        }
    };

    const handleNext = async () => {
        setLoading(true);
        try {
            if (step === 1) {
                // Step 1: Save profile data
                if (contactPhone && contactPhone.replace(/[^0-9]/g, '').length < 7) {
                    toast.error('That phone number looks too short');
                    setLoading(false);
                    return;
                }
                await vendorApi.saveOnboardingProfile({
                    bio,
                    category,
                    ai_persona: aiPersona,
                    offering,
                    phone: contactPhone,
                    email: contactEmail,
                    address: contactAddress
                }, logo);
                setStep(2);
            } else if (step === 2) {
                // Step 2: Submit KYC documents
                await vendorApi.submitKYC({
                    pan_vat_number: panVatNumber,
                    business_reg_no: businessRegNo
                }, kycDocument);
                setStep(3);
            } else if (step === 3) {
                await vendorApi.skipSocials();
                setStep(4);
            } else if (step === 4) {
                const knowledge = [
                    kDelivery && `Delivery: ${kDelivery}`,
                    kPayment && `Payment: ${kPayment}`,
                    kReturns && `Returns/Exchange: ${kReturns}`,
                    kFaqs && `Common questions: ${kFaqs}`,
                ].filter(Boolean).join('\n');
                await saveAiSetup({
                    ...(knowledge ? { ai_knowledge: knowledge } : {}),
                    ai_auto_reply: autoReply,
                    ai_tone: aiTone,
                    ai_language: aiLanguage,
                });
                setStep(5);
            } else if (step === 5) {
                // Step 4: Complete onboarding with theme
                await vendorApi.completeOnboarding(selectedShopTheme);
                navigate('/vendor/onboarding/success');
            }
        } catch (error) {
            console.error('Failed to save onboarding data:', error);
        } finally {
            setLoading(false);
        }
    };

    const themeOptions: { key: ShopTheme; badge?: string; isAiGenerated?: boolean }[] = [
        { key: 'ai-generated', badge: 'AI GENERATED', isAiGenerated: true },
        { key: 'neon-vibe', badge: aiRecommendedTheme === 'neon-vibe' ? 'AI PICK' : undefined },
        { key: 'minimal', badge: aiRecommendedTheme === 'minimal' ? 'AI PICK' : undefined },
        { key: 'warm-cozy', badge: aiRecommendedTheme === 'warm-cozy' ? 'AI PICK' : undefined }
    ];


    // Dynamic styles based on theme
    const primaryColor = themeConfig.primary;
    const accentColor = themeConfig.accent;

    return (
        <div
            className="font-jakarta min-h-screen flex flex-col overflow-x-hidden transition-colors duration-500 relative"
            style={{
                backgroundColor: themeConfig.background,
                color: themeConfig.text
            }}
        >
            {/* Decorative Background - theme aware */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
                <div
                    className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] rounded-full blur-[120px] transition-all duration-700"
                    style={{ backgroundColor: `${primaryColor}18` }}
                ></div>
                <div
                    className="absolute bottom-[-10%] right-[-5%] w-[700px] h-[700px] rounded-full blur-[100px] transition-all duration-700"
                    style={{ backgroundColor: `${accentColor}22` }}
                ></div>
                <div
                    className="absolute top-[40%] right-[30%] w-[400px] h-[400px] rounded-full blur-[80px] transition-all duration-700"
                    style={{ backgroundColor: `${primaryColor}0D` }}
                ></div>
            </div>


            {/* Header - theme aware */}
            <header
                className="flex items-center justify-between px-6 py-5 md:px-12 border-b backdrop-blur-md sticky top-0 z-50 transition-colors duration-500"
                style={{ borderColor: `${themeConfig.border}80` }}
            >
                <Link to="/" className="flex items-center gap-3">
                    <div
                        className="size-11 rounded-2xl flex items-center justify-center shadow-sm border transition-colors duration-500"
                        style={{
                            backgroundColor: `${primaryColor}10`,
                            borderColor: themeConfig.surface,
                            color: primaryColor
                        }}
                    >
                        <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                    </div>
                    <h2 className="text-xl font-bold tracking-tight" style={{ color: themeConfig.text }}>BizAlly</h2>
                </Link>

                {/* Progress Steps - Clickable */}
                <div
                    className="hidden md:flex items-center gap-1 px-2 py-1.5 rounded-full border shadow-sm backdrop-blur-xl transition-colors duration-500"
                    style={{
                        backgroundColor: `${themeConfig.surface}99`,
                        borderColor: `${themeConfig.border}80`
                    }}
                >
                    {[
                        { num: 1, label: 'Profile' },
                        { num: 2, label: 'KYC' },
                        { num: 3, label: 'Connect' },
                        { num: 4, label: 'AI Setup' },
                        { num: 5, label: 'Launch' }
                    ].map((s, i) => (
                        <React.Fragment key={s.num}>
                            {i > 0 && <div className="w-px h-4" style={{ backgroundColor: themeConfig.border }}></div>}
                            <button
                                onClick={() => setStep(s.num)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm transition-all duration-300 cursor-pointer hover:opacity-80 ${step === s.num ? 'font-bold rounded-full shadow-sm' : 'font-medium'
                                    }`}
                                style={{
                                    color: step >= s.num ? primaryColor : themeConfig.textSecondary,
                                    backgroundColor: step === s.num ? themeConfig.surface : 'transparent'
                                }}
                            >
                                <span
                                    className="flex items-center justify-center size-5 rounded-full text-[10px] transition-colors duration-500"
                                    style={{
                                        backgroundColor: step > s.num ? `${primaryColor}20` : step === s.num ? primaryColor : themeConfig.border,
                                        color: step >= s.num ? (step === s.num ? '#fff' : primaryColor) : themeConfig.textSecondary
                                    }}
                                >
                                    {step > s.num ? <span className="material-symbols-outlined text-xs font-bold">check</span> : s.num}
                                </span>
                                <span>{s.label}</span>
                            </button>
                        </React.Fragment>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    <button
                        className="hidden sm:flex text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:opacity-80"
                        style={{ color: themeConfig.textSecondary }}
                    >
                        Save Draft
                    </button>
                    <div
                        className="size-11 rounded-full border-2 shadow-md transition-colors duration-500"
                        style={{
                            background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                            borderColor: themeConfig.surface
                        }}
                    ></div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-grow container mx-auto px-4 md:px-8 py-10 max-w-[1400px]">
                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10">
                    <div className="max-w-2xl">
                        {step === 1 && (
                            <>
                                <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-[-0.03em] mb-4" style={{ color: themeConfig.text }}>
                                    Let's curate your <span
                                        className="bg-clip-text"
                                        style={{
                                            backgroundImage: themeConfig.textGradient,
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            color: 'transparent'
                                        }}
                                    >BizAlly</span>
                                </h1>
                                <p className="text-xl font-light leading-relaxed" style={{ color: themeConfig.textSecondary }}>Tell us about your brand so our AI can sync your style.</p>
                            </>
                        )}
                        {step === 2 && (
                            <>
                                <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-[-0.02em] mb-4" style={{ color: themeConfig.text }}>
                                    Vendor <span
                                        className="bg-clip-text"
                                        style={{
                                            backgroundImage: themeConfig.textGradient,
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            color: 'transparent'
                                        }}
                                    >KYC</span> Verification
                                </h1>
                                <p className="text-xl font-light leading-relaxed" style={{ color: themeConfig.textSecondary }}>Comply with Nepal Government regulations to unlock your shop.</p>
                            </>
                        )}
                        {step === 3 && (
                            <>
                                <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-[-0.03em] mb-4" style={{ color: themeConfig.text }}>
                                    Connect Your <span
                                        className="bg-clip-text"
                                        style={{
                                            backgroundImage: themeConfig.textGradient,
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            color: 'transparent'
                                        }}
                                    >Socials</span>
                                </h1>
                                <p className="text-xl font-light leading-relaxed" style={{ color: themeConfig.textSecondary }}>Import products from your social media accounts.</p>
                            </>
                        )}
                        {step === 4 && (
                            <>
                                <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-[-0.03em] mb-4" style={{ color: themeConfig.text }}>
                                    Meet your <span
                                        className="bg-clip-text"
                                        style={{
                                            backgroundImage: themeConfig.textGradient,
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            color: 'transparent'
                                        }}
                                    >AI employee</span>
                                </h1>
                                <p className="text-xl font-light leading-relaxed" style={{ color: themeConfig.textSecondary }}>Teach it your policies and pick its voice — it answers customers 24/7.</p>
                            </>
                        )}
                        {step === 5 && (
                            <>
                                <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-[-0.03em] mb-4" style={{ color: themeConfig.text }}>
                                    Customize & <span
                                        className="bg-clip-text"
                                        style={{
                                            backgroundImage: themeConfig.textGradient,
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            color: 'transparent'
                                        }}
                                    >Launch</span>
                                </h1>
                                <p className="text-xl font-light leading-relaxed max-w-lg" style={{ color: themeConfig.textSecondary }}>Define your digital presence. Our AI has curated themes based on your products.</p>
                            </>
                        )}
                    </div>

                    {/* Mobile Progress */}
                    <div className="md:hidden w-full">
                        <div className="flex justify-between text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: themeConfig.textSecondary }}>
                            <span>Step {step} of 4</span>
                            <span>{Math.round((step / 4) * 100)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: themeConfig.border }}>
                            <div
                                className="h-full rounded-full transition-all"
                                style={{
                                    width: `${(step / 4) * 100}%`,
                                    background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`
                                }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Step 1: Profile */}
                {step === 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-min">
                        {/* Business Profile Card */}
                        <div
                            className="md:col-span-8 backdrop-blur-xl rounded-[2rem] p-8 shadow-sm border relative group transition-colors duration-500"
                            style={{
                                backgroundColor: `${themeConfig.cardBg}ee`,
                                borderColor: `${themeConfig.border}60`
                            }}
                        >
                            <div className="absolute top-6 right-6 opacity-20 group-hover:opacity-40 transition-opacity" style={{ color: primaryColor }}>
                                <span className="material-symbols-outlined text-4xl">storefront</span>
                            </div>
                            <h3 className="text-2xl font-bold mb-1">Business Profile</h3>
                            <p style={{ color: themeConfig.textSecondary }} className="mb-6">The foundation of your digital storefront.</p>

                            {/* Logo Upload */}
                            <div className="flex items-center gap-6 mb-8">
                                <div className="relative">
                                    <div
                                        className={`size-24 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors duration-500`}
                                        style={{
                                            borderColor: logoPreview ? primaryColor : themeConfig.border,
                                            backgroundColor: themeConfig.surface
                                        }}
                                    >
                                        {logoPreview ? (
                                            <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-3xl" style={{ color: themeConfig.border }}>add_photo_alternate</span>
                                        )}
                                    </div>
                                    <input type="file" accept="image/*" onChange={handleLogoChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold mb-1">Company Logo</p>
                                    <p className="text-xs mb-2" style={{ color: themeConfig.textSecondary }}>PNG, JPG up to 2MB</p>
                                    <label className="text-sm font-semibold cursor-pointer hover:opacity-80" style={{ color: primaryColor }}>
                                        <span className="material-symbols-outlined text-sm align-middle mr-1">upload</span>
                                        {logoPreview ? 'Change' : 'Upload'}
                                        <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                                    </label>
                                    {analyzingLogo && (
                                        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: primaryColor }}>
                                            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                            Analyzing logo for theme...
                                        </p>
                                    )}
                                    {aiAnalysis && !analyzingLogo && (
                                        <p className="text-xs mt-2" style={{ color: themeConfig.textSecondary }}>
                                            AI suggests: <span className="font-bold" style={{ color: primaryColor }}>{aiAnalysis.recommended_theme}</span>
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <label className="flex flex-col gap-2">
                                    <span className="text-sm font-bold">Shop Name</span>
                                    <input
                                        className="border rounded-xl px-4 py-3.5 focus:outline-none transition-colors duration-500"
                                        style={{
                                            backgroundColor: themeConfig.surface,
                                            borderColor: themeConfig.border,
                                            color: themeConfig.text
                                        }}
                                        placeholder="e.g. Lunar Boutique"
                                        value={shopName}
                                        onChange={(e) => setShopName(e.target.value)}
                                    />
                                </label>
                                <div className="flex flex-col gap-2 md:col-span-2">
                                    <span className="text-sm font-bold">Contact details <span className="font-normal text-xs" style={{ color: themeConfig.textSecondary }}>— used on invoices and by your AI when customers ask</span></span>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <input
                                            className="border rounded-xl px-4 py-3 focus:outline-none transition-colors duration-500"
                                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                            placeholder="Phone (98XXXXXXXX)"
                                            value={contactPhone}
                                            onChange={(e) => setContactPhone(e.target.value)}
                                        />
                                        <input
                                            className="border rounded-xl px-4 py-3 focus:outline-none transition-colors duration-500"
                                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                            placeholder="Business email"
                                            value={contactEmail}
                                            onChange={(e) => setContactEmail(e.target.value)}
                                        />
                                        <input
                                            className="border rounded-xl px-4 py-3 focus:outline-none transition-colors duration-500"
                                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                            placeholder="Store address"
                                            value={contactAddress}
                                            onChange={(e) => setContactAddress(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 md:col-span-2">
                                    <span className="text-sm font-bold">What does your business offer?</span>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {([
                                            ['products', 'I sell products', 'inventory_2', 'Clothes, gadgets, cosmetics — anything you deliver'],
                                            ['services', 'I offer services', 'event_available', 'Photography, salon, repairs — customers book appointments'],
                                            ['both', 'Both', 'storefront', 'Products to deliver and services to book'],
                                        ] as const).map(([value, label, icon, hint]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setOffering(value)}
                                                className="rounded-2xl border-2 p-4 text-left transition-all"
                                                style={{
                                                    borderColor: offering === value ? themeConfig.primary : themeConfig.border,
                                                    backgroundColor: offering === value ? `${themeConfig.primary}0d` : themeConfig.surface,
                                                }}
                                            >
                                                <span className="material-symbols-outlined" style={{ color: offering === value ? themeConfig.primary : themeConfig.textSecondary }}>{icon}</span>
                                                <p className="font-bold mt-1" style={{ color: themeConfig.text }}>{label}</p>
                                                <p className="text-xs mt-1 leading-snug" style={{ color: themeConfig.textSecondary }}>{hint}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <label className="flex flex-col gap-2">
                                    <span className="text-sm font-bold">Category</span>
                                    <select
                                        className="border rounded-xl px-4 py-3.5 focus:outline-none transition-colors duration-500"
                                        style={{
                                            backgroundColor: themeConfig.surface,
                                            borderColor: themeConfig.border,
                                            color: themeConfig.text
                                        }}
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                    >
                                        {CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2 md:col-span-2">
                                    <span className="text-sm font-bold">Short Bio <span className="font-normal text-xs" style={{ color: themeConfig.textSecondary }}>— your AI learns your shop from this</span></span>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <input
                                            className="border rounded-xl px-4 py-3 focus:outline-none transition-colors duration-500"
                                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                            placeholder="What do you sell? (e.g. Italian-style menswear)"
                                            value={bioSells}
                                            onChange={(e) => setBioSells(e.target.value)}
                                        />
                                        <input
                                            className="border rounded-xl px-4 py-3 focus:outline-none transition-colors duration-500"
                                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                            placeholder="Who is it for? (e.g. young professionals in KTM)"
                                            value={bioAudience}
                                            onChange={(e) => setBioAudience(e.target.value)}
                                        />
                                        <input
                                            className="border rounded-xl px-4 py-3 focus:outline-none transition-colors duration-500"
                                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                            placeholder="What makes you special? (e.g. imported fabric)"
                                            value={bioSpecial}
                                            onChange={(e) => setBioSpecial(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleGenerateBio}
                                        disabled={generatingBio}
                                        className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                                        style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                                        {generatingBio ? 'Writing…' : 'Generate bio with AI'}
                                    </button>
                                    <textarea
                                        className="border rounded-xl px-4 py-3 focus:outline-none resize-none transition-colors duration-500"
                                        style={{
                                            backgroundColor: themeConfig.surface,
                                            borderColor: themeConfig.border,
                                            color: themeConfig.text
                                        }}
                                        placeholder="We sell [what] for [who] in [city]. Known for [what makes you special]."
                                        rows={3}
                                        value={bio}
                                        onChange={(e) => setBio(e.target.value)}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* AI Persona Card */}
                        <div
                            className="md:col-span-12 lg:col-span-4 backdrop-blur-xl rounded-[2rem] p-6 border relative overflow-hidden transition-colors duration-500"
                            style={{
                                backgroundColor: `${themeConfig.cardBg}aa`,
                                borderColor: `${themeConfig.border}60`
                            }}
                        >
                            <div className="absolute -top-10 -right-10 size-32 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: `${primaryColor}15` }}></div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined" style={{ color: primaryColor }}>psychology</span>
                                <h3 className="text-lg font-bold">AI Persona</h3>
                            </div>
                            <p className="text-xs mb-6" style={{ color: themeConfig.textSecondary }}>Adjust how your AI assistant speaks.</p>
                            <div className="flex justify-between text-xs font-bold mb-2" style={{ color: themeConfig.textSecondary }}>
                                <span>Professional</span>
                                <span>Witty</span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={aiPersona}
                                onChange={(e) => setAiPersona(Number(e.target.value))}
                                className="range-slider w-full"
                                style={{ accentColor: primaryColor }}
                            />
                            <div
                                className="p-3 rounded-xl border mt-4 transition-colors duration-500"
                                style={{
                                    backgroundColor: `${themeConfig.surface}99`,
                                    borderColor: `${themeConfig.border}80`
                                }}
                            >
                                <p className="text-xs italic" style={{ color: themeConfig.textSecondary }}>
                                    {aiPersona > 50 ? '"Hey there! Ready to find something amazing?"' : '"Welcome. How may I assist you?"'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: KYC */}
                {step === 2 && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                        <div
                            className="md:col-span-8 backdrop-blur-xl rounded-[2rem] p-8 shadow-sm border relative overflow-hidden flex flex-col gap-8 transition-colors duration-500"
                            style={{
                                backgroundColor: `${themeConfig.cardBg}ee`,
                                borderColor: `${themeConfig.border}60`
                            }}
                        >
                            <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full blur-3xl -z-0" style={{ backgroundColor: `${primaryColor}08` }}></div>
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-2xl font-bold flex items-center gap-2">
                                        <span className="material-symbols-outlined" style={{ color: primaryColor }}>verified_user</span>
                                        Business Details
                                    </h3>
                                    <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold uppercase rounded-lg">Secure</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold">PAN/VAT Number</label>
                                        <input
                                            className="w-full border rounded-2xl px-4 py-3.5 outline-none transition-colors duration-500"
                                            style={{
                                                backgroundColor: themeConfig.surface,
                                                borderColor: themeConfig.border,
                                                color: themeConfig.text
                                            }}
                                            placeholder="Ex: 600123456"
                                            value={panVatNumber}
                                            onChange={(e) => setPanVatNumber(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold">Business Reg. No.</label>
                                        <input
                                            className="w-full border rounded-2xl px-4 py-3.5 outline-none transition-colors duration-500"
                                            style={{
                                                backgroundColor: themeConfig.surface,
                                                borderColor: themeConfig.border,
                                                color: themeConfig.text
                                            }}
                                            placeholder="Ex: 12345-678-90"
                                            value={businessRegNo}
                                            onChange={(e) => setBusinessRegNo(e.target.value)}
                                        />
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-sm font-bold">ID Document</label>
                                        <div
                                            className="border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative"
                                            style={{
                                                borderColor: `${primaryColor}30`,
                                                backgroundColor: `${themeConfig.surface}80`
                                            }}
                                        >
                                            <input type="file" accept="image/*,.pdf" onChange={handleKycDocChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            {kycDocPreview ? (
                                                <>
                                                    <div className="size-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-3">
                                                        <span className="material-symbols-outlined text-2xl">check_circle</span>
                                                    </div>
                                                    <p className="text-sm font-bold text-green-600">Document uploaded</p>
                                                </>
                                            ) : (
                                                <>
                                                    <div
                                                        className="size-14 rounded-full flex items-center justify-center mb-3 shadow-sm border transition-colors duration-500"
                                                        style={{
                                                            backgroundColor: themeConfig.surface,
                                                            color: primaryColor,
                                                            borderColor: `${primaryColor}20`
                                                        }}
                                                    >
                                                        <span className="material-symbols-outlined text-2xl">cloud_upload</span>
                                                    </div>
                                                    <p className="text-sm font-bold">Click to upload</p>
                                                    <p className="text-xs mt-1" style={{ color: themeConfig.textSecondary }}>JPG, PNG or PDF (Max 5MB)</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Sidebar */}
                        <div className="md:col-span-4 flex flex-col gap-6">
                            <div
                                className="backdrop-blur-xl rounded-[2rem] p-6 border relative overflow-hidden transition-colors duration-500"
                                style={{
                                    backgroundColor: `${themeConfig.cardBg}ee`,
                                    borderColor: `${themeConfig.border}60`
                                }}
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <div
                                        className="size-10 rounded-xl flex items-center justify-center text-white shadow-lg"
                                        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
                                    >
                                        <span className="material-symbols-outlined">smart_toy</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold">Gemini AI</h3>
                                        <p className="text-xs" style={{ color: themeConfig.textSecondary }}>Compliance Officer</p>
                                    </div>
                                </div>
                                <p className="text-sm leading-relaxed mb-6" style={{ color: themeConfig.textSecondary }}>
                                    "I encrypt your documents instantly and verify them against the Nepal IRD database."
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Connect */}
                {step === 3 && (
                    <div className="max-w-2xl mx-auto">
                        <div
                            className="backdrop-blur-xl rounded-[2rem] p-10 shadow-sm border transition-colors duration-500"
                            style={{
                                backgroundColor: `${themeConfig.cardBg}ee`,
                                borderColor: `${themeConfig.border}60`
                            }}
                        >
                            <h3 className="text-2xl font-bold mb-2 text-center">Connect your Facebook Page</h3>
                            <p className="text-center mb-8" style={{ color: themeConfig.textSecondary }}>
                                Your AI answers customers on Messenger and Instagram through this Page.
                            </p>
                            {pageConnected ? (
                                <div className="flex flex-col gap-4">
                                    <div
                                        className="flex items-center gap-3 rounded-2xl p-4"
                                        style={{ backgroundColor: '#dcfce7' }}
                                    >
                                        <span className="material-symbols-outlined" style={{ color: '#15803d' }}>check_circle</span>
                                        <p className="font-bold" style={{ color: '#15803d' }}>Facebook Page connected</p>
                                    </div>
                                    <button
                                        onClick={handleImportFromFacebook}
                                        disabled={importing}
                                        className="flex items-center justify-center gap-3 py-4 rounded-2xl font-bold transition-all border-2 disabled:opacity-50"
                                        style={{ borderColor: themeConfig.primary, color: themeConfig.primary }}
                                    >
                                        <span className="material-symbols-outlined">download</span>
                                        {importing ? 'Importing…' : 'Import logo, bio & contact from Facebook'}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={handleStartConnect}
                                        className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white py-4 rounded-2xl font-bold hover:shadow-lg transition-all"
                                    >
                                        <span className="text-lg">Connect Facebook Page</span>
                                    </button>
                                    <button
                                        onClick={handleStartInstagramConnect}
                                        className="w-full flex items-center justify-center gap-3 text-white py-4 rounded-2xl font-bold hover:shadow-lg transition-all"
                                        style={{ background: 'linear-gradient(135deg, #f09433, #dc2743, #bc1888)' }}
                                    >
                                        <span className="text-lg">Connect Instagram only</span>
                                    </button>
                                    <p className="text-xs text-center" style={{ color: themeConfig.textSecondary }}>
                                        Have both? Connect the Facebook Page — a linked Instagram comes with it.
                                    </p>
                                </div>
                            )}
                            <p className="text-center text-sm mt-6" style={{ color: themeConfig.textSecondary }}>
                                Instagram comes along automatically when it is linked to your Page.
                                You can skip this and connect later from Settings.
                            </p>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="max-w-3xl mx-auto flex flex-col gap-6">
                        <div
                            className="backdrop-blur-xl rounded-[2rem] p-8 shadow-sm border transition-colors duration-500"
                            style={{ backgroundColor: `${themeConfig.cardBg}ee`, borderColor: `${themeConfig.border}60` }}
                        >
                            <h3 className="text-xl font-bold mb-1">Teach your AI the basics</h3>
                            <p className="text-sm mb-6" style={{ color: themeConfig.textSecondary }}>
                                It answers customers using only what you tell it. A sentence each is plenty — you can add more later.
                            </p>
                            <div className="flex flex-col gap-4">
                                {([
                                    ['Where do you deliver and what does it cost?', 'e.g. Valley Rs. 100 (1-2 din), bahira Rs. 150-250 (3-5 din)', kDelivery, setKDelivery],
                                    ['What payment do you accept?', 'e.g. Cash on delivery, eSewa, bank transfer', kPayment, setKPayment],
                                    ['Return or exchange policy?', 'e.g. 7 din bhitra exchange, sale items final', kReturns, setKReturns],
                                    ['Anything customers always ask?', 'e.g. Gift wrapping Rs. 50, open Saturday 11-5', kFaqs, setKFaqs],
                                ] as const).map(([label, hint, value, setter]) => (
                                    <label key={label} className="flex flex-col gap-1.5">
                                        <span className="text-sm font-bold">{label}</span>
                                        <input
                                            className="border rounded-xl px-4 py-3 focus:outline-none transition-colors duration-500"
                                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                            placeholder={hint}
                                            value={value}
                                            onChange={(e) => setter(e.target.value)}
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div
                            className="backdrop-blur-xl rounded-[2rem] p-8 shadow-sm border transition-colors duration-500"
                            style={{ backgroundColor: `${themeConfig.cardBg}ee`, borderColor: `${themeConfig.border}60` }}
                        >
                            <h3 className="text-xl font-bold mb-4">Pick its voice</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-sm font-bold">Tone</span>
                                    <select
                                        className="border rounded-xl px-4 py-3 focus:outline-none"
                                        style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                        value={aiTone}
                                        onChange={(e) => setAiTone(e.target.value)}
                                    >
                                        <option value="">Warm & friendly (default)</option>
                                        <option value="professional">Polished & professional</option>
                                        <option value="casual">Casual & playful</option>
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-sm font-bold">Language</span>
                                    <select
                                        className="border rounded-xl px-4 py-3 focus:outline-none"
                                        style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                        value={aiLanguage}
                                        onChange={(e) => setAiLanguage(e.target.value)}
                                    >
                                        <option value="mixed">Nepali-English mix (recommended)</option>
                                        <option value="nepali">Romanized Nepali</option>
                                        <option value="english">English only</option>
                                    </select>
                                </label>
                            </div>
                            <div
                                className="mt-5 rounded-2xl p-4 text-sm leading-relaxed"
                                style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                            >
                                <p className="text-xs font-bold mb-1" style={{ color: themeConfig.textSecondary }}>PREVIEW — how it will reply</p>
                                {AI_PREVIEWS[aiTone] || AI_PREVIEWS.default}
                            </div>
                            <label className="flex items-center justify-between mt-5 cursor-pointer">
                                <div>
                                    <p className="font-bold">Reply to customers automatically</p>
                                    <p className="text-xs" style={{ color: themeConfig.textSecondary }}>
                                        Recommended — it hands tricky conversations to you and never invents prices.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAutoReply(!autoReply)}
                                    className="relative w-12 h-7 rounded-full transition-colors shrink-0"
                                    style={{ backgroundColor: autoReply ? themeConfig.primary : themeConfig.border }}
                                >
                                    <span
                                        className="absolute top-1 size-5 rounded-full bg-white shadow transition-all"
                                        style={{ left: autoReply ? '26px' : '4px' }}
                                    />
                                </button>
                            </label>
                        </div>
                    </div>
                )}

                                {/* Step 5: Theme Selection & Launch */}
                {step === 5 && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-8 flex flex-col gap-8">
                            {/* Theme Selection Card */}
                            <div
                                className="backdrop-blur-xl rounded-[2.5rem] p-8 md:p-10 shadow-sm border relative overflow-hidden transition-colors duration-500"
                                style={{
                                    backgroundColor: `${themeConfig.cardBg}ee`,
                                    borderColor: `${themeConfig.border}60`
                                }}
                            >
                                <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[80px] pointer-events-none -z-0" style={{ backgroundColor: `${primaryColor}08` }}></div>
                                <div className="relative z-10">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                                        <div>
                                            <h3 className="text-2xl font-bold flex items-center gap-3">
                                                <span className="p-2 rounded-xl" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
                                                    <span className="material-symbols-outlined">palette</span>
                                                </span>
                                                AI Theme Selection
                                            </h3>
                                            <p className="text-sm mt-2 font-medium ml-1" style={{ color: themeConfig.textSecondary }}>Select a theme - the page will update instantly!</p>
                                        </div>
                                    </div>

                                    <h4 className="text-lg font-bold mb-4">
                                        Choose Your Theme
                                    </h4>
                                    <p className="text-sm mb-6" style={{ color: themeConfig.textSecondary }}>
                                        {aiAnalysis ? 'AI has analyzed your logo and created a custom theme. You can also choose from our presets.' : 'Upload a logo in Step 1 to unlock your custom AI-generated theme!'}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                        {themeOptions.map(({ key, badge, isAiGenerated }) => {
                                            if (isAiGenerated && key === 'ai-generated') {
                                                const config = allThemes['ai-generated'];
                                                const isSelected = selectedShopTheme === 'ai-generated';
                                                const hasAiAnalysis = aiAnalysis !== null;

                                                console.log('Rendering AI theme card with config:', config);
                                                console.log('Has AI analysis:', hasAiAnalysis);
                                                console.log('AI analysis data:', aiAnalysis);

                                                return (
                                                    <div
                                                        key={key}
                                                        onClick={() => setShopTheme('ai-generated')}
                                                        className={`group/card relative rounded-3xl overflow-hidden border-2 cursor-pointer transition-all duration-500 ${isSelected
                                                            ? 'shadow-[0_10px_40px_-10px_rgba(138,43,226,0.3)] -translate-y-1'
                                                            : 'hover:shadow-xl hover:-translate-y-2'
                                                            } ${!hasAiAnalysis ? 'opacity-75' : ''}`}
                                                        style={{
                                                            backgroundColor: themeConfig.cardBg,
                                                            borderColor: isSelected ? config.primary : themeConfig.border
                                                        }}
                                                    >
                                                        <div className="aspect-[9/16] relative overflow-hidden" style={{ backgroundColor: config.background }}>
                                                            <div className="absolute inset-0 p-4 flex flex-col">
                                                                <div className="h-12 flex items-center justify-between mb-4">
                                                                    <div className="w-8 h-8 rounded-full" style={{ background: config.primary }}></div>
                                                                    <div className="w-4 h-4 rounded-full" style={{ background: config.accent }}></div>
                                                                </div>
                                                                <div className="rounded-2xl p-4 mb-4" style={{ background: config.primary }}>
                                                                    <div className="text-white text-[10px] font-bold opacity-80">FEATURED</div>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div className="aspect-square rounded-xl" style={{ background: config.surface, border: `1px solid ${config.border}` }}></div>
                                                                    <div className="aspect-square rounded-xl" style={{ background: config.surface, border: `1px solid ${config.border}` }}></div>
                                                                </div>
                                                            </div>
                                                            {badge && (
                                                                <div
                                                                    className="absolute top-4 right-4 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 z-20"
                                                                    style={{ background: `linear-gradient(135deg, ${config.primary}, ${config.accent})` }}
                                                                >
                                                                    <span className="material-symbols-outlined text-[12px]">auto_awesome</span> {badge}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="p-5 border-t" style={{ backgroundColor: themeConfig.cardBg, borderColor: themeConfig.border }}>
                                                            <div className="flex justify-between items-center mb-2">
                                                                <h4 className="font-bold">{config.name}</h4>
                                                                <div
                                                                    className="size-6 rounded-full border flex items-center justify-center transition-colors duration-300"
                                                                    style={{
                                                                        borderColor: isSelected ? config.primary : themeConfig.border,
                                                                        backgroundColor: isSelected ? `${config.primary}10` : 'transparent',
                                                                        color: config.primary
                                                                    }}
                                                                >
                                                                    {isSelected && <span className="material-symbols-outlined text-sm">check</span>}
                                                                </div>
                                                            </div>
                                                            <p className="text-xs mb-3" style={{ color: themeConfig.textSecondary }}>
                                                                {hasAiAnalysis ? config.description : 'Upload a logo to generate your custom theme'}
                                                            </p>
                                                            {!hasAiAnalysis && (
                                                                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: themeConfig.textSecondary }}>
                                                                    <span className="material-symbols-outlined text-xs">lock</span>
                                                                    <span>Locked - Upload logo first</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            const config = allThemes[key as ShopTheme];
                                            const isSelected = selectedShopTheme === key;
                                            return (
                                                <div
                                                    key={key}
                                                    onClick={() => setShopTheme(key as ShopTheme)}
                                                    className={`group/card relative rounded-3xl overflow-hidden border-2 cursor-pointer transition-all duration-500 ${isSelected
                                                        ? 'shadow-[0_10px_40px_-10px_rgba(138,43,226,0.3)] -translate-y-1'
                                                        : 'hover:shadow-xl hover:-translate-y-2'
                                                        }`}
                                                    style={{
                                                        backgroundColor: themeConfig.cardBg,
                                                        borderColor: isSelected ? primaryColor : themeConfig.border
                                                    }}
                                                >
                                                    <div className="aspect-[9/16] relative overflow-hidden" style={{ background: config.background }}>
                                                        <div className="absolute inset-0 p-4 flex flex-col">
                                                            <div className="h-12 flex items-center justify-between mb-4">
                                                                <div className="w-8 h-8 rounded-full" style={{ background: config.primary }}></div>
                                                                <div className="w-4 h-4 rounded-full" style={{ background: config.border }}></div>
                                                            </div>
                                                            <div className="rounded-2xl p-4 mb-4" style={{ background: config.primary }}>
                                                                <div className="text-white text-[10px] font-bold opacity-80">FEATURED</div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="aspect-square rounded-xl" style={{ background: config.surface, border: `1px solid ${config.border}` }}></div>
                                                                <div className="aspect-square rounded-xl" style={{ background: config.surface, border: `1px solid ${config.border}` }}></div>
                                                            </div>
                                                        </div>
                                                        {badge && (
                                                            <div
                                                                className="absolute top-4 right-4 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 z-20"
                                                                style={{ backgroundColor: primaryColor }}
                                                            >
                                                                <span className="material-symbols-outlined text-[12px]">auto_awesome</span> {badge}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-5 border-t" style={{ backgroundColor: themeConfig.cardBg, borderColor: themeConfig.border }}>
                                                        <div className="flex justify-between items-center mb-1">
                                                            <h4 className="font-bold">{config.name}</h4>
                                                            <div
                                                                className="size-6 rounded-full border flex items-center justify-center transition-colors duration-300"
                                                                style={{
                                                                    borderColor: isSelected ? primaryColor : themeConfig.border,
                                                                    backgroundColor: isSelected ? `${primaryColor}10` : 'transparent',
                                                                    color: primaryColor
                                                                }}
                                                            >
                                                                {isSelected && <span className="material-symbols-outlined text-sm">check</span>}
                                                            </div>
                                                        </div>
                                                        <p className="text-xs" style={{ color: themeConfig.textSecondary }}>{config.description}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                </div>
                            </div>

                            {/* Mobile Preview */}
                            <div
                                className="backdrop-blur-xl rounded-[2.5rem] p-8 shadow-sm border flex flex-col md:flex-row min-h-[400px] transition-colors duration-500"
                                style={{
                                    backgroundColor: `${themeConfig.cardBg}cc`,
                                    borderColor: `${themeConfig.border}60`
                                }}
                            >
                                <div className="p-6 md:w-1/3 flex flex-col justify-center">
                                    <span
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase w-fit mb-4"
                                        style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }}></span> Live Preview
                                    </span>
                                    <h3 className="text-2xl font-bold mb-4">Mobile Experience</h3>
                                    <p className="text-sm leading-relaxed font-light" style={{ color: themeConfig.textSecondary }}>
                                        Preview how your customers will see your shop with the selected theme.
                                    </p>
                                </div>
                                <div className="md:w-2/3 flex items-center justify-center p-6">
                                    <div className="w-[200px] h-[400px] bg-gray-900 rounded-[2rem] border-4 border-gray-800 overflow-hidden shadow-2xl">
                                        <div className="w-full h-full overflow-hidden transition-colors duration-500" style={{ background: themeConfig.background }}>
                                            <div className="p-4 border-b transition-colors duration-500" style={{ borderColor: themeConfig.border }}>
                                                <div className="font-bold text-sm" style={{ color: themeConfig.text }}>Vibe.</div>
                                            </div>
                                            <div className="p-4">
                                                <div className="rounded-xl p-4 mb-4 transition-colors duration-500" style={{ background: themeConfig.primary }}>
                                                    <div className="text-white text-[10px] font-bold">NEW COLLECTION</div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[1, 2, 3, 4].map(i => (
                                                        <div
                                                            key={i}
                                                            className="aspect-square rounded-lg transition-colors duration-500"
                                                            style={{ background: themeConfig.surface, border: `1px solid ${themeConfig.border}` }}
                                                        ></div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="lg:col-span-4 flex flex-col gap-6 sticky top-24">
                            <div
                                className="rounded-3xl p-6 shadow-lg border transition-colors duration-500"
                                style={{
                                    backgroundColor: themeConfig.cardBg,
                                    borderColor: `${themeConfig.border}60`
                                }}
                            >
                                <div className="flex items-start gap-4 mb-4">
                                    <div
                                        className="size-10 rounded-full flex items-center justify-center text-white shadow-lg"
                                        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
                                    >
                                        <span className="material-symbols-outlined text-xl">smart_toy</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold">Gemini Assistant</h3>
                                        <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: themeConfig.textSecondary }}>Just Now</p>
                                    </div>
                                </div>
                                <div
                                    className="p-4 rounded-2xl rounded-tl-none border text-sm leading-relaxed font-medium transition-colors duration-500"
                                    style={{
                                        backgroundColor: themeConfig.surface,
                                        borderColor: themeConfig.border,
                                        color: themeConfig.textSecondary
                                    }}
                                >
                                    The <span className="font-bold" style={{ color: primaryColor }}>{themeConfig.name}</span> theme is now applied to this entire page. See how it looks!
                                </div>
                            </div>

                            <div
                                className="backdrop-blur-xl rounded-3xl p-6 border transition-colors duration-500"
                                style={{
                                    backgroundColor: `${themeConfig.cardBg}cc`,
                                    borderColor: `${themeConfig.border}60`
                                }}
                            >
                                <h4 className="text-xs font-bold uppercase tracking-wider mb-6" style={{ color: themeConfig.textSecondary }}>Launch Readiness</h4>
                                <div className="space-y-4">
                                    {[
                                        { label: 'Profile Complete', sub: 'Step 1 completed', done: true },
                                        { label: 'KYC Verified', sub: 'Documents approved', done: true },
                                        { label: 'Store Launch', sub: 'Finalizing theme', done: false }
                                    ].map((item, i) => (
                                        <div key={i} className="flex gap-4 items-center">
                                            <div
                                                className={`size-6 rounded-full border-4 flex items-center justify-center transition-colors duration-500 ${!item.done ? 'animate-pulse' : ''}`}
                                                style={{
                                                    backgroundColor: item.done ? '#22c55e' : themeConfig.surface,
                                                    borderColor: item.done ? themeConfig.surface : primaryColor
                                                }}
                                            >
                                                {item.done && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold" style={{ color: item.done ? themeConfig.text : primaryColor }}>{item.label}</p>
                                                <p className="text-xs" style={{ color: themeConfig.textSecondary }}>{item.sub}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-8 right-6 md:right-10 z-50">
                <button
                    onClick={handleNext}
                    disabled={loading}
                    className="group relative text-white pl-8 pr-2 py-2 rounded-full shadow-2xl transition-all duration-300 hover:-translate-y-1 disabled:opacity-50"
                    style={{
                        background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                        boxShadow: `0 20px 40px -10px ${primaryColor}50`
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-start leading-none py-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-70">
                                {step < 5 ? `Step ${step} of 5` : 'Ready to go?'}
                            </span>
                            <span className="font-bold text-lg tracking-tight">
                                {step < 5 ? 'Next Step' : (loading ? 'Launching...' : 'Launch My Store')}
                            </span>
                        </div>
                        <div className="size-12 bg-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12 border border-white/20">
                            <span className="material-symbols-outlined">{step < 5 ? 'arrow_forward' : 'rocket_launch'}</span>
                        </div>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default VendorOnboardingPage;
