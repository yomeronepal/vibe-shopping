import { useNavigate } from 'react-router-dom';

const ChoosePathPage = () => {
    const navigate = useNavigate();

    return (
        <>
            <style>{`
                /* Font Override for this page */
                .cp-font { font-family: "Plus Jakarta Sans", sans-serif !important; }
                
                /* Custom Animations */
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                    100% { transform: translateY(0px); }
                }
                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }
                .magnetic-hover {
                    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .magnetic-hover:hover {
                    transform: scale(1.02) translateY(-5px);
                }
                
                /* Color Variables */
                .text-cp-primary { color: #8a2ce2; }
                .bg-cp-primary { background-color: #8a2ce2; }
                .bg-cp-primary\\/10 { background-color: rgba(138, 44, 226, 0.1); }
                .bg-cp-primary\\/20 { background-color: rgba(138, 44, 226, 0.2); }
                .text-cp-primary\\/5 { color: rgba(138, 44, 226, 0.05); }
                .shadow-cp-primary\\/20 { box-shadow: 0 10px 15px -3px rgba(138, 44, 226, 0.2); }
                .selection\\:bg-cp-primary::selection { background-color: #8a2ce2; }
                
                .text-cp-bg-dark { color: #3e2b4f; }
                .text-cp-bg-dark\\/70 { color: rgba(62, 43, 79, 0.7); }
                .text-cp-bg-dark\\/60 { color: rgba(62, 43, 79, 0.6); }
                .text-cp-bg-dark\\/40 { color: rgba(62, 43, 79, 0.4); }
                
                .shadow-glow-purple { box-shadow: 0 0 20px rgba(138, 44, 226, 0.3); }
                .shadow-glass { box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07); }
            `}</style>

            <div className="cp-font bg-gradient-to-br from-[#E0BBE4] via-[#dcbedf] to-[#957DAD] min-h-screen flex flex-col antialiased selection:bg-[#8a2ce2] selection:text-white overflow-x-hidden">
                {/* Top Navigation */}
                <header className="w-full px-6 py-6 md:px-12 z-50 relative">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => navigate('/')}>
                            <div className="size-8 rounded-full bg-[#8a2ce2]/10 flex items-center justify-center backdrop-blur-sm border border-white/20">
                                <span className="material-symbols-outlined text-[#8a2ce2] text-[20px] font-bold">bolt</span>
                            </div>
                            <h2 className="text-[#3e2b4f] text-xl font-bold tracking-tight">Vibe Shop</h2>
                        </div>
                        <button onClick={() => navigate('/vendor/login')} className="flex items-center justify-center px-6 h-10 rounded-full bg-white/40 hover:bg-white/60 text-[#3e2b4f] text-sm font-bold tracking-wide transition-all backdrop-blur-md border border-white/30 shadow-sm">
                            Login
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-grow flex flex-col items-center justify-center px-4 py-8 relative w-full z-10">
                    {/* Abstract Background Shapes */}
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-300/30 rounded-full blur-3xl -z-10 mix-blend-multiply animate-pulse"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#8a2ce2]/20 rounded-full blur-3xl -z-10 mix-blend-multiply animate-pulse" style={{ animationDelay: '2s' }}></div>

                    <div className="w-full max-w-5xl mx-auto flex flex-col items-center">
                        {/* Page Heading */}
                        <div className="text-center mb-12 md:mb-16">
                            <h1 className="text-[#3e2b4f] text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 drop-shadow-sm">
                                How will you use Vibe Shop?
                            </h1>
                            <p className="text-[#3e2b4f]/70 text-lg md:text-xl font-medium max-w-2xl mx-auto">
                                Select your experience to get started.
                            </p>
                        </div>

                        {/* Bento Grid Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full">
                            {/* Vendor Card (Dark/Gradient Theme) */}
                            <div onClick={() => navigate('/vendor/signup')} className="group relative flex flex-col justify-between h-[420px] md:h-[500px] w-full p-8 md:p-12 rounded-3xl bg-gradient-to-br from-[#8a2ce2] to-[#5e1db3] text-white shadow-2xl magnetic-hover overflow-hidden cursor-pointer border border-white/10">
                                {/* Decorative Background Icon */}
                                <span className="material-symbols-outlined absolute -bottom-12 -right-12 text-[200px] text-white/5 rotate-12 select-none pointer-events-none group-hover:rotate-6 transition-transform duration-700">storefront</span>

                                <div className="relative z-10">
                                    <div className="size-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-8 border border-white/20 shadow-glow-purple">
                                        <span className="material-symbols-outlined text-3xl text-white">sync_saved_locally</span>
                                    </div>
                                    <h3 className="text-3xl font-bold mb-4 leading-tight">I'm a Creator / Vendor</h3>
                                    <p className="text-white/80 text-lg leading-relaxed font-medium">
                                        I want to sell & sync my social vibe. Automate your store with AI-driven content generation.
                                    </p>
                                </div>

                                <div className="relative z-10 mt-auto pt-8">
                                    <button className="w-full h-14 bg-white text-[#8a2ce2] hover:bg-purple-50 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-colors shadow-lg group-hover:shadow-white/20">
                                        Start Selling Free
                                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                    </button>
                                </div>
                            </div>

                            {/* Shopper Card (Glassmorphism Theme) */}
                            <div onClick={() => navigate('/products')} className="group relative flex flex-col justify-between h-[420px] md:h-[500px] w-full p-8 md:p-12 rounded-3xl bg-white/30 backdrop-blur-xl border border-white/60 text-[#3e2b4f] shadow-glass magnetic-hover overflow-hidden cursor-pointer">
                                {/* Decorative Background Icon */}
                                <span className="material-symbols-outlined absolute -top-8 -right-8 text-[180px] text-[#8a2ce2]/5 rotate-[-12deg] select-none pointer-events-none group-hover:rotate-[-6deg] transition-transform duration-700">local_mall</span>

                                <div className="relative z-10">
                                    <div className="size-16 rounded-2xl bg-white/60 backdrop-blur-md flex items-center justify-center mb-8 border border-white/50 shadow-sm">
                                        <span className="material-symbols-outlined text-3xl text-[#8a2ce2]">local_mall</span>
                                    </div>
                                    <h3 className="text-3xl font-bold mb-4 leading-tight">I'm a Shopper</h3>
                                    <p className="text-[#3e2b4f]/70 text-lg leading-relaxed font-medium">
                                        I want to discover & shop the vibe. Explore curated trends and aesthetic finds tailored to you.
                                    </p>
                                </div>

                                <div className="relative z-10 mt-auto pt-8">
                                    <button className="w-full h-14 bg-[#8a2ce2] text-white hover:bg-[#7a25c9] rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-colors shadow-lg" style={{ boxShadow: '0 10px 15px -3px rgba(138, 44, 226, 0.2)' }}>
                                        Start Shopping
                                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Footer */}
                <footer className="w-full py-8 text-center relative z-10">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8">
                            <a className="text-[#3e2b4f]/60 hover:text-[#8a2ce2] text-sm font-medium transition-colors" href="#">Help Center</a>
                            <a className="text-[#3e2b4f]/60 hover:text-[#8a2ce2] text-sm font-medium transition-colors" href="#">Privacy Policy</a>
                            <a className="text-[#3e2b4f]/60 hover:text-[#8a2ce2] text-sm font-medium transition-colors" href="#">Terms of Service</a>
                        </div>
                        <p className="text-[#3e2b4f]/40 text-sm">© 2024 Vibe Shop. All rights reserved.</p>
                    </div>
                </footer>
            </div>
        </>
    );
};

export default ChoosePathPage;
