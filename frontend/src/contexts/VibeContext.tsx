import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export type VibeType = 'minimalist' | 'cyberpunk' | 'cottagecore';

interface VibeContextType {
    vibe: VibeType;
    setVibe: (vibe: VibeType) => void;
}

const VibeContext = createContext<VibeContextType | undefined>(undefined);

export const vibeConfig = {
    minimalist: {
        name: 'Minimalist',
        description: 'Clean, black and white aesthetic',
        icon: '⬛',
    },
    cyberpunk: {
        name: 'Cyberpunk',
        description: 'Neon lights, sharp edges',
        icon: '🌆',
    },
    cottagecore: {
        name: 'Cottagecore',
        description: 'Earthy tones, soft curves',
        icon: '🌿',
    },
};

interface VibeProviderProps {
    children: ReactNode;
}

export function VibeProvider({ children }: VibeProviderProps) {
    const [vibe, setVibeState] = useState<VibeType>(() => {
        const saved = localStorage.getItem('vibe-theme');
        return (saved as VibeType) || 'minimalist';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-vibe', vibe);
        localStorage.setItem('vibe-theme', vibe);
    }, [vibe]);

    const setVibe = (newVibe: VibeType) => {
        setVibeState(newVibe);
    };

    return (
        <VibeContext.Provider value={{ vibe, setVibe }}>
            {children}
        </VibeContext.Provider>
    );
}

export function useVibe() {
    const context = useContext(VibeContext);
    if (!context) {
        throw new Error('useVibe must be used within VibeProvider');
    }
    return context;
}
