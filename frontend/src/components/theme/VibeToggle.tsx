import { Palette } from 'lucide-react';
import { useVibe, vibeConfig } from '../../contexts/VibeContext';
import type { VibeType } from '../../contexts/VibeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export default function VibeToggle() {
    const { vibe, setVibe } = useVibe();
    const [isOpen, setIsOpen] = useState(false);

    const vibeKeys = Object.keys(vibeConfig) as VibeType[];

    return (
        <div className="fixed bottom-6 right-6 z-50">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="absolute bottom-16 right-0 p-4 rounded-[var(--vibe-radius)] 
                       bg-[var(--vibe-bg)] border-2 border-[var(--vibe-border)]
                       shadow-[var(--vibe-shadow)] min-w-[200px]"
                    >
                        <h3 className="text-sm font-semibold mb-3 text-[var(--vibe-fg)]">
                            Choose Your Vibe
                        </h3>
                        <div className="space-y-2">
                            {vibeKeys.map((vibeKey) => (
                                <button
                                    key={vibeKey}
                                    onClick={() => {
                                        setVibe(vibeKey);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left p-3 rounded-[var(--vibe-radius)] 
                             border-2 transition-all
                             ${vibe === vibeKey
                                            ? 'border-[var(--vibe-accent)] bg-[var(--vibe-secondary)]'
                                            : 'border-[var(--vibe-border)] hover:border-[var(--vibe-accent)]'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl">{vibeConfig[vibeKey].icon}</span>
                                        <div>
                                            <div className="font-semibold text-[var(--vibe-fg)]">
                                                {vibeConfig[vibeKey].name}
                                            </div>
                                            <div className="text-xs text-[var(--vibe-accent)]">
                                                {vibeConfig[vibeKey].description}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsOpen(!isOpen)}
                className="p-4 rounded-[var(--vibe-radius)] 
                   bg-[var(--vibe-accent)] text-[var(--vibe-bg)]
                   border-2 border-[var(--vibe-border)]
                   shadow-[var(--vibe-shadow)]
                   hover:shadow-lg transition-shadow"
            >
                <Palette className="w-6 h-6" />
            </motion.button>
        </div>
    );
}
