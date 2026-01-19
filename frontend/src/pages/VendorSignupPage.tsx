import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { vendorApi } from '../api/vendor';
import type { VendorSignupData } from '../api/vendor';

const VendorSignupPage: React.FC = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState<VendorSignupData>({
        username: '',
        email: '',
        password: '',
        store_name: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            const { isAuthenticated, isOnboardingComplete } = await vendorApi.checkAuthStatus();
            if (isAuthenticated) {
                if (isOnboardingComplete) {
                    navigate('/vendor');
                } else {
                    navigate('/vendor/onboarding');
                }
            }
        };
        checkAuth();
    }, [navigate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const response = await vendorApi.signupVendor(formData);
            // Store the auth token for auto-login
            if (response.token) {
                localStorage.setItem('token', response.token);
            }
            // Redirect to onboarding
            navigate('/vendor/onboarding');
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.error || 'Signup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="font-jakarta lavender-gradient-signup min-h-screen text-[#151117] relative selection:bg-[#8A2BE2]/20 selection:text-[#8A2BE2] overflow-x-hidden">
            {/* Background blurred blobs */}
            <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-300/20 blur-[100px] pointer-events-none mix-blend-multiply"></div>
            <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-blue-300/20 blur-[100px] pointer-events-none mix-blend-multiply"></div>

            {/* Navigation */}
            <nav className="fixed top-0 left-0 w-full z-50 px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3 glass-panel-strong px-4 py-2 rounded-full">
                        <div className="size-8 rounded-full bg-[#8A2BE2] flex items-center justify-center text-white shadow-lg" style={{ boxShadow: '0 4px 14px rgba(138, 43, 226, 0.3)' }}>
                            <span className="material-symbols-outlined text-xl">storefront</span>
                        </div>
                        <h2 className="font-grotesk text-[#151117] text-lg font-bold tracking-tight">Vibe Shop</h2>
                    </Link>
                    <Link className="group flex items-center gap-2 text-sm font-semibold text-[#151117]/70 hover:text-[#8A2BE2] transition-colors glass-panel-strong px-5 py-2.5 rounded-full" to="/vendor/login">
                        <span>Already a vendor?</span>
                        <span className="text-[#8A2BE2] group-hover:underline decoration-2 underline-offset-2">Log In</span>
                    </Link>
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative flex min-h-screen w-full items-center justify-center p-4 md:p-8 pt-24 md:pt-0">
                {/* Bento Grid Container */}
                <div className="glass-panel-strong w-full max-w-[1100px] grid grid-cols-1 md:grid-cols-12 rounded-3xl overflow-hidden min-h-[600px] transition-all duration-500 ease-out md:hover:shadow-[0_30px_60px_rgba(138,43,226,0.2)]">
                    {/* Left Panel: Value Prop */}
                    <div className="md:col-span-5 p-8 md:p-12 lg:p-14 flex flex-col justify-center relative overflow-hidden border-b md:border-b-0 md:border-r border-white/40 bg-white/30">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#8A2BE2]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8A2BE2]/10 border border-[#8A2BE2]/10 text-[#8A2BE2] text-xs font-bold uppercase tracking-wider mb-6 w-fit">
                                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                Vendor Hub
                            </div>

                            <h1 className="font-grotesk text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight mb-8 text-[#151117]">
                                Level up your <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8A2BE2] to-purple-400">commerce.</span>
                            </h1>

                            <div className="space-y-8">
                                <div className="flex gap-5 group">
                                    <div className="shrink-0 size-12 rounded-2xl bg-white/60 border border-white/60 flex items-center justify-center icon-glow-container transition-transform group-hover:scale-110 duration-300">
                                        <span className="material-symbols-outlined text-[#8A2BE2] text-2xl relative z-10">sync</span>
                                    </div>
                                    <div>
                                        <h3 className="font-grotesk text-lg font-bold text-[#151117] mb-1">AI-Powered Sync</h3>
                                        <p className="text-[#151117]/70 text-sm leading-relaxed">Automatically import viral posts and match them with inventory.</p>
                                    </div>
                                </div>
                                <div className="flex gap-5 group">
                                    <div className="shrink-0 size-12 rounded-2xl bg-white/60 border border-white/60 flex items-center justify-center icon-glow-container transition-transform group-hover:scale-110 duration-300 delay-75">
                                        <span className="material-symbols-outlined text-[#8A2BE2] text-2xl relative z-10">store</span>
                                    </div>
                                    <div>
                                        <h3 className="font-grotesk text-lg font-bold text-[#151117] mb-1">Instant Storefront</h3>
                                        <p className="text-[#151117]/70 text-sm leading-relaxed">Turn passive followers into active buyers in seconds.</p>
                                    </div>
                                </div>
                                <div className="flex gap-5 group">
                                    <div className="shrink-0 size-12 rounded-2xl bg-white/60 border border-white/60 flex items-center justify-center icon-glow-container transition-transform group-hover:scale-110 duration-300 delay-150">
                                        <span className="material-symbols-outlined text-[#8A2BE2] text-2xl relative z-10">monitoring</span>
                                    </div>
                                    <div>
                                        <h3 className="font-grotesk text-lg font-bold text-[#151117] mb-1">Premium Analytics</h3>
                                        <p className="text-[#151117]/70 text-sm leading-relaxed">Track your vibe score and engagement metrics.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Sign Up Form */}
                    <div className="md:col-span-7 p-8 md:p-12 lg:p-16 flex flex-col justify-center bg-white/50 backdrop-blur-sm">
                        <div className="max-w-md mx-auto w-full">
                            <div className="mb-8">
                                <h2 className="font-grotesk text-3xl font-bold text-[#151117] mb-2">Get Started</h2>
                                <p className="text-[#151117]/60">Create your account to start selling.</p>
                            </div>

                            <form className="space-y-5" onSubmit={handleSubmit}>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-[#151117] ml-1" htmlFor="store_name">Store Name</label>
                                    <div className="relative input-focus-ring rounded-xl transition-all duration-200 bg-[#F9F9F9] border border-transparent">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <span className="material-symbols-outlined text-gray-400">shopping_bag</span>
                                        </div>
                                        <input
                                            className="block w-full pl-11 pr-4 py-3.5 bg-transparent border-none text-[#151117] placeholder-gray-400 focus:ring-0 sm:text-sm rounded-xl"
                                            id="store_name"
                                            name="store_name"
                                            placeholder="e.g. Urban Vibe"
                                            type="text"
                                            required
                                            value={formData.store_name}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-[#151117] ml-1" htmlFor="username">Username</label>
                                    <div className="relative input-focus-ring rounded-xl transition-all duration-200 bg-[#F9F9F9] border border-transparent">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <span className="material-symbols-outlined text-gray-400">person</span>
                                        </div>
                                        <input
                                            className="block w-full pl-11 pr-4 py-3.5 bg-transparent border-none text-[#151117] placeholder-gray-400 focus:ring-0 sm:text-sm rounded-xl"
                                            id="username"
                                            name="username"
                                            placeholder="your_username"
                                            type="text"
                                            required
                                            value={formData.username}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-[#151117] ml-1" htmlFor="email">Email Address</label>
                                    <div className="relative input-focus-ring rounded-xl transition-all duration-200 bg-[#F9F9F9] border border-transparent">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <span className="material-symbols-outlined text-gray-400">mail</span>
                                        </div>
                                        <input
                                            className="block w-full pl-11 pr-4 py-3.5 bg-transparent border-none text-[#151117] placeholder-gray-400 focus:ring-0 sm:text-sm rounded-xl"
                                            id="email"
                                            name="email"
                                            placeholder="hello@vibeshop.com"
                                            type="email"
                                            required
                                            value={formData.email}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-[#151117] ml-1" htmlFor="password">Password</label>
                                    <div className="relative input-focus-ring rounded-xl transition-all duration-200 bg-[#F9F9F9] border border-transparent">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <span className="material-symbols-outlined text-gray-400">lock</span>
                                        </div>
                                        <input
                                            className="block w-full pl-11 pr-12 py-3.5 bg-transparent border-none text-[#151117] placeholder-gray-400 focus:ring-0 sm:text-sm rounded-xl"
                                            id="password"
                                            name="password"
                                            placeholder="••••••••"
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            value={formData.password}
                                            onChange={handleChange}
                                        />
                                        <div
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer hover:text-[#8A2BE2] transition-colors text-gray-400"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">
                                                {showPassword ? 'visibility_off' : 'visibility'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {error && (
                                    <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl">
                                        {error}
                                    </div>
                                )}

                                <div className="pt-2">
                                    <button
                                        className="magnetic-button w-full flex items-center justify-center gap-2 bg-[#8A2BE2] hover:bg-[#7022b8] text-white font-bold py-4 px-6 rounded-xl text-base transition-colors disabled:opacity-50"
                                        style={{ boxShadow: '0 4px 14px 0 rgba(138,43,226,0.39)' }}
                                        type="submit"
                                        disabled={loading}
                                    >
                                        <span>{loading ? 'Launching...' : 'Launch My Shop'}</span>
                                        <span className="material-symbols-outlined text-lg">rocket_launch</span>
                                    </button>
                                </div>
                            </form>

                            <p className="mt-6 text-center text-xs text-[#151117]/50">
                                By joining, you agree to our <a className="underline hover:text-[#8A2BE2]" href="#">Terms of Service</a> and <a className="underline hover:text-[#8A2BE2]" href="#">Privacy Policy</a>.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default VendorSignupPage;
