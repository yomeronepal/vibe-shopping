import React, { useState, useEffect } from 'react';
import type { VendorSignupData } from '../../../api/vendor';

interface Step1ProfileProps {
    onNext: (data: any) => void;
    initialData: Partial<VendorSignupData>;
}

const Step1Profile: React.FC<Step1ProfileProps> = ({ onNext, initialData }) => {
    const [formData, setFormData] = useState({
        username: initialData.username || '',
        email: initialData.email || '',
        password: initialData.password || '',
        shopName: initialData.store_name || '',
        niche: 'Fashion & Apparel',
        bio: '',
        aiPersona: 65,
        brandVibe: 'Minimal',
    });

    useEffect(() => {
        if (initialData.store_name) {
            setFormData(prev => ({
                ...prev,
                username: initialData.username || prev.username,
                email: initialData.email || prev.email,
                password: initialData.password || prev.password,
                shopName: initialData.store_name!
            }));
        }
    }, [initialData]);

    const niches = [
        "Fashion & Apparel",
        "Home & Living",
        "Tech & Gadgets",
        "Art & Collectibles"
    ];

    const brandVibes = [
        "Minimal", "Bold", "Luxury", "Y2K", "Streetwear", "Sustainable"
    ];

    const currentPersonaText = () => {
        if (formData.aiPersona < 30) return "Professional & Concise";
        if (formData.aiPersona > 70) return "Witty & Playful";
        return "Friendly & Helpful";
    };

    const currentPersonaQuote = () => {
        if (formData.aiPersona < 30) return "\"Welcome to the store. How may I assist you efficiently today?\"";
        if (formData.aiPersona > 70) return "\"Omg hi! Ready to find something totally obsessed-worthy?\"";
        return "\"Hey there! Ready to find something amazing today?\"";
    };


    const handleNext = () => {
        onNext({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            store_name: formData.shopName,
            niche: formData.niche,
            bio: formData.bio,
            brandVibe: formData.brandVibe,
            aiPersona: formData.aiPersona,
        });
    };

    return (
        <div className="flex-grow container mx-auto px-4 md:px-0 py-8 max-w-[1200px]">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div className="max-w-2xl">
                    <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-[-0.03em] mb-3 text-[#150e1b]">
                        Let's curate your <span className="text-transparent bg-clip-text bg-gradient-to-r from-vibe-purple to-purple-400">BizAlly</span>

                    </h1>
                    <p className="text-lg text-[#745095] font-medium">
                        Tell us about your brand so our AI can sync your style.
                    </p>
                </div>
            </div>

            {/* Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-min">

                {/* Card 1: Business Profile (Large, spans 8 cols) */}
                <div className="md:col-span-8 bg-[#FCFAFD] rounded-3xl p-8 shadow-sm border border-white/60 relative group">
                    <div className="absolute top-6 right-6 text-vibe-purple/20 group-hover:text-vibe-purple/40 transition-colors">
                        <span className="material-symbols-outlined text-4xl">storefront</span>
                    </div>
                    <h3 className="text-2xl font-bold mb-1">Business Profile</h3>
                    <p className="text-gray-500 mb-8">The foundation of your digital storefront.</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Auth Fields */}
                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-bold text-[#150e1b]">Username</span>
                            <div className="relative">
                                <input
                                    className="w-full bg-white border border-[#E0D6EB] rounded-xl px-4 py-3.5 text-[#150e1b] placeholder:text-gray-400 focus:outline-none focus:border-vibe-purple focus:ring-4 focus:ring-vibe-purple/10 transition-all font-medium"
                                    placeholder="Username"
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                />
                                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">person</span>
                            </div>
                        </label>

                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-bold text-[#150e1b]">Email</span>
                            <div className="relative">
                                <input
                                    className="w-full bg-white border border-[#E0D6EB] rounded-xl px-4 py-3.5 text-[#150e1b] placeholder:text-gray-400 focus:outline-none focus:border-vibe-purple focus:ring-4 focus:ring-vibe-purple/10 transition-all font-medium"
                                    placeholder="Email Address"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">mail</span>
                            </div>
                        </label>

                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-bold text-[#150e1b]">Password</span>
                            <div className="relative">
                                <input
                                    className="w-full bg-white border border-[#E0D6EB] rounded-xl px-4 py-3.5 text-[#150e1b] placeholder:text-gray-400 focus:outline-none focus:border-vibe-purple focus:ring-4 focus:ring-vibe-purple/10 transition-all font-medium"
                                    placeholder="Create Password"
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">lock</span>
                            </div>
                        </label>

                        <label className="flex flex-col gap-2">
                            <span className="text-sm font-bold text-[#150e1b]">Shop Name</span>
                            <div className="relative">
                                <input
                                    className="w-full bg-white border border-[#E0D6EB] rounded-xl px-4 py-3.5 text-[#150e1b] placeholder:text-gray-400 focus:outline-none focus:border-vibe-purple focus:ring-4 focus:ring-vibe-purple/10 transition-all font-medium"
                                    placeholder="e.g. Lunar Boutique"
                                    type="text"
                                    value={formData.shopName}
                                    onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                                />
                                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">store</span>
                            </div>
                        </label>

                        <label className="flex flex-col gap-2 md:col-span-2">
                            <span className="text-sm font-bold text-[#150e1b]">Niche / Category</span>
                            <div className="relative">
                                <select
                                    className="w-full appearance-none bg-white border border-[#E0D6EB] rounded-xl px-4 py-3.5 text-[#150e1b] focus:outline-none focus:border-vibe-purple focus:ring-4 focus:ring-vibe-purple/10 transition-all font-medium cursor-pointer"
                                    value={formData.niche}
                                    onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                                >
                                    {niches.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">expand_more</span>
                            </div>
                        </label>

                        <label className="flex flex-col gap-2 md:col-span-2">
                            <span className="text-sm font-bold text-[#150e1b]">Short Bio</span>
                            <textarea
                                className="w-full bg-white border border-[#E0D6EB] rounded-xl px-4 py-3 text-[#150e1b] placeholder:text-gray-400 focus:outline-none focus:border-vibe-purple focus:ring-4 focus:ring-vibe-purple/10 transition-all font-medium resize-none"
                                placeholder="Describe your shop in a few words..."
                                rows={2}
                                value={formData.bio}
                                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                            ></textarea>
                        </label>
                    </div>
                </div>

                {/* Card 3: Social Sync Preview (Tall, spans 4 cols, row span 2) */}
                <div className="md:col-span-4 md:row-span-2 bg-[#FCFAFD] rounded-3xl p-6 shadow-sm border border-white/60 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">Social Sync</h3>
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-lg">New</span>
                    </div>

                    <div className="flex-1 bg-gray-50 rounded-2xl border border-dashed border-gray-200 relative overflow-hidden flex flex-col items-center justify-center p-6 text-center group">
                        {/* Background decoration */}
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#8A2BE2_1px,transparent_1px)] [background-size:16px_16px]"></div>

                        <div className="relative z-10 bg-white p-4 rounded-2xl shadow-lg mb-6 transform transition-transform group-hover:scale-105 duration-300">
                            <div className="flex gap-2 mb-3">
                                <div className="size-8 rounded-full bg-gray-200"></div>
                                <div className="flex flex-col gap-1">
                                    <div className="h-2 w-16 bg-gray-200 rounded"></div>
                                    <div className="h-2 w-10 bg-gray-100 rounded"></div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 w-40">
                                <div className="aspect-square bg-gray-100 rounded-lg"></div>
                                <div className="aspect-square bg-gray-100 rounded-lg"></div>
                                <div className="aspect-square bg-gray-100 rounded-lg"></div>
                                <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-gray-300 text-xs">+12</div>
                            </div>
                        </div>

                        <h4 className="text-lg font-bold text-[#150e1b] mb-2">Import from Social</h4>
                        <p className="text-sm text-gray-500 mb-6">Connect your accounts to auto-populate your catalog with AI.</p>

                        <div className="flex gap-3 w-full">
                            <button className="flex-1 flex items-center justify-center gap-2 bg-[#E1306C] text-white py-3 px-4 rounded-xl hover:shadow-lg hover:shadow-pink-500/20 transition-all active:scale-95">
                                <span className="font-bold text-sm">Instagram</span>
                            </button>
                            <button className="flex-1 flex items-center justify-center gap-2 bg-black text-white py-3 px-4 rounded-xl hover:shadow-lg hover:shadow-black/20 transition-all active:scale-95">
                                <span className="font-bold text-sm">TikTok</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Card 2: Brand Vibe (Spans 5 cols) */}
                <div className="md:col-span-6 lg:col-span-5 bg-[#FCFAFD] rounded-3xl p-8 shadow-sm border border-white/60">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-vibe-purple">palette</span>
                        <h3 className="text-xl font-bold">Brand Vibe</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-6">Select keywords that match your aesthetic.</p>
                    <div className="flex flex-wrap gap-3">
                        {brandVibes.map((vibe) => (
                            <button
                                key={vibe}
                                onClick={() => setFormData({ ...formData, brandVibe: vibe })}
                                className={`px-5 py-2.5 rounded-xl border transition-all hover:scale-105 active:scale-95 flex items-center gap-2
                                    ${formData.brandVibe === vibe
                                        ? "border-2 border-vibe-purple bg-vibe-purple/5 text-vibe-purple font-bold shadow-glow"
                                        : "border-[#E0D6EB] bg-white text-gray-600 font-medium hover:border-vibe-purple/50 hover:text-vibe-purple"
                                    }`}
                            >
                                <span>{vibe}</span>
                                {formData.brandVibe === vibe && <span className="material-symbols-outlined text-lg">check</span>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Card 4: Personalization (Glassmorphism, Spans 3 cols) */}
                <div className="md:col-span-6 lg:col-span-3 glass-card rounded-3xl p-6 shadow-glass flex flex-col justify-between relative overflow-hidden">
                    {/* Decorative blurred circle behind */}
                    <div className="absolute -top-10 -right-10 size-32 bg-vibe-purple/20 rounded-full blur-3xl pointer-events-none"></div>

                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="material-symbols-outlined text-vibe-purple text-xl">psychology</span>
                            <h3 className="text-lg font-bold">AI Persona</h3>
                        </div>
                        <p className="text-xs text-gray-600 mb-6 font-medium leading-relaxed">
                            {currentPersonaText()}
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-xs font-bold text-gray-500 mb-2">
                                <span>Professional</span>
                                <span>Witty</span>
                            </div>
                            <input
                                className="range-slider w-full h-2 bg-white/50 rounded-lg appearance-none cursor-pointer"
                                max="100"
                                min="0"
                                type="range"
                                value={formData.aiPersona}
                                onChange={(e) => setFormData({ ...formData, aiPersona: parseInt(e.target.value) })}
                            />
                        </div>
                        <div className="bg-white/60 p-3 rounded-xl border border-white/50">
                            <p className="text-xs text-gray-600 italic">
                                {currentPersonaQuote()}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-6 right-6 md:right-10 z-50">
                <button
                    onClick={handleNext}
                    className="group flex items-center gap-3 bg-vibe-purple text-white pl-6 pr-2 py-2 rounded-full shadow-lg shadow-vibe-purple/30 hover:bg-[#7a22cc] hover:shadow-vibe-purple/50 transition-all duration-300 hover:-translate-y-1"
                >
                    <span className="font-bold text-base">Next Step</span>
                    <div className="size-10 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </div>
                </button>
            </div>

            {/* Decorative Elements - Background */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
                <div className="absolute top-[10%] left-[5%] w-[500px] h-[500px] bg-purple-200/30 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[10%] right-[5%] w-[400px] h-[400px] bg-blue-200/30 rounded-full blur-[80px]"></div>
            </div>

        </div>
    );
};

export default Step1Profile;
