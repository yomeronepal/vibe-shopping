import React, { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { vendorApi, type WeatherTag } from '../api/vendor';
import { aiApi } from '../api/ai';
import { listConnectedPages, publishProductPost, type ConnectedPage } from '../api/socials';

interface StockBySize {
    S: number;
    M: number;
    L: number;
    XL: number;
    [key: string]: number;
}

interface ColorVariant {
    id?: number;
    color_name: string;
    color_hex: string;
    stock_by_size: StockBySize;
    images: File[];
    imageUrls: string[];
}

const SIZE_LABELS: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large', XL: 'X-Large' };

const AI_PROGRESS_STEPS = [
    { progress: 20, message: 'Reading your description...' },
    { progress: 45, message: 'Writing the title & description...' },
    { progress: 70, message: 'Generating tags & vibes...' },
    { progress: 90, message: 'Finalizing details...' },
];

function describeAiError(error: any): string {
    if (error?.response?.status === 429) {
        return 'AI is taking a quick break (rate limit reached). Wait a moment and try again, or fill in details manually.';
    }
    if (error?.code === 'ECONNABORTED') {
        return 'AI is taking longer than expected. Try a smaller image, or add details manually.';
    }
    if (!error?.response) {
        return 'Connection issue detected. Check your internet and try again, or proceed with manual entry.';
    }
    return 'AI analysis encountered an issue. You can still create your product manually.';
}

function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={onToggle}
            className="relative w-11 h-6 rounded-full transition-colors shrink-0"
            style={{ backgroundColor: on ? themeConfig.primary : themeConfig.border }}
        >
            <span
                className="absolute top-[2px] w-5 h-5 bg-white rounded-full transition-all shadow-sm"
                style={{ left: on ? '22px' : '2px' }}
            />
        </button>
    );
}

interface PlatformToggleProps {
    label: string;
    badge: string;
    badgeBackground: string;
    active: boolean;
    available: boolean;
    onToggle: () => void;
}

function PlatformToggle({ label, badge, badgeBackground, active, available, onToggle }: PlatformToggleProps) {
    const { config: themeConfig } = useShopTheme();
    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={!available}
            title={available ? `Post to ${label}` : `${label} is not connected`}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
                borderColor: active ? themeConfig.primary : `${themeConfig.border}90`,
                backgroundColor: active ? `${themeConfig.primary}0d` : `${themeConfig.surface}80`,
                color: themeConfig.text,
            }}
        >
            <span
                className="px-1.5 py-0.5 rounded text-[10px] font-extrabold text-white"
                style={{ background: badgeBackground }}
            >
                {badge}
            </span>
            {label}
            {available ? (
                <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ color: active ? themeConfig.primary : themeConfig.border }}
                >
                    {active ? 'check_circle' : 'radio_button_unchecked'}
                </span>
            ) : (
                <span className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>Not connected</span>
            )}
        </button>
    );
}

function AiProgressCard({ progress, message }: { progress: number; message: string }) {
    const { config: themeConfig } = useShopTheme();
    const primaryColor = themeConfig.primary;
    return (
        <div
            className="mb-6 p-5 rounded-2xl border"
            style={{ backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}20` }}
        >
            <div className="flex items-center gap-3 mb-4">
                <span className="relative flex h-3 w-3">
                    <span
                        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ backgroundColor: primaryColor }}
                    />
                    <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: primaryColor }} />
                </span>
                <span className="text-sm font-bold flex-1" style={{ color: primaryColor }}>
                    {message || 'AI analyzing...'}
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: primaryColor }}>{progress}%</span>
            </div>
            <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${primaryColor}15` }}>
                <div
                    className="absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                        width: `${progress}%`,
                        background: `linear-gradient(90deg, ${primaryColor}, ${themeConfig.accent})`,
                    }}
                />
            </div>
        </div>
    );
}

interface AiErrorCardProps {
    message: string;
    onRetry: () => void;
    onDismiss: () => void;
}

function AiErrorCard({ message, onRetry, onDismiss }: AiErrorCardProps) {
    return (
        <div className="mb-6 p-5 rounded-2xl border" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
            <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-red-500 mt-0.5">error</span>
                <div className="flex-1">
                    <h4 className="text-sm font-bold text-red-900 mb-1">AI analysis failed</h4>
                    <p className="text-sm text-red-700 mb-3">{message}</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={onRetry}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all hover:shadow-sm"
                            style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
                        >
                            <span className="material-symbols-outlined text-sm">refresh</span>
                            Try again
                        </button>
                        <button
                            onClick={onDismiss}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all hover:shadow-sm"
                            style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}
                        >
                            <span className="material-symbols-outlined text-sm">edit</span>
                            Add manually
                        </button>
                    </div>
                </div>
                <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-red-100 transition-colors">
                    <span className="material-symbols-outlined text-sm text-red-500">close</span>
                </button>
            </div>
        </div>
    );
}

const VendorProductCreatePage: React.FC = () => {
    const navigate = useNavigate();
    const { config: themeConfig } = useShopTheme();
    const primaryColor = themeConfig.primary;
    const accentColor = themeConfig.accent;

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [stockBySize, setStockBySize] = useState<StockBySize>({ S: 0, M: 0, L: 0, XL: 0 });
    const [vibeTags, setVibeTags] = useState<string[]>([]);
    const [newVibeTag, setNewVibeTag] = useState('');
    const [weatherTags, setWeatherTags] = useState<WeatherTag[]>([]);
    const [productTags, setProductTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');
    const [socialCaption, setSocialCaption] = useState('');
    const [postToSocial, setPostToSocial] = useState(false);
    const [connectedPage, setConnectedPage] = useState<ConnectedPage | null>(null);
    const [selectedPlatforms, setSelectedPlatforms] = useState({ facebook: true, instagram: true });
    const [isAiScanning, setIsAiScanning] = useState(false);
    const [aiProgress, setAiProgress] = useState(0);
    const [aiProgressMessage, setAiProgressMessage] = useState('');
    const [aiError, setAiError] = useState<string | null>(null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<any>(null);
    const [productBrief, setProductBrief] = useState('');
    const [captionLoading, setCaptionLoading] = useState(false);
    const [colorVariants, setColorVariants] = useState<ColorVariant[]>([]);
    const [mrp, setMrp] = useState(0);
    const [costPrice, setCostPrice] = useState(0);
    const [discountEnabled, setDiscountEnabled] = useState(false);
    const [discountPercent, setDiscountPercent] = useState(0);

    useEffect(() => {
        listConnectedPages()
            .then((pages) => setConnectedPage(pages.find((p) => p.status === 'connected') ?? null))
            .catch(() => setConnectedPage(null));
    }, []);

    const discountedPrice = Math.round(mrp - (mrp * discountPercent / 100));
    const margin = discountedPrice - costPrice;
    const marginPercent = costPrice > 0 ? Math.round((margin / costPrice) * 100) : null;

    const applyAiDetails = (details: any) => {
        if (!details?.title) return;
        setTitle(details.title);
        setDescription(details.description || '');
        setProductTags(details.tags || []);
        setVibeTags(details.vibe_tags || []);
        setWeatherTags(details.weather_tags || []);
        if (details.social_caption) {
            setSocialCaption(String(details.social_caption).slice(0, 280));
        }
        setAiSuggestions(details);
        toast.success('AI analysis complete!');
    };

    const runAiGeneration = async () => {
        if (productBrief.trim().length < 10) {
            toast.error('Describe the product in a sentence or two first');
            return;
        }
        setIsAiScanning(true);
        setAiProgress(0);
        setAiError(null);
        let step = 0;
        const interval = setInterval(() => {
            if (step < AI_PROGRESS_STEPS.length) {
                setAiProgress(AI_PROGRESS_STEPS[step].progress);
                setAiProgressMessage(AI_PROGRESS_STEPS[step].message);
                step += 1;
            }
        }, 800);
        try {
            const details = await aiApi.generateProductDetailsFromBrief(productBrief.trim(), mrp || undefined);
            setAiProgress(100);
            setAiProgressMessage('Complete!');
            applyAiDetails(details);
        } catch (error) {
            setAiError(describeAiError(error));
            toast.error('AI generation failed - you can still add details manually');
        } finally {
            clearInterval(interval);
            window.setTimeout(() => {
                setIsAiScanning(false);
                setAiProgress(0);
                setAiProgressMessage('');
            }, 1000);
        }
    };

    const compressOne = async (file: File): Promise<File> => {
        try {
            const blob = await imageCompression(file, {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
                fileType: 'image/jpeg',
            });
            const baseName = file.name.replace(/\.[^.]+$/, '') || 'product-image';
            return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
        } catch {
            return file;
        }
    };

    const appendPreview = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => setImages((prev) => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
    };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const incoming = acceptedFiles.slice(0, 8 - imageFiles.length);
        if (incoming.length === 0) return;
        const compressed: File[] = [];
        for (const file of incoming) {
            const ready = await compressOne(file);
            compressed.push(ready);
            appendPreview(ready);
        }
        setImageFiles((prev) => [...prev, ...compressed]);
    }, [imageFiles.length]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.heic'] },
        maxFiles: 8,
    });

    const removeImage = (index: number) => {
        const nextLength = images.length - 1;
        setImages((prev) => prev.filter((_, i) => i !== index));
        setImageFiles((prev) => prev.filter((_, i) => i !== index));
        setSelectedImageIndex((prev) => Math.min(prev > index ? prev - 1 : prev, Math.max(0, nextLength - 1)));
    };

    const publishToSocialPlatforms = async (productId?: number) => {
        if (!postToSocial || !productId || !connectedPage) return;
        const platforms = [
            selectedPlatforms.facebook ? 'facebook' : null,
            selectedPlatforms.instagram && connectedPage.instagram_account_id ? 'instagram' : null,
        ].filter((p): p is string => Boolean(p));
        if (platforms.length === 0) return;
        try {
            const results = await publishProductPost(productId, platforms, socialCaption || description || title);
            results.forEach((result) => {
                if (result.status === 'posted') toast.success(`Posted to ${result.platform}`);
                else toast.error(`${result.platform}: ${result.error}`);
            });
        } catch {
            toast.error('Could not post to social media');
        }
    };

    const buildProductPayload = (status: 'draft' | 'published') => ({
        name: title,
        description,
        price: discountEnabled ? discountedPrice : mrp,
        image: imageFiles[0] ?? null,
        status,
        ai_generated_title: aiSuggestions?.ai_generated_title || title,
        ai_generated_description: aiSuggestions?.ai_generated_description || description,
        tags: productTags,
        vibe_tags: vibeTags,
        weather_tags: weatherTags,
        category: aiSuggestions?.category || '',
        subcategory: aiSuggestions?.subcategory || '',
        metadata: aiSuggestions || {},
        stock_by_size: colorVariants.length > 0 ? {} : stockBySize,
        stock: colorVariants.length > 0 ? totalVariantStock : totalStock,
        variants: colorVariants.length > 0 ? colorVariants.map((v) => ({
            color_name: v.color_name,
            color_hex: v.color_hex,
            stock_by_size: v.stock_by_size,
            images: v.images,
        })) : undefined,
    });

    const generateSocialCaption = async () => {
        const context = [
            title ? `Product: ${title}` : '',
            mrp ? `Price: Rs. ${discountEnabled ? discountedPrice : mrp}` : '',
            description ? `Details: ${description.slice(0, 300)}` : '',
            !title && productBrief ? `About: ${productBrief}` : '',
        ].filter(Boolean).join('\n');
        if (context.length < 5) {
            toast.error('Add a title or description first');
            return;
        }
        setCaptionLoading(true);
        try {
            const generated = await aiApi.generateCaption({ context });
            setSocialCaption(generated.slice(0, 280));
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not write a caption. Try again.');
        } finally {
            setCaptionLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!title || !mrp) {
            toast.error('Please fill in title and price');
            return;
        }
        if (imageFiles.length === 0) {
            toast.error('Please upload at least one image');
            return;
        }
        setIsPublishing(true);
        try {
            const created = await vendorApi.publishProduct(buildProductPayload('published'));
            toast.success('Product published successfully!');
            await publishToSocialPlatforms(created?.id);
            navigate('/vendor/products');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to publish product');
        } finally {
            setIsPublishing(false);
        }
    };

    const handleSaveDraft = async () => {
        if (!title) {
            toast.error('Give the draft a title first');
            return;
        }
        setIsSavingDraft(true);
        try {
            await vendorApi.publishProduct(buildProductPayload('draft'));
            toast.success('Draft saved — publish it anytime from Products');
            navigate('/vendor/products');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to save draft');
        } finally {
            setIsSavingDraft(false);
        }
    };

    const updateStock = (size: keyof StockBySize, value: number) => {
        setStockBySize((prev) => ({ ...prev, [size]: value }));
    };

    const addTagOnEnter = (
        e: React.KeyboardEvent<HTMLInputElement>,
        value: string,
        setList: React.Dispatch<React.SetStateAction<string[]>>,
        clear: () => void,
    ) => {
        if (e.key !== 'Enter' || !value.trim()) return;
        e.preventDefault();
        setList((prev) => (prev.includes(value.trim()) ? prev : [...prev, value.trim()]));
        clear();
    };

    const addColorVariant = () => {
        setColorVariants((prev) => [...prev, {
            color_name: '',
            color_hex: '#000000',
            stock_by_size: { S: 0, M: 0, L: 0, XL: 0 },
            images: [],
            imageUrls: [],
        }]);
    };

    const updateVariant = (index: number, field: keyof ColorVariant, value: any) => {
        setColorVariants((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const updateVariantStock = (variantIndex: number, size: keyof StockBySize, value: number) => {
        setColorVariants((prev) => {
            const updated = [...prev];
            updated[variantIndex] = {
                ...updated[variantIndex],
                stock_by_size: { ...updated[variantIndex].stock_by_size, [size]: value },
            };
            return updated;
        });
    };

    const removeVariant = (index: number) => {
        setColorVariants((prev) => prev.filter((_, i) => i !== index));
    };

    const handleVariantImageUpload = (variantIndex: number, files: File[]) => {
        const urls = files.map((file) => URL.createObjectURL(file));
        setColorVariants((prev) => {
            const updated = [...prev];
            updated[variantIndex] = {
                ...updated[variantIndex],
                images: [...updated[variantIndex].images, ...files],
                imageUrls: [...updated[variantIndex].imageUrls, ...urls],
            };
            return updated;
        });
    };

    const totalStock = Object.values(stockBySize).reduce((a, b) => a + b, 0);
    const totalVariantStock = colorVariants.reduce(
        (total, variant) => total + Object.values(variant.stock_by_size).reduce((a, b) => a + b, 0),
        0,
    );
    const effectiveStock = colorVariants.length > 0 ? totalVariantStock : totalStock;
    const captionRemaining = Math.max(0, 280 - socialCaption.length);
    const instagramAvailable = Boolean(connectedPage?.instagram_account_id);

    const fieldStyle = { backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text };
    const cardStyle = { backgroundColor: themeConfig.cardBg };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-[1240px] px-4 md:px-6 py-8">
                    <Link to="/vendor/products" className="text-sm font-semibold" style={{ color: primaryColor }}>
                        ← All products
                    </Link>

                    <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                New product
                            </h1>
                            <p className="mt-1 text-sm font-medium" style={{ color: themeConfig.textSecondary }}>
                                Tell us about the product and AI writes the listing for you.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleSaveDraft}
                                disabled={isSavingDraft || isPublishing}
                                className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold shadow-sm border transition-all hover:shadow-md disabled:opacity-50"
                                style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                            >
                                <span className="material-symbols-outlined text-[20px]" style={{ color: themeConfig.textSecondary }}>
                                    {isSavingDraft ? 'hourglass_empty' : 'draft'}
                                </span>
                                {isSavingDraft ? 'Saving…' : 'Save draft'}
                            </button>
                            <button
                                onClick={handlePublish}
                                disabled={isPublishing || isSavingDraft}
                                className="flex items-center gap-2 px-7 py-3 rounded-2xl font-bold shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                                style={{ backgroundColor: themeConfig.buttonBg, color: themeConfig.buttonText, boxShadow: `0 10px 30px -10px ${primaryColor}60` }}
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {isPublishing ? 'hourglass_empty' : 'rocket_launch'}
                                </span>
                                {isPublishing ? 'Publishing…' : 'Publish product'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                        <div className="md:col-span-4 flex flex-col gap-6">
                            <div className="rounded-3xl shadow-lg overflow-hidden" style={cardStyle}>
                                {images.length === 0 ? (
                                    <div
                                        {...getRootProps()}
                                        className={`m-4 h-[420px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center px-6 cursor-pointer transition-colors ${isDragActive ? 'scale-[0.99]' : ''}`}
                                        style={{
                                            borderColor: isDragActive ? primaryColor : `${themeConfig.border}`,
                                            backgroundColor: isDragActive ? `${primaryColor}08` : `${themeConfig.surface}50`,
                                        }}
                                    >
                                        <input {...getInputProps()} />
                                        <div
                                            className="size-16 rounded-full flex items-center justify-center shadow-md mb-4"
                                            style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
                                        >
                                            <span className="material-symbols-outlined text-3xl">add_photo_alternate</span>
                                        </div>
                                        <p className="font-bold" style={{ color: themeConfig.text }}>
                                            Drag photos here, or click to browse
                                        </p>
                                        <p className="mt-1 text-xs" style={{ color: themeConfig.textSecondary }}>
                                            Up to 8 images · JPG, PNG, HEIC
                                        </p>
                                        <p
                                            className="mt-4 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                                            style={{ backgroundColor: `${accentColor}12`, color: accentColor }}
                                        >
                                            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                                            Photos for your store & posts — the listing text comes from your description
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="relative aspect-square w-full overflow-hidden group/preview" style={{ backgroundColor: themeConfig.border }}>
                                            {discountEnabled && discountPercent > 0 && (
                                                <div className="absolute top-4 left-4 z-20 bg-rose-500 text-white px-3 py-1 rounded-lg text-xs font-extrabold shadow-lg rotate-[-2deg]">
                                                    SALE <span className="opacity-80 font-medium">| {discountPercent}% OFF</span>
                                                </div>
                                            )}
                                            <img
                                                src={images[selectedImageIndex] ?? images[0]}
                                                alt="Product preview"
                                                className="w-full h-full object-cover object-top"
                                            />
                                            <div
                                                {...getRootProps()}
                                                className={`absolute inset-0 z-30 m-4 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center backdrop-blur-sm cursor-pointer pointer-events-none group-hover/preview:pointer-events-auto transition-opacity duration-300 ${isDragActive ? 'opacity-100' : 'opacity-0 group-hover/preview:opacity-100'}`}
                                                style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${primaryColor}80` }}
                                            >
                                                <input {...getInputProps()} />
                                                <span className="material-symbols-outlined text-3xl mb-2" style={{ color: primaryColor }}>cloud_upload</span>
                                                <p className="text-sm font-bold" style={{ color: primaryColor }}>Drop to add more photos</p>
                                            </div>
                                        </div>
                                        <div className="px-5 py-4 border-t" style={{ borderColor: themeConfig.border }}>
                                            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: themeConfig.textSecondary }}>
                                                Gallery ({images.length}/8)
                                            </p>
                                            <div className="flex items-center gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                                                {images.map((img, idx) => (
                                                    <div key={idx} className="relative shrink-0">
                                                        <button
                                                            onClick={() => setSelectedImageIndex(idx)}
                                                            className={`block w-[68px] h-[68px] rounded-xl overflow-hidden transition-all ${selectedImageIndex === idx ? 'ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
                                                            style={selectedImageIndex === idx ? { '--tw-ring-color': primaryColor } as React.CSSProperties : {}}
                                                        >
                                                            <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                                                        </button>
                                                        <button
                                                            onClick={() => removeImage(idx)}
                                                            aria-label={`Remove photo ${idx + 1}`}
                                                            className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-gray-900/80 text-white flex items-center justify-center shadow hover:bg-red-500 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[12px]">close</span>
                                                        </button>
                                                    </div>
                                                ))}
                                                {images.length < 8 && (
                                                    <button
                                                        {...getRootProps()}
                                                        className="w-[68px] h-[68px] rounded-xl border-2 border-dashed flex items-center justify-center shrink-0 transition-colors hover:scale-105"
                                                        style={{ borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                                                    >
                                                        <input {...getInputProps()} />
                                                        <span className="material-symbols-outlined text-2xl">add</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-5 flex flex-col gap-6">
                            <div className="rounded-3xl shadow-lg p-6 md:p-7" style={cardStyle}>
                                {isAiScanning && <AiProgressCard progress={aiProgress} message={aiProgressMessage} />}
                                {aiError && (
                                    <AiErrorCard
                                        message={aiError}
                                        onRetry={() => {
                                            setAiError(null);
                                            runAiGeneration();
                                        }}
                                        onDismiss={() => setAiError(null)}
                                    />
                                )}

                                <div className="flex flex-col gap-6">
                                    <div
                                        className="rounded-2xl p-5 border"
                                        style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${accentColor}08)`, borderColor: `${primaryColor}25` }}
                                    >
                                        <label className="flex items-center gap-2 text-sm font-bold mb-1" style={{ color: themeConfig.text }}>
                                            <span className="material-symbols-outlined text-[18px]" style={{ color: primaryColor }}>auto_awesome</span>
                                            Describe your product
                                        </label>
                                        <p className="text-xs mb-3" style={{ color: themeConfig.textSecondary }}>
                                            In your own words — English, Nepali, or mixed. AI writes the title, description, and tags from it.
                                        </p>
                                        <textarea
                                            value={productBrief}
                                            onChange={(e) => setProductBrief(e.target.value)}
                                            placeholder="e.g. Kalo cotton polo t-shirt, breathable, sizes M to XL, perfect for summer"
                                            className="w-full min-h-[90px] border-transparent rounded-xl text-sm leading-relaxed p-3.5 shadow-sm resize-none"
                                            style={fieldStyle}
                                        />
                                        <button
                                            onClick={runAiGeneration}
                                            disabled={isAiScanning || productBrief.trim().length < 10}
                                            className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                                            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`, boxShadow: `0 8px 20px -8px ${primaryColor}70` }}
                                        >
                                            <span className={`material-symbols-outlined text-[18px] ${isAiScanning ? 'animate-spin' : ''}`}>
                                                {isAiScanning ? 'progress_activity' : 'auto_awesome'}
                                            </span>
                                            {isAiScanning ? 'Generating…' : 'Generate details with AI'}
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>Product title</label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="e.g. Linen Summer Shirt"
                                            className="w-full border-transparent rounded-xl text-lg font-semibold py-3.5 px-4 shadow-sm"
                                            style={fieldStyle}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>Description</label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="What makes this product special?"
                                            className="w-full min-h-[130px] border-transparent rounded-xl text-base leading-relaxed p-4 shadow-sm resize-none"
                                            style={fieldStyle}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>
                                            Search tags <span className="text-xs font-normal" style={{ color: themeConfig.textSecondary }}>(help shoppers find this)</span>
                                        </label>
                                        <div className="w-full rounded-xl p-3 flex flex-wrap gap-2 items-center shadow-sm" style={fieldStyle}>
                                            {productTags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-bold shadow-sm"
                                                    style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                                                >
                                                    {tag}
                                                    <button
                                                        onClick={() => setProductTags((prev) => prev.filter((t) => t !== tag))}
                                                        className="hover:text-red-500 transition-colors flex items-center"
                                                        aria-label={`Remove ${tag}`}
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">close</span>
                                                    </button>
                                                </span>
                                            ))}
                                            <input
                                                type="text"
                                                value={newTag}
                                                onChange={(e) => setNewTag(e.target.value)}
                                                onKeyDown={(e) => addTagOnEnter(e, newTag, setProductTags, () => setNewTag(''))}
                                                placeholder="Add tag, press Enter"
                                                className="bg-transparent border-none p-0 focus:ring-0 text-sm font-medium min-w-[130px] ml-1"
                                                style={{ color: themeConfig.text }}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-5 pt-5 border-t" style={{ borderColor: themeConfig.border }}>
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-bold text-lg flex items-center gap-2" style={{ color: themeConfig.text }}>
                                                <span className="material-symbols-outlined" style={{ color: primaryColor }}>payments</span>
                                                Pricing
                                            </h4>
                                            <label className="inline-flex items-center gap-3 cursor-pointer" onClick={() => setDiscountEnabled(!discountEnabled)}>
                                                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: themeConfig.textSecondary }}>Discount</span>
                                                <ToggleSwitch on={discountEnabled} onToggle={() => setDiscountEnabled(!discountEnabled)} />
                                            </label>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Selling price</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: themeConfig.textSecondary }}>Rs.</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={mrp || ''}
                                                        placeholder="0"
                                                        onChange={(e) => setMrp(parseInt(e.target.value) || 0)}
                                                        className="w-full border-transparent rounded-xl text-base font-semibold py-3 pl-11 pr-4 shadow-sm"
                                                        style={fieldStyle}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>
                                                    Cost price <span className="text-xs font-normal">(optional)</span>
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: themeConfig.textSecondary }}>Rs.</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={costPrice || ''}
                                                        placeholder="0"
                                                        onChange={(e) => setCostPrice(parseInt(e.target.value) || 0)}
                                                        className="w-full border-transparent rounded-xl text-base font-semibold py-3 pl-11 pr-4 shadow-sm"
                                                        style={fieldStyle}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {discountEnabled && (
                                            <div
                                                className="rounded-2xl p-5 border flex flex-col gap-4"
                                                style={{ backgroundColor: `${primaryColor}05`, borderColor: `${primaryColor}15` }}
                                            >
                                                <div className="grid grid-cols-5 gap-4 items-end">
                                                    <div className="col-span-2">
                                                        <label className="block text-sm font-bold mb-2" style={{ color: themeConfig.text }}>Discount</label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={90}
                                                                value={discountPercent || ''}
                                                                placeholder="0"
                                                                onChange={(e) => setDiscountPercent(Math.min(90, Math.max(0, parseInt(e.target.value) || 0)))}
                                                                className="w-full border-transparent rounded-xl text-lg font-bold py-3 pl-4 pr-8 shadow-sm text-center"
                                                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                            />
                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold" style={{ color: themeConfig.textSecondary }}>%</span>
                                                        </div>
                                                    </div>
                                                    <div className="col-span-1 flex items-center justify-center pb-3" style={{ color: `${primaryColor}60` }}>
                                                        <span className="material-symbols-outlined">arrow_right_alt</span>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="block text-sm font-bold mb-2" style={{ color: primaryColor }}>Final price</label>
                                                        <p
                                                            className="w-full rounded-xl text-lg font-extrabold py-3 px-4 shadow-sm text-center"
                                                            style={{ backgroundColor: themeConfig.surface, color: primaryColor }}
                                                        >
                                                            Rs. {discountedPrice.toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                {marginPercent !== null && (
                                                    <div className="flex items-center justify-end gap-1.5 text-xs" style={{ color: themeConfig.textSecondary }}>
                                                        <span>Margin:</span>
                                                        <span
                                                            className={`font-bold px-1.5 py-0.5 rounded ${margin >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}
                                                        >
                                                            Rs. {margin.toLocaleString()} ({marginPercent}%)
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl shadow-lg p-6 md:p-7" style={cardStyle}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div
                                            className="size-10 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                                        >
                                            <span className="material-symbols-outlined text-2xl">campaign</span>
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-lg leading-tight" style={{ color: themeConfig.text }}>Share on social media</h3>
                                            <p className="text-xs font-medium truncate" style={{ color: themeConfig.textSecondary }}>
                                                Announce this product the moment it goes live
                                            </p>
                                        </div>
                                    </div>
                                    <ToggleSwitch on={postToSocial} onToggle={() => setPostToSocial(!postToSocial)} />
                                </div>

                                {postToSocial && !connectedPage && (
                                    <div
                                        className="mt-5 rounded-2xl border border-dashed p-5 text-center"
                                        style={{ borderColor: themeConfig.border }}
                                    >
                                        <p className="text-sm font-semibold" style={{ color: themeConfig.text }}>No social account connected yet</p>
                                        <p className="mt-1 text-xs" style={{ color: themeConfig.textSecondary }}>
                                            Connect your Facebook Page to post products automatically.
                                        </p>
                                        <Link
                                            to="/vendor/settings/accounts"
                                            className="inline-block mt-3 px-4 py-2 rounded-xl text-sm font-bold text-white"
                                            style={{ backgroundColor: primaryColor }}
                                        >
                                            Connect account
                                        </Link>
                                    </div>
                                )}

                                {postToSocial && connectedPage && (
                                    <div className="mt-5 space-y-5">
                                        <div className="flex flex-wrap gap-3">
                                            <PlatformToggle
                                                label="Facebook"
                                                badge="FB"
                                                badgeBackground="#1877F2"
                                                active={selectedPlatforms.facebook}
                                                available
                                                onToggle={() => setSelectedPlatforms((prev) => ({ ...prev, facebook: !prev.facebook }))}
                                            />
                                            <PlatformToggle
                                                label="Instagram"
                                                badge="IG"
                                                badgeBackground="linear-gradient(135deg, #f09433, #dc2743)"
                                                active={instagramAvailable && selectedPlatforms.instagram}
                                                available={instagramAvailable}
                                                onToggle={() => setSelectedPlatforms((prev) => ({ ...prev, instagram: !prev.instagram }))}
                                            />
                                        </div>
                                        <p className="text-xs" style={{ color: themeConfig.textSecondary }}>
                                            Posting as <span className="font-bold" style={{ color: themeConfig.text }}>{connectedPage.name || 'your connected Page'}</span>
                                        </p>
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="block text-sm font-bold ml-1" style={{ color: themeConfig.text }}>Caption</label>
                                                <button
                                                    onClick={generateSocialCaption}
                                                    disabled={captionLoading || (!title && productBrief.trim().length < 10)}
                                                    className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition-all disabled:opacity-40"
                                                    style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
                                                >
                                                    <span className={`material-symbols-outlined text-[14px] ${captionLoading ? 'animate-spin' : ''}`}>
                                                        {captionLoading ? 'progress_activity' : 'auto_awesome'}
                                                    </span>
                                                    {captionLoading ? 'Writing…' : 'Generate'}
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <textarea
                                                    value={socialCaption}
                                                    maxLength={280}
                                                    onChange={(e) => setSocialCaption(e.target.value)}
                                                    placeholder="Leave blank to use the product description"
                                                    className="w-full border-transparent rounded-xl text-base leading-relaxed p-4 pb-9 min-h-[110px] shadow-sm resize-none"
                                                    style={fieldStyle}
                                                />
                                                <span
                                                    className="absolute bottom-3 right-3 text-[10px] font-bold px-2 py-1 rounded-md border backdrop-blur-sm"
                                                    style={{ backgroundColor: `${themeConfig.surface}80`, borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                                                >
                                                    {captionRemaining} left
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-3 flex flex-col gap-6">
                            <div className="rounded-3xl shadow-lg p-6 flex flex-col gap-5" style={cardStyle}>
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined" style={{ color: accentColor }}>style</span>
                                        <h3 className="font-bold" style={{ color: themeConfig.text }}>Vibe match</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {vibeTags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border"
                                                style={{ backgroundColor: `${themeConfig.surface}50`, borderColor: themeConfig.border, color: themeConfig.text }}
                                            >
                                                {tag}
                                                <button
                                                    onClick={() => setVibeTags((prev) => prev.filter((t) => t !== tag))}
                                                    className="hover:text-red-500 transition-colors flex items-center"
                                                    aria-label={`Remove ${tag}`}
                                                >
                                                    <span className="material-symbols-outlined text-[13px]">close</span>
                                                </button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            value={newVibeTag}
                                            onChange={(e) => setNewVibeTag(e.target.value)}
                                            onKeyDown={(e) => addTagOnEnter(e, newVibeTag, setVibeTags, () => setNewVibeTag(''))}
                                            placeholder="Add vibe + Enter"
                                            className="bg-transparent border border-dashed rounded-lg px-2.5 py-1.5 text-sm font-medium w-[130px] focus:ring-0"
                                            style={{ borderColor: themeConfig.border, color: themeConfig.text }}
                                        />
                                    </div>
                                </div>

                                {weatherTags.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-outlined" style={{ color: accentColor }}>wb_sunny</span>
                                            <h3 className="font-bold" style={{ color: themeConfig.text }}>Weather match</h3>
                                        </div>
                                        <div className="space-y-3">
                                            {weatherTags.map((weatherTag, index) => (
                                                <div
                                                    key={index}
                                                    className="p-3 rounded-xl border"
                                                    style={{ backgroundColor: `${themeConfig.surface}50`, borderColor: themeConfig.border }}
                                                >
                                                    <span
                                                        className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide mb-1.5"
                                                        style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                                                    >
                                                        {weatherTag.tag}
                                                    </span>
                                                    <p className="text-sm leading-relaxed" style={{ color: themeConfig.textSecondary }}>{weatherTag.fit}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-3xl shadow-lg p-6" style={cardStyle}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>inventory_2</span>
                                        <h3 className="font-bold" style={{ color: themeConfig.text }}>
                                            {colorVariants.length > 0 ? `Variants (${colorVariants.length})` : 'Stock'}
                                        </h3>
                                    </div>
                                    <span
                                        className="text-xs font-semibold px-2 py-1 rounded-md"
                                        style={{
                                            backgroundColor: effectiveStock > 0 ? '#dcfce7' : '#fef2f2',
                                            color: effectiveStock > 0 ? '#16a34a' : '#dc2626',
                                        }}
                                    >
                                        {effectiveStock > 0 ? `${effectiveStock} in stock` : 'Out of stock'}
                                    </span>
                                </div>

                                {colorVariants.length === 0 ? (
                                    <div className="space-y-3">
                                        {(['S', 'M', 'L', 'XL'] as const).map((size) => (
                                            <div
                                                key={size}
                                                className={`flex items-center justify-between p-3 rounded-xl transition-opacity ${stockBySize[size] === 0 ? 'opacity-60' : ''}`}
                                                style={{ backgroundColor: `${themeConfig.surface}50` }}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span
                                                        className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center font-bold text-sm"
                                                        style={{ backgroundColor: themeConfig.surface, color: stockBySize[size] > 0 ? themeConfig.text : themeConfig.textSecondary }}
                                                    >
                                                        {size}
                                                    </span>
                                                    <span className="text-sm font-medium" style={{ color: themeConfig.textSecondary }}>{SIZE_LABELS[size]}</span>
                                                </div>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={stockBySize[size] || ''}
                                                    onChange={(e) => updateStock(size, parseInt(e.target.value) || 0)}
                                                    placeholder="0"
                                                    className="w-16 h-8 text-center rounded-lg border text-sm font-bold"
                                                    style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                                        {colorVariants.map((variant, variantIdx) => (
                                            <div
                                                key={variantIdx}
                                                className="p-4 rounded-xl border"
                                                style={{ backgroundColor: `${themeConfig.surface}50`, borderColor: themeConfig.border }}
                                            >
                                                <div className="flex items-start gap-3 mb-3">
                                                    <input
                                                        type="color"
                                                        value={variant.color_hex}
                                                        onChange={(e) => updateVariant(variantIdx, 'color_hex', e.target.value)}
                                                        className="w-10 h-10 rounded-lg cursor-pointer border"
                                                        style={{ borderColor: themeConfig.border }}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={variant.color_name}
                                                        onChange={(e) => updateVariant(variantIdx, 'color_name', e.target.value)}
                                                        placeholder="Color name (e.g. Navy Blue)"
                                                        className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium min-w-0"
                                                        style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                                    />
                                                    <button
                                                        onClick={() => removeVariant(variantIdx)}
                                                        className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                                                        aria-label="Remove variant"
                                                    >
                                                        <span className="material-symbols-outlined text-sm text-red-500">delete</span>
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    {(['S', 'M', 'L', 'XL'] as const).map((size) => (
                                                        <div key={size} className="flex items-center justify-between">
                                                            <span className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>{size}</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={variant.stock_by_size[size] || ''}
                                                                onChange={(e) => updateVariantStock(variantIdx, size, parseInt(e.target.value) || 0)}
                                                                placeholder="0"
                                                                className="w-16 h-7 text-center rounded-lg border text-xs font-bold"
                                                                style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-3">
                                                    <p className="text-xs font-medium mb-2" style={{ color: themeConfig.textSecondary }}>Variant photos</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {variant.imageUrls.map((url, imgIdx) => (
                                                            <div key={imgIdx} className="w-14 h-14 rounded-lg overflow-hidden border" style={{ borderColor: themeConfig.border }}>
                                                                <img src={url} alt="" className="w-full h-full object-cover" />
                                                            </div>
                                                        ))}
                                                        <label
                                                            className="w-14 h-14 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors"
                                                            style={{ borderColor: themeConfig.border, backgroundColor: `${themeConfig.surface}50` }}
                                                        >
                                                            <input
                                                                type="file"
                                                                multiple
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    if (e.target.files) handleVariantImageUpload(variantIdx, Array.from(e.target.files));
                                                                }}
                                                            />
                                                            <span className="material-symbols-outlined text-sm" style={{ color: themeConfig.textSecondary }}>add_photo_alternate</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button
                                    onClick={addColorVariant}
                                    className="w-full mt-4 py-2.5 text-sm font-bold rounded-xl transition-transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2"
                                    style={{ backgroundColor: `${primaryColor}10`, color: primaryColor, border: `2px dashed ${primaryColor}40` }}
                                >
                                    <span className="material-symbols-outlined text-base">palette</span>
                                    Add color variant
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </VendorShell>
    );
};

export default VendorProductCreatePage;
