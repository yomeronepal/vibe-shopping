import React from 'react';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
    return (
        <>
            <style>{`
                /* Custom soft lavender background gradient */
                .lavender-gradient {
                    background: linear-gradient(135deg, #fdfbfd 0%, #f4f0f8 100%);
                }
                .glass-panel {
                    background: rgba(255, 255, 255, 0.6);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                }
                .bento-card-hover {
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .bento-card-hover:hover {
                    transform: translateY(-4px) scale(1.01);
                    box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.05);
                }
                /* Subtle animated grain overlay for texture */
                .noise-bg {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 50;
                    opacity: 0.03;
                    background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuBadwoL6ivtSDB4LMEauAcIGtmBaE1s5ds6Nzp_cLKYIVJuYLrWmebu5eVNX-lMsYjZ8zCa-ji0uKcNVW8jV1MCmx_BJck_uzHnSzw0HkDSBnbhCR_7uarCCMmhR4Qmyj7Z6EaF5NZg0NYk4KXKkTyqKq6bwj9MUKuidTEUinD_LbRzZGimPbssiZsqlK73dlzHtVIAR2RXKuypPILZ77ifKRttU8sIwQxHasAgFI4i5iKfZvPdZ8zTNytVo17FeYdfo_bE4b36zJB1');
                }
                @keyframes scan {
                    0%, 100% { transform: translateY(-300%); opacity: 0; }
                    50% { opacity: 1; }
                    100% { transform: translateY(300%); opacity: 0; }
                }
                
                /* Font override */
                .hp-font { font-family: "Spline Sans", sans-serif; }
            `}</style>

            <div className="hp-font lavender-gradient min-h-screen text-[#181811] overflow-x-hidden selection:bg-[#f9f506] selection:text-black">
                <div className="noise-bg"></div>

                {/* Navigation */}
                <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4">
                    <nav className="glass-panel rounded-full px-2 py-2 flex items-center justify-between gap-8 max-w-4xl w-full shadow-sm hover:shadow-md transition-shadow duration-300">
                        <div className="flex items-center gap-2 pl-4">
                            <div className="size-8 bg-black rounded-full flex items-center justify-center text-[#f9f506]">
                                <span className="material-symbols-outlined text-[20px]">bolt</span>
                            </div>
                            <span className="font-bold text-lg tracking-tight">Vibe Shop</span>
                        </div>
                        <div className="hidden md:flex items-center gap-1">
                            <a className="px-5 py-2 text-sm font-medium hover:bg-black/5 rounded-full transition-colors" href="#">Features</a>
                            <a className="px-5 py-2 text-sm font-medium hover:bg-black/5 rounded-full transition-colors" href="#">Pricing</a>
                            <a className="px-5 py-2 text-sm font-medium hover:bg-black/5 rounded-full transition-colors" href="#">Creators</a>
                        </div>
                        <div className="flex items-center gap-2 pr-1">
                            <Link className="hidden sm:block text-sm font-bold px-5 py-2" to="/vendor/login">Log In</Link>
                            <Link to="/choose-path" className="bg-[#f9f506] text-black px-6 py-2.5 rounded-full text-sm font-bold hover:bg-[#ebe815] transition-colors" style={{ boxShadow: '0 0 40px -10px rgba(249, 245, 6, 0.5)' }}>
                                Start Free
                            </Link>
                        </div>
                    </nav>
                </div>

                <main className="pt-32 pb-20 px-4 md:px-8 max-w-7xl mx-auto flex flex-col gap-24">
                    {/* Hero Section */}
                    <section className="flex flex-col lg:flex-row gap-12 items-center">
                        {/* Left: Content */}
                        <div className="flex flex-col gap-8 flex-1 max-w-xl text-center lg:text-left pt-10 lg:pt-0">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 border border-white/50 w-fit mx-auto lg:mx-0 shadow-sm">
                                <span className="flex h-2 w-2 rounded-full bg-[#8A2BE2] animate-pulse"></span>
                                <span className="text-xs font-semibold tracking-wide uppercase text-gray-600">Now with TikTok Shop Sync</span>
                            </div>
                            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight">
                                Turn Followers into <span className="relative inline-block text-[#8A2BE2]">Customers
                                    <svg className="absolute w-full h-3 -bottom-1 left-0 text-[#f9f506] opacity-80" preserveAspectRatio="none" viewBox="0 0 100 10">
                                        <path d="M0 5 Q 50 10 100 5" fill="none" stroke="currentColor" strokeWidth="8"></path>
                                    </svg>
                                </span> with AI.
                            </h1>
                            <p className="text-lg text-gray-600 leading-relaxed max-w-md mx-auto lg:mx-0">
                                Sync your social feeds directly to your store. Let our AI tag your products instantly, turning every post into a checkout point.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center lg:justify-start">
                                <Link to="/choose-path" className="group relative px-8 py-4 bg-[#8A2BE2] text-white rounded-full font-bold text-lg hover:bg-[#6e22b5] transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden" style={{ boxShadow: '0 0 30px -5px rgba(138, 43, 226, 0.4)' }}>
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                                    <span className="flex items-center gap-2">
                                        Sync Your Vibe
                                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                    </span>
                                </Link>
                                <button className="px-8 py-4 bg-white text-black border border-gray-200 rounded-full font-bold text-lg hover:bg-gray-50 transition-colors">
                                    View Demo
                                </button>
                            </div>
                            <div className="pt-4 flex items-center gap-4 justify-center lg:justify-start text-sm text-gray-500 font-medium">
                                <div className="flex -space-x-3">
                                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDNSMWwi3LsNr9iruDoIUb4QKKNDO2Vb-3XhXfqzIE8S40onnn8wnSpuOhSwRf3V-A7Vx9yBOc2LVkZjqY6w1JeVDtDHZgH7WQpPLr0_Kb1i4bFDFRCHbb9xl1B_3CEC9YuBbWxfO_6KhjgITerGTPpDkrX3G61xnymmaSLrqu7LFuCjw7FZuRNZCbZyOWdqsUDMmf7W9YAp5YZ7jSWrz6KWLe0c9nLtRigYC3dzlZgOSQefWYTBrO_EG-GnnmcNt8L8V-lZYl25P5x')" }}></div>
                                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-300 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAzlggyDeo5diYZwowecBxSaobABPoC95Iv06JorJriTST3dL9HohMaq-G3kmMTFyzyjh67QyP2TGbZ7Xz5Pc8XPeb8JfJlavWKMS-QZDNK2lV1T-D4FTZDhWKysBFtwaqVhWUknKtwdpJJuxT9q8HFLHyhvxFCtaRc3VtSO3CN9XHTJeilhS2uxoiirtz2ir_lG5J4p4PhBKbxVMt2qYMd5F_u-cha4SoEr7Jb0nE7ub7AHIAaqDZoR3moUxxaUU-3QjH30--elnvJ')" }}></div>
                                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-400 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB8G_Lm8KiIExUt5HjnM4HG0uVlQLgaSTXocHoc5x9gto-kA5hlgD2iAKNqID_b-JlKPu-2vbOZwOY4EP8_d9XUTif_uOsoDLraVjQxklwm0_CMzXnpMH4RuUcIRV94hNqqJsFPOuqECgGSTeodoE8f7NT2j3LnD2KpprKWJzkYS4PVB6XI_o5_7W3fgV_vINLIF1n0u-LJJ17kNS6a0Fyi82k2RdcMzdfkqrzQAIiqaSO5y-7Peus2ocu52mvHrBXJiinkU_4mTADJ')" }}></div>
                                </div>
                                <p>Trusted by 500+ Gen Z Brands</p>
                            </div>
                        </div>

                        {/* Right: Bento Grid Hero Visual */}
                        <div className="flex-1 w-full relative">
                            {/* Decorative blurred blobs behind grid */}
                            <div className="absolute top-10 -right-10 w-72 h-72 bg-[#f9f506]/30 rounded-full blur-[80px]"></div>
                            <div className="absolute -bottom-10 left-10 w-64 h-64 bg-[#8A2BE2]/20 rounded-full blur-[80px]"></div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 auto-rows-[180px]">
                                {/* Tile 1: Video Post */}
                                <div className="row-span-2 rounded-3xl overflow-hidden relative group bento-card-hover shadow-lg">
                                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBy33pBotmJligWABLU68f-llH8m9UPm165T3_ehuSPR1hrBQYnH0ipiPiS2Z69u1Cvpj3HkZ8vAGPbi_NLGiz7vQCbTAxqYDSGbuCwQumJ2UHgzJkO5bnCEua_5dDI_Opg5EX-jbsA6TAeQOD-pSsRVlt2BX3FNR-fhIHV_vT_wVg32kCcI_wuFlsRxjILrvAfMwGgsNGrQE01V3ThEIxn5_I_3VLmcQRGEv04s6D9-wUhVnYMOXKalrbej-p-0HqT1qU23UnTRFxu')" }}></div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                    <div className="absolute bottom-4 left-4 text-white">
                                        <div className="bg-white/20 backdrop-blur-md rounded-full px-3 py-1 text-xs font-bold inline-flex items-center gap-1 mb-2">
                                            <span className="material-symbols-outlined text-[14px]">shopping_bag</span> Shop Look
                                        </div>
                                        <p className="font-bold text-sm">Summer Drop '24</p>
                                    </div>
                                </div>
                                {/* Tile 2: Product Card Transformation */}
                                <div className="rounded-3xl bg-white p-4 relative overflow-hidden bento-card-hover shadow-sm border border-white/60">
                                    <div className="absolute top-3 right-3 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">IN STOCK</div>
                                    <div className="h-24 w-full bg-gray-100 rounded-xl mb-3 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCq3jtRyqdIHEIpNrVVX6SRgHifwAqgt6MRdA-PvwQH04kuQswxTAhPJBg9veHR4FFDr7qCJo2AclkhRyI6BfnJpPtDSkHIbBPTqQadTgFRIiux7RQv74uzQxaDA1JVf4QVSFjF0kCrVBaQ1VGoXJnpknXELXZPofYr2bKifZ6DOK5Hwj9iymuIRDhcxtjZBna4b8zz98crGQjB0oeg3GJuHBDMWBKVG79vhiAhLUXR6s661lDlNCFbSc0s81O3VgQ1-Ah7-GJrSqI_')" }}></div>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-xs text-gray-500 font-medium">Nike Air Max</p>
                                            <p className="text-sm font-bold">$129.00</p>
                                        </div>
                                        <button className="bg-black text-white rounded-full p-1.5 hover:bg-[#f9f506] hover:text-black transition-colors">
                                            <span className="material-symbols-outlined text-[16px] block">add</span>
                                        </button>
                                    </div>
                                </div>
                                {/* Tile 3: Analytics/Data */}
                                <div className="col-span-1 md:col-span-1 rounded-3xl bg-black text-white p-5 flex flex-col justify-between bento-card-hover shadow-lg relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#f9f506]/20 blur-2xl rounded-full"></div>
                                    <div>
                                        <span className="material-symbols-outlined text-[#f9f506] mb-2">trending_up</span>
                                        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Conversion</p>
                                        <p className="text-3xl font-bold text-white">+142%</p>
                                    </div>
                                    <div className="h-1 w-full bg-gray-800 rounded-full mt-2 overflow-hidden">
                                        <div className="h-full bg-[#f9f506] w-[70%]"></div>
                                    </div>
                                </div>
                                {/* Tile 4: Social Icon Connect */}
                                <div className="rounded-3xl bg-[#E8F0FE] p-4 flex items-center justify-center relative overflow-hidden bento-card-hover">
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent opacity-50"></div>
                                    <div className="flex items-center -space-x-4">
                                        <div className="w-12 h-12 rounded-full bg-white shadow-md flex items-center justify-center z-10">
                                            <span className="material-symbols-outlined text-pink-500">photo_camera</span>
                                        </div>
                                        <div className="w-12 h-12 rounded-full bg-black shadow-md flex items-center justify-center z-20 text-white">
                                            <span className="material-symbols-outlined">music_note</span>
                                        </div>
                                        <div className="w-12 h-12 rounded-full bg-[#f9f506] shadow-md flex items-center justify-center z-30">
                                            <span className="material-symbols-outlined">storefront</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Tile 5: Large Image */}
                                <div className="col-span-2 md:col-span-1 row-span-1 md:row-span-2 rounded-3xl overflow-hidden relative bento-card-hover shadow-lg group">
                                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAgbl5aPWr_BkSM-HqIZ5k0MJlMaMkSex5LIPeGAdRJVWY_VKvRUAuuQM0LrTdrVJnL4dadP8CeigdrlWNTz0mG_-NlFqYrTbfgi5t4Hx0iihJGVkG9iyHxx7vMm6Ulc_wZr4jtAdVLeqgO-n1XxhR7kNr1Am5y0BixlkNpFQShjjxDaAbL5WRIFDc9xBhi-cr3iy28kyOVqsOWV69YFyh08a9EtDFqbMafg-kNwtTvEk8GMJfhNg6jUxt-zWswFo7FCXnkBCc4Rqmj')" }}></div>
                                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur rounded-full p-2 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="material-symbols-outlined block">arrow_outward</span>
                                    </div>
                                </div>
                                {/* Tile 6: Small Highlight */}
                                <div className="rounded-3xl bg-[#f9f506]/20 border border-[#f9f506]/30 p-4 flex flex-col justify-center items-center text-center bento-card-hover">
                                    <p className="text-xs font-bold uppercase tracking-widest text-yellow-900 mb-1">New Feature</p>
                                    <p className="font-bold text-lg text-yellow-950">Auto-Tagging</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Logo Ticker */}
                    <div className="w-full overflow-hidden py-6 border-y border-black/5 bg-white/30 backdrop-blur-sm">
                        <div className="flex gap-16 items-center justify-center opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
                            <span className="text-xl font-bold">ACME Co.</span>
                            <span className="text-xl font-bold">LUMINA</span>
                            <span className="text-xl font-bold">RIPPLE</span>
                            <span className="text-xl font-bold">FOCAL</span>
                            <span className="text-xl font-bold hidden sm:block">QUARTZ</span>
                            <span className="text-xl font-bold hidden sm:block">VELOCITY</span>
                        </div>
                    </div>

                    {/* How It Works Section */}
                    <section className="flex flex-col items-center gap-16 py-10 relative">
                        <div className="text-center max-w-2xl mx-auto space-y-4">
                            <h2 className="text-4xl font-bold tracking-tight">Sync, Scan, Sell.</h2>
                            <p className="text-gray-500 text-lg">Our AI does the heavy lifting so you can focus on creating the vibe.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                            {/* Step 1: Connect */}
                            <div className="group flex flex-col gap-6 p-8 rounded-[2.5rem] bg-white border border-white/60 shadow-xl hover:shadow-2xl transition-all duration-300 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10 font-bold text-9xl text-gray-300 select-none group-hover:text-[#f9f506] transition-colors">1</div>
                                <div className="relative z-10 w-16 h-16 rounded-2xl bg-[#E8F0FE] flex items-center justify-center text-blue-600 mb-2">
                                    <span className="material-symbols-outlined text-3xl">link</span>
                                </div>
                                <div className="relative z-10 space-y-2">
                                    <h3 className="text-2xl font-bold">Connect</h3>
                                    <p className="text-gray-500 leading-relaxed">Link your social media accounts with a single secure click. We support all major platforms.</p>
                                </div>
                                {/* Visual for step 1 */}
                                <div className="mt-auto pt-8 flex justify-center">
                                    <div className="flex -space-x-4">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 shadow-lg border-4 border-white"></div>
                                        <div className="w-12 h-12 rounded-full bg-black shadow-lg border-4 border-white flex items-center justify-center">
                                            <div className="w-1.5 h-3 border-r-2 border-b-2 border-white transform rotate-45 mb-1 ml-0.5"></div>
                                        </div>
                                        <div className="w-12 h-12 rounded-full bg-blue-500 shadow-lg border-4 border-white"></div>
                                    </div>
                                </div>
                            </div>
                            {/* Step 2: AI Scan (Featured) */}
                            <div className="group flex flex-col gap-6 p-8 rounded-[2.5rem] bg-black text-white shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 relative overflow-hidden md:scale-105 z-10 ring-8 ring-white/50">
                                <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black"></div>
                                {/* Pulsing glow effect */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-[#f9f506]/20 rounded-full blur-[50px] animate-pulse"></div>
                                <div className="absolute top-0 right-0 p-8 opacity-20 font-bold text-9xl text-gray-700 select-none">2</div>
                                <div className="relative z-10 w-16 h-16 rounded-2xl bg-[#f9f506]/20 flex items-center justify-center text-[#f9f506] mb-2 border border-[#f9f506]/20">
                                    <span className="material-symbols-outlined text-3xl">view_in_ar</span>
                                </div>
                                <div className="relative z-10 space-y-2">
                                    <h3 className="text-2xl font-bold text-[#f9f506]">AI Scan</h3>
                                    <p className="text-gray-400 leading-relaxed">Our vision AI scans your content, identifies products, and matches them to your inventory.</p>
                                </div>
                                {/* Visual for step 2 */}
                                <div className="mt-auto pt-8 relative h-24 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                                    <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDmdKjfaqUWAD-5JVst3zWNJ9_6Q8CJlKReKX_tpL2CYdmVpLONqI6KqqiIArlbXbdGnkh_DUItfNCodbMYhdbPj3iv79iQsgQNMgLuA6ZJUY6LS4a0BEs1SBZGHTTiOg4xpqMKHlvwCjTnqt2CfuZrCIHo2-6Ih7ZhisCLlvHp7xWAD9UD0hY8ooVhuKp6gv91jbomONUNAAVQ8SCxYDBrcuVfS7mAdK7hAf2ptdgLK-QphQyu194p2SviEvcS_8T-oc3cLDlA35V6')" }}></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-full h-0.5 bg-[#f9f506]" style={{ boxShadow: '0 0 10px rgba(249,245,6,0.8)', animation: 'scan 2s ease-in-out infinite' }}></div>
                                    </div>
                                    {/* Bounding boxes */}
                                    <div className="absolute top-4 left-10 w-12 h-8 border border-[#f9f506]/60 rounded-sm"></div>
                                    <div className="absolute bottom-6 right-12 w-10 h-10 border border-[#f9f506]/60 rounded-sm"></div>
                                </div>
                            </div>
                            {/* Step 3: Launch */}
                            <div className="group flex flex-col gap-6 p-8 rounded-[2.5rem] bg-white border border-white/60 shadow-xl hover:shadow-2xl transition-all duration-300 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10 font-bold text-9xl text-gray-300 select-none group-hover:text-[#8A2BE2] transition-colors">3</div>
                                <div className="relative z-10 w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center text-[#8A2BE2] mb-2">
                                    <span className="material-symbols-outlined text-3xl">rocket_launch</span>
                                </div>
                                <div className="relative z-10 space-y-2">
                                    <h3 className="text-2xl font-bold">Launch</h3>
                                    <p className="text-gray-500 leading-relaxed">Your store updates automatically. Watch as passive followers turn into active buyers.</p>
                                </div>
                                {/* Visual for step 3 */}
                                <div className="mt-auto pt-8 flex justify-center items-center relative h-16">
                                    <button className="bg-black text-white px-6 py-2 rounded-full font-bold text-sm shadow-lg transform group-hover:scale-110 transition-transform duration-300 z-10">
                                        Shop Now
                                    </button>
                                    {/* Confetti bits (simulated with dots) */}
                                    <div className="absolute w-2 h-2 bg-[#f9f506] rounded-full top-2 left-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75"></div>
                                    <div className="absolute w-2 h-2 bg-[#8A2BE2] rounded-full bottom-2 right-12 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100"></div>
                                    <div className="absolute w-1.5 h-1.5 bg-pink-500 rounded-full top-0 right-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-150"></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CTA Section */}
                    <section className="py-20">
                        <div className="bg-[#8A2BE2] rounded-[3rem] p-8 md:p-16 text-center text-white relative overflow-hidden flex flex-col items-center gap-8 shadow-2xl">
                            {/* Background decorations */}
                            <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
                            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#f9f506] rounded-full blur-[100px] opacity-40"></div>
                            <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-500 rounded-full blur-[100px] opacity-40"></div>
                            <div className="relative z-10 max-w-2xl mx-auto space-y-6">
                                <h2 className="text-4xl md:text-6xl font-bold leading-tight tracking-tight">Ready to vibe?</h2>
                                <p className="text-white/80 text-xl font-medium">Join the social commerce revolution. 14-day free trial, no credit card required.</p>
                            </div>
                            <div className="relative z-10 flex flex-col sm:flex-row gap-4 w-full justify-center">
                                <Link to="/choose-path" className="px-8 py-5 bg-[#f9f506] text-black rounded-full font-bold text-lg hover:bg-[#ebe815] transition-all hover:scale-105" style={{ boxShadow: '0 0 40px -5px rgba(249,245,6,0.6)' }}>
                                    Sync Your Vibe Now
                                </Link>
                                <button className="px-8 py-5 bg-white/10 text-white border border-white/20 rounded-full font-bold text-lg hover:bg-white/20 transition-all backdrop-blur-sm">
                                    Talk to Sales
                                </button>
                            </div>
                            <p className="relative z-10 text-sm text-white/50 mt-4">Compatible with Shopify, WooCommerce, and BigCommerce.</p>
                        </div>
                    </section>

                    {/* Minimal Footer */}
                    <footer className="flex flex-col md:flex-row justify-between items-center gap-6 py-8 border-t border-black/5 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-black">bolt</span>
                            <span className="font-bold text-black">Vibe Shop</span>
                            <span className="ml-2">© 2024</span>
                        </div>
                        <div className="flex gap-6 font-medium">
                            <a className="hover:text-black transition-colors" href="#">Support</a>
                            <a className="hover:text-black transition-colors" href="#">API Docs</a>
                            <a className="hover:text-black transition-colors" href="#">Terms of Service</a>
                            <a className="hover:text-black transition-colors" href="#">Privacy</a>
                        </div>
                        <div className="flex gap-4">
                            <a className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors" href="#">
                                <span className="text-xs font-bold">X</span>
                            </a>
                            <a className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors" href="#">
                                <span className="text-xs font-bold">Ig</span>
                            </a>
                            <a className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors" href="#">
                                <span className="text-xs font-bold">Li</span>
                            </a>
                        </div>
                    </footer>
                </main>
            </div>
        </>
    );
};

export default HomePage;
