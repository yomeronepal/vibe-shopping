import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api/auth';
import { vendorApi } from '../api/vendor';
import type { LoginResponse } from '../api/auth';

const VendorLoginPage: React.FC = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        username: '',
        password: '',
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
            const response: LoginResponse = await authApi.login(formData.username, formData.password);
            authApi.setToken(response.token);

            if (response.is_onboarding_complete) {
                navigate('/vendor');
            } else {
                navigate('/vendor/onboarding');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.non_field_errors?.[0] || err.response?.data?.error || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <style>{`
                .animated-bg {
                    background: radial-gradient(circle at 10% 20%, rgb(242, 235, 255) 0%, rgb(238, 252, 255) 90%);
                    background-size: 200% 200%;
                    animation: gradient-move 15s ease infinite;
                }
                @keyframes gradient-move {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                .floating-element {
                    animation: float 6s ease-in-out infinite;
                }
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                    100% { transform: translateY(0px); }
                }
            `}</style>

            <div className="font-jakarta antialiased animated-bg text-slate-800 min-h-screen flex items-center justify-center p-4 selection:bg-[#8a2ce2] selection:text-white">
                {/* Main Container */}
                <div className="w-full max-w-[1200px] h-[85vh] min-h-[700px] flex rounded-2xl shadow-glass glass-card overflow-hidden relative transition-all duration-500">
                    {/* Left Panel: Vibe Gallery */}
                    <div className="hidden lg:flex w-5/12 relative flex-col justify-between p-6 overflow-hidden bg-white/40">
                        {/* Branding */}
                        <Link to="/" className="z-20 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#8a2ce2] flex items-center justify-center text-white">
                                <span className="material-symbols-outlined text-[18px]">shutter_speed</span>
                            </div>
                            <span className="font-bold text-xl tracking-tight">BizAlly</span>
                        </Link>

                        {/* Gallery Grid */}
                        <div className="absolute inset-0 z-0 p-6 pt-20 pb-20 opacity-90">
                            <div className="grid grid-cols-2 gap-4 h-full content-center floating-element">
                                <div className="space-y-4">
                                    <div className="h-56 w-full rounded-2xl bg-cover bg-center shadow-sm hover:scale-105 transition-transform duration-700" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBsmRf1v7c9Rj7yEeXDyqxs9EleqiDQcgXRJnvnLaUrQNn_py_E3o-R5bTUFdW1ky8rWxIELMi7pQjLWeKASmmfk8EcqC0zA4NaUj4NgWcHjP0SdqVCFZGEzGJstVifdoiM60TrDYK6u30U7XZXdFHq6hnOpE6l9GmhX7LEy6EEGbn14HuWQyg_na3uufIWe5xRdFfCKR0nEojcNotF2NiNSI_drIGNS9yKjNtFZJRSKhrepVhpWDfVZbnZRq7psO9Us3lU_WH_3S9w')" }}></div>
                                    <div className="h-40 w-full rounded-2xl bg-cover bg-center shadow-sm hover:scale-105 transition-transform duration-700 delay-100" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCfKzVMhFnAq2RSLvU7Mp5vQCDcdUemTJKe1sWf7pN8CMhBADVxm2NGNBf9hhsIPscK-QeYW6NhGlp2tCWJqDOR_Ra4DA98dCjK1wAxEaJxr6WSlO8Cd5mgFBFWQ-_Qai6pGw7AedBN-NrkKHyVfaH-VBNdFmKLjtfUpunXVfF8kz_JdA7PVbo7Iktg46UQHwF_OkJN58jqBwthz9MA8aRQ6BA-L3DJkTFodBOt7hlF_l88CIcW4ZSpKHVm9M108dWgftw4DHbPne5C')" }}></div>
                                </div>
                                <div className="space-y-4 pt-12">
                                    <div className="h-40 w-full rounded-2xl bg-cover bg-center shadow-sm hover:scale-105 transition-transform duration-700 delay-200" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDbDLQxKoTWiniqiqt3IGJtGrye_GmCluFwvoqA5SrASMylZS8enU3w8DZIT6bkDGvsYhmvy9jfLDlNq4475s6OnurXhRYEGB9D7Ut2TMkSy8gzYxaJYTQeL5b04q3Rl_R9grtc2JIDx9W-zJ_ZsL87XoKZNgNAxAj4_JcBkZNT-LPbeQDjcnhEik-EKKCghFf6GvarSViLksUSpiaqWe-RPK_aLqUOJ4X9kEpsvB7wgjG3hQ0yEnG1vztwCWVQ8MtzNTbO_eV5e-ag')" }}></div>
                                    <div className="h-56 w-full rounded-2xl bg-cover bg-center shadow-sm hover:scale-105 transition-transform duration-700 delay-300" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuA3eHzgnc51IFLGIDsHUxwf9Fet1tkd8jdPqRrRE6PwqKN9jXDbvIRpQ37m3xDwlsvbffUEVFEE0v-njL2Ce-8Gmbay79_sHKrOYGEVIl0p0AV5DmXGkplkucHKKyHg2Pcabb5Fm-NGgaBfIBCgZ12iBCCPoLDkrYqAOVbRiIYClcyFlVQOqMAVamTX3Lf-bbQnOqUBp-3TpOYdWrABSsdEuokaMe4Uwidvt-cs9lmBp7f-GWqc8IOKIXi1UQBwmrBQAJ4N_JxZ3peQ')" }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Overlay Text */}
                        <div className="z-20 relative">
                            <div className="bg-white/70 backdrop-blur-md p-4 rounded-xl border border-white/50 shadow-sm max-w-[85%]">
                                <p className="font-bold text-lg leading-tight">Sync your vibe. Sell your style.</p>
                                <p className="text-xs text-slate-500 mt-1">AI-powered curation for the modern storefront.</p>
                            </div>
                        </div>

                        {/* Decorative gradient */}
                        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-white/90 via-white/50 to-transparent z-10 pointer-events-none"></div>
                    </div>

                    {/* Right Panel: Login Form */}
                    <div className="w-full lg:w-7/12 flex flex-col justify-center items-center relative p-8 md:p-12 overflow-y-auto">
                        {/* Mobile Logo */}
                        <Link to="/" className="lg:hidden absolute top-6 left-6 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#8a2ce2] flex items-center justify-center text-white">
                                <span className="material-symbols-outlined text-[18px]">shutter_speed</span>
                            </div>
                            <span className="font-bold text-xl tracking-tight">BizAlly</span>
                        </Link>

                        <div className="w-full max-w-[420px] flex flex-col gap-6">
                            {/* Header */}
                            <div className="text-left mb-2">
                                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2 tracking-tight">Log in to BizAlly</h1>
                                <p className="text-slate-500 text-base">Manage your social storefront effortlessly.</p>
                            </div>

                            {/* Form */}
                            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                                {/* Username/Email Input */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-slate-700 ml-1" htmlFor="username">Username or Email</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <span className="material-symbols-outlined text-slate-400 text-[20px] group-focus-within:text-[#8a2ce2] transition-colors">mail</span>
                                        </div>
                                        <input
                                            className="w-full pl-11 pr-4 py-3.5 bg-slate-100 border-transparent focus:border-[#8a2ce2] focus:bg-white focus:ring-0 rounded-xl text-slate-900 placeholder-slate-400 transition-all duration-300 font-medium"
                                            id="username"
                                            name="username"
                                            placeholder="vendor@bizally.com"
                                            type="text"
                                            required
                                            value={formData.username}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                {/* Password Input */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center ml-1">
                                        <label className="text-sm font-semibold text-slate-700" htmlFor="password">Password</label>
                                        <a className="text-sm text-[#8a2ce2] font-medium hover:text-[#731fc4] transition-colors" href="#">Forgot Password?</a>
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <span className="material-symbols-outlined text-slate-400 text-[20px] group-focus-within:text-[#8a2ce2] transition-colors">lock</span>
                                        </div>
                                        <input
                                            className="w-full pl-11 pr-12 py-3.5 bg-slate-100 border-transparent focus:border-[#8a2ce2] focus:bg-white focus:ring-0 rounded-xl text-slate-900 placeholder-slate-400 transition-all duration-300 font-medium"
                                            id="password"
                                            name="password"
                                            placeholder="••••••••"
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            value={formData.password}
                                            onChange={handleChange}
                                        />
                                        <div
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            <span className="material-symbols-outlined text-slate-400 text-[20px] hover:text-slate-600 transition-colors">
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

                                {/* Sign In Button */}
                                <button
                                    className="magnetic-button mt-2 w-full bg-[#8a2ce2] hover:bg-[#731fc4] text-white font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-50"
                                    style={{ boxShadow: '0 4px 20px -2px rgba(138, 44, 226, 0.5)' }}
                                    type="submit"
                                    disabled={loading}
                                >
                                    <span>{loading ? 'Signing In...' : 'Sign In'}</span>
                                    <span className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="relative flex py-2 items-center">
                                <div className="flex-grow border-t border-slate-200"></div>
                                <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-medium">Or continue with</span>
                                <div className="flex-grow border-t border-slate-200"></div>
                            </div>

                            {/* Social Login */}
                            <div className="grid grid-cols-2 gap-4">
                                <button className="flex items-center justify-center gap-3 py-3 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group bg-white">
                                    <img alt="Google Logo" className="w-5 h-5 group-hover:scale-110 transition-transform" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCrgRWs6PexcK1V72rg46Vq0dyPeT2417yWBCgajSkpLNIA1eY2UtQ6uReo79L7UXy94p37hOv5gLLcwTQs28eotGKGZq7n1FeJ719zkA2F4gQIB22c9jVbgvArwd09V43_nTEG6kL1mpu3kAAQz2g_UWbHJ6QFeXk4pqYSTTTWIxOuKXFP21CHqg0ynjcEpVmiHbVevRStpJw0zd67UpEdzcgWiD9IExV0y1C_BxvSS4Go6KWSJBrsDmo2pxAGhpvqjlmSX9rRGXr_" />
                                    <span className="text-slate-700 font-medium text-sm">Google</span>
                                </button>
                                <button className="flex items-center justify-center gap-3 py-3 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group bg-white">
                                    <span className="material-symbols-outlined text-slate-900 text-[22px] group-hover:scale-110 transition-transform">ios</span>
                                    <span className="text-slate-700 font-medium text-sm">Apple</span>
                                </button>
                            </div>

                            {/* Footer Link */}
                            <div className="text-center mt-4">
                                <p className="text-slate-500 text-sm">
                                    Don't have an account?{' '}
                                    <Link className="text-[#8a2ce2] font-bold hover:underline decoration-2 underline-offset-4" to="/vendor/signup">Create one</Link>
                                </p>
                            </div>
                        </div>

                        {/* Legal */}
                        <div className="absolute bottom-4 text-xs text-slate-400 opacity-60">
                            © 2026 BizAlly
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default VendorLoginPage;
