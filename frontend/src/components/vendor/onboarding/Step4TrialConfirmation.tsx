import React from 'react';
import { useNavigate } from 'react-router-dom';

const Step4TrialConfirmation: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="animate-fadeIn text-center py-8">
            <div className="text-6xl mb-6 animate-bounce">🚀</div>
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-indigo-400 mb-4">
                Ready for Liftoff!
            </h2>
            <p className="text-slate-300 text-lg mb-8 max-w-md mx-auto">
                Your store <strong>Neon Horizon</strong> is set up. Your 14-day free trial starts now with full access to AI tools.
            </p>

            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl p-4 mb-8 inline-block mx-auto">
                <p className="text-emerald-400 font-medium">✅ Vibe Analysis Active</p>
                <p className="text-emerald-400 font-medium">✅ Store Subdomain Secured</p>
            </div>

            <button
                onClick={() => navigate('/vendor/dashboard')}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transform transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
                Launch Dashboard
            </button>
        </div>
    );
};

export default Step4TrialConfirmation;
