import React, { useState } from 'react';

interface Step2NicheSelectionProps {
    onNext: (niches: string[]) => void;
    onBack: () => void;
    initialNiches?: string[];
}

const NICHES = [
    { id: 'streetwear', label: 'Streetwear', emoji: '👟' },
    { id: 'vintage', label: 'Vintage', emoji: '🕰️' },
    { id: 'techwear', label: 'Techwear', emoji: '🤖' },
    { id: 'minimalist', label: 'Minimalist', emoji: '⚪' },
    { id: 'cyberpunk', label: 'Cyberpunk', emoji: '🌆' },
    { id: 'sustainable', label: 'Sustainable', emoji: '🌿' },
    { id: 'luxury', label: 'Luxury', emoji: '💎' },
    { id: 'sportswear', label: 'Sportswear', emoji: '🏃' },
];

const Step2NicheSelection: React.FC<Step2NicheSelectionProps> = ({ onNext, onBack, initialNiches = [] }) => {
    const [selectedNiches, setSelectedNiches] = useState<string[]>(initialNiches);

    const toggleNiche = (id: string) => {
        setSelectedNiches(prev =>
            prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedNiches.length > 0) {
            onNext(selectedNiches);
        }
    };

    return (
        <div className="animate-fadeIn">
            <h2 className="text-2xl font-semibold text-white mb-2">Define your Vibe</h2>
            <p className="text-slate-400 mb-6">Select up to 3 niches that best describe your brand.</p>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {NICHES.map((niche) => (
                        <button
                            key={niche.id}
                            type="button"
                            onClick={() => toggleNiche(niche.id)}
                            className={`p-4 rounded-xl border transition-all duration-200 flex flex-col items-center justify-center gap-2
                ${selectedNiches.includes(niche.id)
                                    ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                                    : 'bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/60'
                                }
              `}
                        >
                            <span className="text-2xl">{niche.emoji}</span>
                            <span className={`text-sm font-medium ${selectedNiches.includes(niche.id) ? 'text-white' : 'text-slate-400'}`}>
                                {niche.label}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="w-1/3 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-4 rounded-xl border border-slate-700 transition-colors"
                    >
                        Back
                    </button>
                    <button
                        type="submit"
                        disabled={selectedNiches.length === 0}
                        className={`w-2/3 font-bold py-4 rounded-xl shadow-lg transform transition-all 
              ${selectedNiches.length > 0
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98]'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }
            `}
                    >
                        Next: Upload Product
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Step2NicheSelection;
