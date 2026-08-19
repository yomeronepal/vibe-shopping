import { useState } from 'react';
import { useShopTheme } from '../../contexts/ShopThemeContext';

interface TagEditorProps {
    label: string;
    tags: string[];
    placeholder: string;
    onChange: (tags: string[]) => void;
}

export default function TagEditor({ label, tags, placeholder, onChange }: TagEditorProps) {
    const { config: themeConfig } = useShopTheme();
    const [draft, setDraft] = useState('');

    const addDraft = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || !draft.trim()) return;
        e.preventDefault();
        if (!tags.includes(draft.trim())) onChange([...tags, draft.trim()]);
        setDraft('');
    };

    return (
        <div>
            <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>{label}</label>
            <div
                className="w-full rounded-xl p-3 flex flex-wrap gap-2 items-center shadow-sm"
                style={{ backgroundColor: `${themeConfig.surface}80` }}
            >
                {tags.map((tag) => (
                    <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-bold shadow-sm"
                        style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                    >
                        {tag}
                        <button
                            onClick={() => onChange(tags.filter((t) => t !== tag))}
                            className="hover:text-red-500 transition-colors flex items-center"
                            aria-label={`Remove ${tag}`}
                        >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={addDraft}
                    placeholder={placeholder}
                    className="bg-transparent border-none p-0 focus:ring-0 text-sm font-medium min-w-[130px] ml-1"
                    style={{ color: themeConfig.text }}
                />
            </div>
        </div>
    );
}
