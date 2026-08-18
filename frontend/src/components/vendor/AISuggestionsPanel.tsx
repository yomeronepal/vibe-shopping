import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Tag, DollarSign, Type, Check, X } from 'lucide-react';
import type { AIProductDetails } from '../../api/ai';
import Button from '../common/Button';
import toast from 'react-hot-toast';

interface AISuggestionsPanelProps {
    initialData: AIProductDetails;
    initialPrice: string;
    onUpdate: (updates: {
        name?: string;
        description?: string;
        price?: string;
        aiData?: AIProductDetails
    }) => void;
}

export default function AISuggestionsPanel({ initialData, initialPrice, onUpdate }: AISuggestionsPanelProps) {
    // Local State for Edition
    const [title, setTitle] = useState(initialData.title);
    const [description, setDescription] = useState(initialData.description);
    const [price, setPrice] = useState(initialPrice);

    // Split tags into Keywords and Vibes
    const [tags, setTags] = useState<string[]>(initialData.tags || []);
    const [newTag, setNewTag] = useState('');

    const [vibeTags, setVibeTags] = useState<string[]>(initialData.vibe_tags || []);
    const [newVibeTag, setNewVibeTag] = useState('');

    // Suggested Price Logic
    const minPrice = initialData.suggested_price_range?.min || 0;
    const maxPrice = initialData.suggested_price_range?.max || 100;
    // Ensure current price is within a reasonable slider range
    const sliderMax = Math.max(parseFloat(price) || 0, maxPrice * 1.5);

    const handleApplyChanges = () => {
        onUpdate({
            name: title,
            description: description,
            price: price,
            aiData: {
                ...initialData,
                title,
                description,
                tags,       // Keywords
                vibe_tags: vibeTags // Explicit Vibe Tags
            }
        });
        toast.success("Changes applied!");
    };

    // Clean up unused helper functions if they were defined here previously
    // (addTag and removeTag were replaced by inline handlers in the JSX)

    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold flex items-center gap-2" style={{ color: 'var(--vibe-fg)' }}>
                    <Sparkles className="w-8 h-8 text-indigo-500" />
                    AI Suggestions Review
                </h2>
                <Button onClick={handleApplyChanges} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700">
                    <Check className="w-4 h-4" />
                    Apply Changes
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Left Column: Copy Editor */}
                <div className="space-y-6">
                    <div className="p-6 rounded-xl border border-indigo-500/20 bg-slate-900/50 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-4 font-semibold text-lg text-white">
                            <Type className="w-5 h-5 text-indigo-400" />
                            <h3>Copy Editor</h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={8}
                                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Vibe Tags & Price */}
                <div className="space-y-6">

                    {/* Vibe Tags */}
                    <div className="p-6 rounded-xl border border-indigo-500/20 bg-slate-900/50 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-4 font-semibold text-lg text-white">
                            <Sparkles className="w-5 h-5 text-pink-400" />
                            <h3>Vibe Tags</h3>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {vibeTags.map((tag) => (
                                <motion.span
                                    layout
                                    key={tag}
                                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-pink-500/20 text-pink-300 border border-pink-500/30"
                                >
                                    #{tag}
                                    <button onClick={() => setVibeTags(vibeTags.filter(t => t !== tag))} className="ml-2 hover:text-white">
                                        <X className="w-3 h-3" />
                                    </button>
                                </motion.span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newVibeTag}
                                onChange={(e) => setNewVibeTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (newVibeTag && !vibeTags.includes(newVibeTag)) {
                                            setVibeTags([...vibeTags, newVibeTag]);
                                            setNewVibeTag('');
                                        }
                                    }
                                }}
                                placeholder="Add vibe (e.g. Party)..."
                                className="flex-1 bg-slate-800 border-slate-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Product Tags */}
                    <div className="p-6 rounded-xl border border-indigo-500/20 bg-slate-900/50 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-4 font-semibold text-lg text-white">
                            <Tag className="w-5 h-5 text-indigo-400" />
                            <h3>Keywords</h3>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {tags.map((tag) => (
                                <motion.span
                                    layout
                                    key={tag}
                                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                >
                                    #{tag}
                                    <button onClick={() => setTags(tags.filter(t => t !== tag))} className="ml-2 hover:text-white">
                                        <X className="w-3 h-3" />
                                    </button>
                                </motion.span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (newTag && !tags.includes(newTag)) {
                                            setTags([...tags, newTag]);
                                            setNewTag('');
                                        }
                                    }
                                }}
                                placeholder="Add keyword..."
                                className="flex-1 bg-slate-800 border-slate-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Price Slider */}
                    <div className="p-6 rounded-xl border border-indigo-500/20 bg-slate-900/50 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-4 font-semibold text-lg text-white">
                            <DollarSign className="w-5 h-5 text-green-400" />
                            <h3>Smart Pricing</h3>
                        </div>

                        <div className="mb-6">
                            <div className="flex justify-between text-sm text-slate-400 mb-2">
                                <span>Suggested Range</span>
                                <span className="text-green-400 font-medium">${minPrice} - ${maxPrice}</span>
                            </div>

                            {/* Visual Range Indicator */}
                            <div className="relative h-2 bg-slate-700 rounded-full mb-6">
                                {/* The Suggested Zone */}
                                <div
                                    className="absolute h-full bg-green-500/30 rounded-full"
                                    style={{
                                        left: `${(minPrice / sliderMax) * 100}%`,
                                        width: `${((maxPrice - minPrice) / sliderMax) * 100}%`
                                    }}
                                />
                                {/* The Thumb (Browser Native for now, styled wrapper later if needed) */}
                            </div>

                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Your Price: <span className="text-2xl font-bold text-white ml-2">${price}</span>
                            </label>

                            <input
                                type="range"
                                min="0"
                                max={sliderMax}
                                step="0.5"
                                value={price || 0}
                                onChange={(e) => setPrice(e.target.value)}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-2">
                                <span>$0</span>
                                <span>${sliderMax.toFixed(0)}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
