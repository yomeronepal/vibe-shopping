import React, { useState } from 'react';
import type { VendorSignupData } from '../../../api/vendor';

interface Step1StoreInfoProps {
    onNext: (data: VendorSignupData) => void;
    initialData?: Partial<VendorSignupData>;
}

const Step1StoreInfo: React.FC<Step1StoreInfoProps> = ({ onNext, initialData }) => {
    const [storeName, setStoreName] = useState(initialData?.store_name || '');
    const [subdomain, setSubdomain] = useState(''); // Just for visual feedback

    // Auth Fields
    const [username, setUsername] = useState(initialData?.username || '');
    const [email, setEmail] = useState(initialData?.email || '');
    const [password, setPassword] = useState(initialData?.password || '');

    const handleStoreNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const name = e.target.value;
        setStoreName(name);
        // Auto-generate subdomain from store name
        setSubdomain(name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (storeName && username && email && password) {
            onNext({
                store_name: storeName,
                username,
                email,
                password
            });
        }
    };

    return (
        <div className="animate-fadeIn">
            <h2 className="text-2xl font-semibold text-white mb-6">Create your Vibe Account</h2>
            <form onSubmit={handleSubmit} className="space-y-4">

                {/* Account Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-slate-500"
                            placeholder="johndoe"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                        <input
                            type="email"
                            required
                            className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-slate-500"
                            placeholder="john@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                    <input
                        type="password"
                        required
                        className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-slate-500"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>

                <div className="my-4 border-t border-slate-700/50"></div>

                {/* Store Info */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Store Name</label>
                    <input
                        type="text"
                        className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-slate-500"
                        placeholder="e.g. Neon Horizon"
                        value={storeName}
                        onChange={handleStoreNameChange}
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Store URL (Preview)</label>
                    <div className="flex items-center opacity-70">
                        <div className="flex-1 bg-slate-900/50 border border-slate-700 rounded-l-xl px-4 py-3 text-slate-300 select-none">
                            {subdomain || 'your-store'}
                        </div>
                        <div className="bg-slate-800 border border-l-0 border-slate-700 rounded-r-xl px-4 py-3 text-slate-500 select-none">
                            .vibe-shopping.com
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    className="w-full mt-8 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transform transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                    Create Account & Start Trial
                </button>
            </form>
        </div>
    );
};

export default Step1StoreInfo;
