import { useState, useEffect } from 'react';
import { X, Instagram, Facebook, Music, Send, Loader2, Check, AlertCircle } from 'lucide-react';
import Button from '../common/Button';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';

interface Product {
    id: number;
    name: string;
    description: string;
    price: string;
    image: string | null;
    processed_image: string | null;
    tags?: string[];
    ai_generated_title?: string;
    ai_generated_description?: string;
}

interface PostToSocialModalProps {
    product: Product;
    open: boolean;
    onClose: () => void;
    connectedPlatforms: Record<string, { connected: boolean; username?: string }>;
}


export default function PostToSocialModal({ product, open, onClose, connectedPlatforms }: PostToSocialModalProps) {
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
    const [caption, setCaption] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [postResults, setPostResults] = useState<Array<{ platform: string; status: string; error?: string }>>([]);

    const availablePlatforms = [
        { id: 'instagram', name: 'Instagram', icon: Instagram, color: '#E4405F' },
        { id: 'facebook', name: 'Facebook', icon: Facebook, color: '#1877F2' },
        { id: 'tiktok', name: 'TikTok', icon: Music, color: '#000000' },
    ].filter(p => connectedPlatforms[p.id]?.connected);

    // Auto-select all connected platforms when modal opens
    useEffect(() => {
        if (open && availablePlatforms.length > 0) {
            setSelectedPlatforms(availablePlatforms.map(p => p.id));
        }
    }, [open]);

    const togglePlatform = (platformId: string) => {
        setSelectedPlatforms(prev =>
            prev.includes(platformId)
                ? prev.filter(p => p !== platformId)
                : [...prev, platformId]
        );
    };

    const toggleSelectAll = () => {
        if (selectedPlatforms.length === availablePlatforms.length) {
            // Deselect all
            setSelectedPlatforms([]);
        } else {
            // Select all
            setSelectedPlatforms(availablePlatforms.map(p => p.id));
        }
    };

    const generateCaption = () => {
        const title = product.ai_generated_title || product.name;
        const desc = product.ai_generated_description || product.description;
        const tags = product.tags || [];

        // Generate customer-facing product URL
        const productUrl = `${window.location.origin}/product/${product.id}`;

        let autoCaption = `${title}\n\n${desc}\n\n🔗 Shop now: ${productUrl}`;
        if (tags.length > 0) {
            const hashtags = tags.slice(0, 10).map(tag => `#${tag.replace(/\s/g, '')}`).join(' ');
            autoCaption += `\n\n${hashtags}`;
        }

        setCaption(autoCaption);
        toast.success('Caption generated!');
    };


    const handlePost = async () => {
        if (selectedPlatforms.length === 0) {
            toast.error('Please select at least one platform');
            return;
        }

        setIsPosting(true);
        setPostResults([]);

        try {
            const response = await apiClient.post(`/vendor/products/${product.id}/post-to-social/`, {
                platforms: selectedPlatforms,
                caption: caption,
                hashtags: product.tags || []
            });

            setPostResults(response.data.results);
            toast.success(response.data.message);

            // Close modal after successful posting
            setTimeout(() => {
                onClose();
                setSelectedPlatforms([]);
                setCaption('');
                setPostResults([]);
            }, 2000);

        } catch (error: any) {
            console.error('Posting failed:', error);
            toast.error(error.response?.data?.error || 'Failed to post to social media');
        } finally {
            setIsPosting(false);
        }
    };

    if (!open) return null;

    const imageUrl = product.processed_image || product.image;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div
                className="w-full max-w-3xl max-h-[90vh] overflow-y-auto border-2"
                style={{
                    backgroundColor: 'var(--vibe-bg)',
                    borderColor: 'var(--vibe-border)',
                    borderRadius: 'var(--vibe-radius)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--vibe-border)' }}>
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--vibe-fg)' }}>
                        Share to Social Media
                    </h2>
                    <button onClick={onClose} className="p-2 hover:opacity-70 transition-opacity">
                        <X className="w-6 h-6" style={{ color: 'var(--vibe-fg)' }} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Product Preview */}
                    <div className="flex gap-4 p-4 border rounded-lg" style={{ borderColor: 'var(--vibe-border)' }}>
                        {imageUrl && (
                            <img
                                src={imageUrl}
                                alt={product.name}
                                className="w-24 h-24 object-cover rounded"
                            />
                        )}
                        <div className="flex-1">
                            <h3 className="font-bold mb-1" style={{ color: 'var(--vibe-fg)' }}>{product.name}</h3>
                            <p className="text-sm line-clamp-2" style={{ color: 'var(--vibe-accent)' }}>
                                {product.description}
                            </p>
                            <p className="font-bold mt-2" style={{ color: 'var(--vibe-accent)' }}>
                                ${product.price}
                            </p>
                        </div>
                    </div>


                    {/* Platform Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-medium" style={{ color: 'var(--vibe-fg)' }}>
                                Select Platforms
                            </label>
                            {availablePlatforms.length > 1 && (
                                <button
                                    onClick={toggleSelectAll}
                                    className="text-sm px-3 py-1 rounded hover:opacity-70 transition-opacity"
                                    style={{
                                        backgroundColor: selectedPlatforms.length === availablePlatforms.length
                                            ? 'var(--vibe-border)'
                                            : 'var(--vibe-accent)',
                                        color: selectedPlatforms.length === availablePlatforms.length
                                            ? 'var(--vibe-fg)'
                                            : 'white'
                                    }}
                                >
                                    {selectedPlatforms.length === availablePlatforms.length ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                        </div>

                        {availablePlatforms.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed rounded-lg" style={{ borderColor: 'var(--vibe-border)' }}>
                                <AlertCircle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--vibe-accent)' }} />
                                <p style={{ color: 'var(--vibe-accent)' }}>No social media accounts connected</p>
                                <p className="text-sm mt-1" style={{ color: 'var(--vibe-accent)' }}>
                                    Go to Settings to connect your accounts
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-3">
                                {availablePlatforms.map((platform) => {
                                    const isSelected = selectedPlatforms.includes(platform.id);
                                    return (
                                        <button
                                            key={platform.id}
                                            onClick={() => togglePlatform(platform.id)}
                                            className="flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-all"
                                            style={{
                                                borderColor: isSelected ? platform.color : 'var(--vibe-border)',
                                                backgroundColor: isSelected ? `${platform.color}10` : 'transparent',
                                            }}
                                        >
                                            <div
                                                className="w-12 h-12 rounded-full flex items-center justify-center"
                                                style={{ backgroundColor: platform.color }}
                                            >
                                                <platform.icon className="w-6 h-6 text-white" />
                                            </div>
                                            <span className="font-medium text-sm" style={{ color: 'var(--vibe-fg)' }}>
                                                {platform.name}
                                            </span>
                                            {isSelected && (
                                                <Check className="w-5 h-5" style={{ color: platform.color }} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Caption Editor */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium" style={{ color: 'var(--vibe-fg)' }}>
                                Caption
                            </label>
                            <button
                                onClick={generateCaption}
                                className="text-sm px-3 py-1 rounded hover:opacity-70 transition-opacity"
                                style={{ backgroundColor: 'var(--vibe-accent)', color: 'white' }}
                            >
                                Generate AI Caption
                            </button>
                        </div>
                        <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Write your caption here..."
                            rows={6}
                            className="w-full px-4 py-3 border-2 outline-none"
                            style={{
                                borderColor: 'var(--vibe-border)',
                                borderRadius: 'var(--vibe-radius)',
                                backgroundColor: 'var(--vibe-bg)',
                                color: 'var(--vibe-fg)',
                            }}
                        />
                        <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--vibe-accent)' }}>
                            <span>{caption.length} characters</span>
                            <span>Recommended: 125-150 for Instagram</span>
                        </div>
                    </div>

                    {/* Post Results */}
                    {postResults.length > 0 && (
                        <div className="space-y-2">
                            {postResults.map((result, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center gap-3 p-3 border rounded"
                                    style={{ borderColor: 'var(--vibe-border)' }}
                                >
                                    <div className={`w-2 h-2 rounded-full ${result.status === 'posted' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                    <span className="capitalize" style={{ color: 'var(--vibe-fg)' }}>{result.platform}</span>
                                    <span className="text-sm" style={{ color: 'var(--vibe-accent)' }}>- {result.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t" style={{ borderColor: 'var(--vibe-border)' }}>
                    <Button variant="outline" onClick={onClose} disabled={isPosting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handlePost}
                        disabled={isPosting || selectedPlatforms.length === 0 || !caption}
                        className="flex items-center gap-2"
                    >
                        {isPosting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Posting...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Post Now
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
