import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const VendorEmailVerificationPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const email = location.state?.email || 'your email';

    const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        // Focus first input on mount
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return; // Only allow digits

        const newCode = [...code];
        newCode[index] = value.slice(-1); // Only take last character
        setCode(newCode);

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, 6);
        if (!/^\d+$/.test(pastedData)) return;

        const newCode = [...code];
        pastedData.split('').forEach((char, i) => {
            if (i < 6) newCode[i] = char;
        });
        setCode(newCode);
        inputRefs.current[Math.min(pastedData.length, 5)]?.focus();
    };

    const handleSubmit = async () => {
        const fullCode = code.join('');
        if (fullCode.length !== 6) {
            setError('Please enter all 6 digits');
            return;
        }

        setError(null);
        setLoading(true);

        try {
            // TODO: Call verification API
            // await vendorApi.verifyEmail(fullCode);

            // For now, simulate success and redirect to onboarding
            await new Promise(resolve => setTimeout(resolve, 1000));
            navigate('/vendor/onboarding');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Verification failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        try {
            // TODO: Call resend API
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Show success message
        } catch (err) {
            setError('Failed to resend code. Please try again.');
        } finally {
            setResending(false);
        }
    };

    return (
        <>
            <style>{`
                .glass-input {
                    background: rgba(255, 255, 255, 0.7);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                }
                @keyframes drift {
                    0% { transform: translate(0, 0); }
                    50% { transform: translate(10px, 15px); }
                    100% { transform: translate(0, 0); }
                }
                .animate-drift {
                    animation: drift 8s ease-in-out infinite;
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>

            <div className="font-jakarta bg-[#f5f3f6] text-gray-900 min-h-screen flex flex-col overflow-hidden relative">
                {/* Ambient Background Elements */}
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-[10%] -right-[10%] w-[50vw] h-[50vw] bg-[#8a2ce2]/10 rounded-full blur-3xl animate-drift"></div>
                    <div className="absolute -bottom-[10%] -left-[10%] w-[40vw] h-[40vw] bg-purple-300/20 rounded-full blur-3xl animate-drift" style={{ animationDelay: '2s' }}></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-tr from-transparent via-white/40 to-transparent opacity-50"></div>
                </div>

                {/* Main Content Area */}
                <main className="relative z-10 flex flex-1 flex-col items-center justify-center p-4 sm:p-8">
                    {/* Bento Card Container */}
                    <div className="w-full max-w-[480px] bg-white rounded-2xl border border-white/50 p-8 sm:p-12 flex flex-col items-center text-center transition-all duration-300 hover:shadow-xl" style={{ boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.05), 0 0 10px rgba(138, 44, 226, 0.1)' }}>
                        {/* Hero Icon with Glow */}
                        <div className="mb-6 relative group">
                            <div className="absolute inset-0 bg-[#8a2ce2]/30 blur-xl rounded-full scale-75 group-hover:scale-110 transition-transform duration-500"></div>
                            <div className="relative bg-white p-4 rounded-2xl shadow-sm border border-purple-100">
                                <span className="material-symbols-outlined text-[#8a2ce2] drop-shadow-[0_2px_4px_rgba(138,44,226,0.3)]" style={{ fontSize: '48px' }}>mark_email_unread</span>
                            </div>
                        </div>

                        {/* Headline & Microcopy */}
                        <div className="mb-8 space-y-2">
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                                Check your inbox
                            </h1>
                            <p className="text-gray-500 font-medium text-base leading-relaxed max-w-xs mx-auto">
                                Verification vibe sent to <span className="text-[#8a2ce2] font-semibold">{email}</span>
                            </p>
                        </div>

                        {/* 6-Digit Code Input */}
                        <div className="w-full mb-8">
                            <fieldset className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
                                {code.map((digit, index) => (
                                    <input
                                        key={index}
                                        ref={el => { inputRefs.current[index] = el; }}
                                        aria-label={`Digit ${index + 1}`}
                                        className="glass-input w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold border border-gray-200 rounded-lg shadow-sm focus:border-[#8a2ce2] focus:ring-4 focus:ring-[#8a2ce2]/10 outline-none transition-all placeholder:text-gray-300 bg-gray-50/50"
                                        inputMode="numeric"
                                        maxLength={1}
                                        pattern="[0-9]*"
                                        type="text"
                                        value={digit}
                                        onChange={(e) => handleChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                    />
                                ))}
                            </fieldset>
                        </div>

                        {error && (
                            <div className="w-full mb-4 text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        {/* Primary Action */}
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="group relative w-full flex items-center justify-center gap-2 bg-[#8a2ce2] hover:bg-[#7c26cc] text-white text-base font-bold h-12 rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 overflow-hidden disabled:opacity-50"
                            style={{ boxShadow: '0 4px 14px 0 rgba(138,44,226,0.39)' }}
                        >
                            <span className="relative z-10">{loading ? 'Verifying...' : 'Verify & Sync'}</span>
                            <span className="material-symbols-outlined text-sm relative z-10 transition-transform group-hover:translate-x-1">arrow_forward</span>
                            <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0"></div>
                        </button>

                        {/* Secondary Action */}
                        <div className="mt-6">
                            <p className="text-sm text-gray-500">
                                Didn't receive the vibe?{' '}
                                <button
                                    onClick={handleResend}
                                    disabled={resending}
                                    className="font-semibold text-[#8a2ce2] hover:text-[#7c26cc] hover:underline underline-offset-4 decoration-2 transition-colors ml-1 disabled:opacity-50"
                                >
                                    {resending ? 'Sending...' : 'Resend Code'}
                                </button>
                            </p>
                        </div>
                    </div>

                    {/* Footer / Branding Context */}
                    <div className="mt-8 flex items-center gap-2 opacity-60">
                        <span className="material-symbols-outlined text-gray-400 text-sm">lock</span>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">Secured by Vibe Shop AI</span>
                    </div>
                </main>
            </div>
        </>
    );
};

export default VendorEmailVerificationPage;
