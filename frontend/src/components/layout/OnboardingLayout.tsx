import React, { type ReactNode } from 'react';

interface OnboardingLayoutProps {
    children: ReactNode;
    currentStep: number;
    totalSteps: number;
}

const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({ children, currentStep }) => {
    // Mapping internal steps to visual steps
    // Visual: 1. Profile, 2. Connect, 3. Launch
    // We assume currentStep is 1, 2, 3 matching the visual steps.

    return (
        <div className="min-h-screen flex flex-col font-display text-[#150e1b] bg-gradient-to-br from-[#F4ECFB] to-[#F0EAF8] overflow-x-hidden">
            {/* Top Navigation */}
            <header className="flex items-center justify-between px-6 py-4 md:px-10 border-b border-white/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="size-10 bg-vibe-purple/10 rounded-xl flex items-center justify-center text-vibe-purple">
                        <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">BizAlly</h2>
                </div>

                {/* Progress Steps (Desktop) */}
                <div className="hidden md:flex items-center gap-2 bg-white/60 px-4 py-2 rounded-full border border-white/50 shadow-sm">
                    {/* Step 1 */}
                    <div className={`flex items-center gap-2 font-bold text-sm ${currentStep >= 1 ? 'text-vibe-purple' : 'text-gray-400'}`}>
                        <span className={`flex items-center justify-center size-6 rounded-full text-xs ${currentStep >= 1 ? 'bg-vibe-purple text-white' : 'bg-gray-200 text-gray-500'}`}>1</span>
                        <span>Profile</span>
                    </div>
                    <div className={`w-8 h-[2px] ${currentStep >= 2 ? 'bg-vibe-purple/20' : 'bg-gray-200'}`}></div>

                    {/* Step 2 */}
                    <div className={`flex items-center gap-2 font-medium text-sm ${currentStep >= 2 ? 'text-vibe-purple' : 'text-gray-400'}`}>
                        <span className={`flex items-center justify-center size-6 rounded-full text-xs ${currentStep >= 2 ? 'bg-vibe-purple text-white' : 'bg-gray-200 text-gray-500'}`}>2</span>
                        <span>Connect</span>
                    </div>
                    <div className={`w-8 h-[2px] ${currentStep >= 3 ? 'bg-vibe-purple/20' : 'bg-gray-200'}`}></div>

                    {/* Step 3 */}
                    <div className={`flex items-center gap-2 font-medium text-sm ${currentStep >= 3 ? 'text-vibe-purple' : 'text-gray-400'}`}>
                        <span className={`flex items-center justify-center size-6 rounded-full text-xs ${currentStep >= 3 ? 'bg-vibe-purple text-white' : 'bg-gray-200 text-gray-500'}`}>3</span>
                        <span>Launch</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button className="hidden sm:flex text-sm font-bold text-vibe-purple hover:bg-vibe-purple/5 px-4 py-2 rounded-xl transition-colors">
                        Save Draft
                    </button>
                    <div className="size-10 rounded-full bg-cover bg-center border-2 border-white shadow-sm bg-gray-200" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuB9c_-JmuSF00GqY5Z_H6mu2ICXxyar_iCql3Q_RBHcLuTz8OzjdTn6ndiKukI4k7nh0aD4J1ImqnL1E1yLJeDEcHLfXbL87ObjTyLu51lh6Z8uzUwX__lJxINX8nDu6F3SfFuPEQMaMduAATJY8D9PmDlRsPDC7-OOFxZAze_Q3oUDQNZ0TcARJSsZBV88y1zhAXPkasx2UvjL1jusuMF_6i5GJw7f1Ugbk7v9T8gV0OhTq2q3EEpVplPjt7xwQYxOh62u8LfQIxEf")' }}>
                    </div>
                </div>
            </header>

            {/* Main Content Layout */}
            <main className="flex-grow">
                {children}
            </main>
        </div>
    );
};

export default OnboardingLayout;
