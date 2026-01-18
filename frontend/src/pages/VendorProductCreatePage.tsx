import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useShopTheme } from '../contexts/ShopThemeContext';
import toast from 'react-hot-toast';

interface StockBySize {
    S: number;
    M: number;
    L: number;
    XL: number;
}

const VendorProductCreatePage: React.FC = () => {
    const navigate = useNavigate();
    const { config: themeConfig } = useShopTheme();

    const primaryColor = themeConfig.primary;
    const accentColor = themeConfig.accent;

    // Product state
    const [title, setTitle] = useState('Linen Breeze Oversized Shirt');
    const [description, setDescription] = useState('Perfect for breezy Kathmandu evenings, this oversized linen shirt brings an effortless touch to your wardrobe. Its breathable fabric ensures you stay cool while the relaxed fit offers a modern silhouette. Pair with denim or loose trousers for that ultimate street-chic look.');
    const [images, setImages] = useState<string[]>(['https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600']);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [stockBySize, setStockBySize] = useState<StockBySize>({ S: 12, M: 24, L: 8, XL: 0 });
    const [vibeTags, setVibeTags] = useState(['#Boho', '#Streetwear', '#Minimalist']);
    const [productTags, setProductTags] = useState(['Summer Collection', 'Unisex']);
    const [newTag, setNewTag] = useState('');
    const [socialCaption, setSocialCaption] = useState('Summer drop is LIVE! ☀️ The Linen Breeze Shirt is here to keep you cool. Link in bio to shop the vibe. #VibeShop #NepalStyle');
    const [postToSocial, setPostToSocial] = useState(true);
    const [isAiScanning, setIsAiScanning] = useState(true);
    const [isPublishing, setIsPublishing] = useState(false);

    // Pricing state
    const [mrp, setMrp] = useState(3000);
    const [costPrice, setCostPrice] = useState(1200);
    const [discountEnabled, setDiscountEnabled] = useState(true);
    const [discountPercent, setDiscountPercent] = useState(15);

    // Calculate discounted price
    const discountedPrice = Math.round(mrp - (mrp * discountPercent / 100));
    const margin = discountedPrice - costPrice;
    const marginPercent = Math.round((margin / costPrice) * 100);

    // Dropzone
    const onDrop = useCallback((acceptedFiles: File[]) => {
        acceptedFiles.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImages(prev => [...prev, reader.result as string].slice(0, 8));
            };
            reader.readAsDataURL(file);
        });
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.heic'] },
        maxFiles: 8
    });

    const handlePublish = async () => {
        if (!title || !mrp) {
            toast.error('Please fill in title and price');
            return;
        }
        setIsPublishing(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            toast.success('🎉 Product published successfully!');
            navigate('/vendor');
        } catch {
            toast.error('Failed to publish product');
        } finally {
            setIsPublishing(false);
        }
    };

    const handleSaveDraft = () => {
        toast.success('Draft saved!');
    };

    const updateStock = (size: keyof StockBySize, value: number) => {
        setStockBySize(prev => ({ ...prev, [size]: value }));
    };

    const removeProductTag = (tagToRemove: string) => {
        setProductTags(prev => prev.filter(tag => tag !== tagToRemove));
    };

    const addProductTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && newTag.trim()) {
            setProductTags(prev => [...prev, newTag.trim()]);
            setNewTag('');
        }
    };

    const totalStock = Object.values(stockBySize).reduce((a, b) => a + b, 0);

    return (
        <div
            className="min-h-screen flex flex-col overflow-x-hidden font-display"
            style={{
                background: `radial-gradient(at 40% 20%, ${primaryColor}12 0px, transparent 50%), radial-gradient(at 80% 0%, ${accentColor}08 0px, transparent 50%), ${themeConfig.background}`
            }}
        >
            {/* Header */}
            <header
                className="sticky top-0 z-50 w-full backdrop-blur-xl border-b px-6 py-4"
                style={{
                    backgroundColor: `${themeConfig.surface}cc`,
                    borderColor: `${themeConfig.border}60`
                }}
            >
                <div className="max-w-[1400px] mx-auto flex items-center justify-between">
                    <Link to="/vendor" className="flex items-center gap-3">
                        <div
                            className="size-10 rounded-xl flex items-center justify-center text-white shadow-lg"
                            style={{ backgroundColor: primaryColor, boxShadow: `0 10px 30px -10px ${primaryColor}50` }}
                        >
                            <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold leading-none tracking-tight" style={{ color: themeConfig.text }}>Vibe Shop</h2>
                            <span className="text-xs font-medium uppercase tracking-widest" style={{ color: themeConfig.textSecondary }}>Creator Hub</span>
                        </div>
                    </Link>
                    <div className="flex items-center gap-3">
                        <div
                            className="hidden md:flex items-center gap-2 rounded-full px-4 py-2 border"
                            style={{ backgroundColor: `${themeConfig.surface}80`, borderColor: `${themeConfig.border}60` }}
                        >
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-sm font-semibold" style={{ color: themeConfig.textSecondary }}>System Online</span>
                        </div>
                        <button
                            className="flex size-10 items-center justify-center rounded-full shadow-sm transition-colors"
                            style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                        >
                            <span className="material-symbols-outlined">notifications</span>
                        </button>
                        <button
                            className="flex h-10 items-center gap-2 rounded-full pr-4 pl-1 shadow-sm transition-colors"
                            style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                        >
                            <div
                                className="size-8 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: themeConfig.border }}
                            >
                                <span className="material-symbols-outlined text-sm">person</span>
                            </div>
                            <span className="text-sm font-bold">Alex K.</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 md:p-8 lg:p-10">
                {/* Page Header */}
                <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>New Product Drop</h1>
                        <p className="text-lg font-medium" style={{ color: themeConfig.textSecondary }}>Create your next bestseller with AI magic.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleSaveDraft}
                            className="group flex items-center gap-2 px-6 py-3 rounded-2xl font-bold shadow-sm transition-all hover:shadow-lg"
                            style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                        >
                            <span className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>draft</span>
                            Save Draft
                        </button>
                        <button
                            onClick={handlePublish}
                            disabled={isPublishing}
                            className="group flex items-center gap-2 px-8 py-3 text-white rounded-2xl font-bold shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
                            style={{ backgroundColor: primaryColor, boxShadow: `0 10px 30px -10px ${primaryColor}60` }}
                        >
                            <span className="material-symbols-outlined">{isPublishing ? 'hourglass_empty' : 'rocket_launch'}</span>
                            {isPublishing ? 'Publishing...' : 'Quick Publish'}
                        </button>
                    </div>
                </div>

                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto">

                    {/* Visual Media Card - Gallery with Thumbnails */}
                    <div className="md:col-span-4 flex flex-col gap-6">
                        <div
                            className="relative flex flex-col h-[640px] overflow-hidden rounded-[24px] shadow-lg transition-all"
                            style={{ backgroundColor: themeConfig.cardBg }}
                        >
                            {/* Main Image Preview */}
                            <div
                                className="relative flex-1 w-full overflow-hidden group/preview"
                                style={{ backgroundColor: themeConfig.border }}
                            >
                                {/* Sale Badge */}
                                {discountEnabled && (
                                    <div className="absolute top-4 left-4 z-20 bg-rose-500 text-white px-3 py-1 rounded-lg text-xs font-extrabold shadow-lg rotate-[-2deg] flex items-center gap-1">
                                        SALE <span className="opacity-80 font-medium">| {discountPercent}% OFF</span>
                                    </div>
                                )}

                                {/* Preview Button */}
                                <div
                                    className="absolute top-4 right-4 z-20 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                                    style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                                >
                                    <span className="material-symbols-outlined text-sm">visibility</span> Preview
                                </div>

                                {images[selectedImageIndex] && (
                                    <img
                                        src={images[selectedImageIndex]}
                                        alt="Product preview"
                                        className="w-full h-full object-cover object-top transition-transform duration-700 hover:scale-105"
                                    />
                                )}

                                {/* Overlay Dropzone on hover */}
                                <div
                                    {...getRootProps()}
                                    className={`absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-sm m-4 rounded-2xl border-2 border-dashed cursor-pointer pointer-events-none group-hover/preview:pointer-events-auto transition-opacity duration-300 ${isDragActive ? 'opacity-100' : 'opacity-0 group-hover/preview:opacity-100'}`}
                                    style={{
                                        backgroundColor: `${themeConfig.surface}90`,
                                        borderColor: `${primaryColor}80`
                                    }}
                                >
                                    <input {...getInputProps()} />
                                    <div
                                        className="size-14 rounded-full flex items-center justify-center shadow-lg mb-3"
                                        style={{ backgroundColor: themeConfig.surface, color: primaryColor }}
                                    >
                                        <span className="material-symbols-outlined text-2xl">cloud_upload</span>
                                    </div>
                                    <p className="text-sm font-bold" style={{ color: primaryColor }}>Drop to replace main</p>
                                </div>
                            </div>

                            {/* Gallery Thumbnails */}
                            <div
                                className="relative z-40 border-t px-6 py-4 flex flex-col gap-2"
                                style={{ backgroundColor: themeConfig.cardBg, borderColor: themeConfig.border }}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: themeConfig.textSecondary }}>
                                        Gallery ({images.length}/8)
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                                    {images.map((img, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setSelectedImageIndex(idx)}
                                            className={`relative w-[72px] h-[72px] rounded-xl overflow-hidden flex-shrink-0 transition-all ${selectedImageIndex === idx
                                                    ? 'ring-2 ring-offset-1'
                                                    : 'border hover:border-opacity-80 opacity-70 hover:opacity-100'
                                                }`}
                                            style={{
                                                ringColor: selectedImageIndex === idx ? primaryColor : undefined,
                                                borderColor: themeConfig.border
                                            }}
                                        >
                                            <img
                                                src={img}
                                                alt={`Thumbnail ${idx + 1}`}
                                                className={`w-full h-full object-cover transition-all ${selectedImageIndex !== idx ? 'grayscale-[30%] hover:grayscale-0' : ''
                                                    }`}
                                            />
                                        </button>
                                    ))}
                                    <button
                                        {...getRootProps()}
                                        className="w-[72px] h-[72px] rounded-xl border-2 border-dashed flex items-center justify-center transition-all flex-shrink-0 group/add"
                                        style={{ borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                                    >
                                        <input {...getInputProps()} />
                                        <span className="material-symbols-outlined text-3xl group-hover/add:scale-110 transition-transform">add</span>
                                    </button>
                                </div>
                            </div>

                            {/* File Info Footer */}
                            <div
                                className="px-6 py-4 border-t flex items-center justify-between"
                                style={{ backgroundColor: `${themeConfig.surface}50`, borderColor: themeConfig.border }}
                            >
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: themeConfig.textSecondary }}>Primary Image</span>
                                    <span className="text-xs font-bold truncate max-w-[150px]" style={{ color: themeConfig.text }}>summer_collection_v2.jpg</span>
                                </div>
                                <button
                                    className="text-xs font-bold px-3 py-1.5 border rounded-lg shadow-sm transition-all flex items-center gap-1"
                                    style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: primaryColor }}
                                >
                                    Replace
                                    <span className="material-symbols-outlined text-[14px]">sync_alt</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Product Details Card */}
                    <div className="md:col-span-5 flex flex-col gap-6">
                        <div
                            className="flex flex-col rounded-[24px] shadow-lg p-6 md:p-8 transition-all hover:-translate-y-0.5"
                            style={{ backgroundColor: themeConfig.cardBg }}
                        >
                            {/* AI Status */}
                            {isAiScanning && (
                                <div
                                    className="flex items-center gap-3 mb-8 p-3 rounded-xl border"
                                    style={{ backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}20` }}
                                >
                                    <span className="relative flex h-3 w-3">
                                        <span
                                            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                            style={{ backgroundColor: primaryColor }}
                                        ></span>
                                        <span
                                            className="relative inline-flex rounded-full h-3 w-3"
                                            style={{ backgroundColor: primaryColor }}
                                        ></span>
                                    </span>
                                    <span className="text-sm font-bold" style={{ color: primaryColor }}>Gemini is scanning for vibes...</span>
                                    <span className="ml-auto text-xs font-medium" style={{ color: `${primaryColor}80` }}>85% confidence</span>
                                </div>
                            )}

                            <div className="flex flex-col gap-6 flex-1">
                                {/* Title */}
                                <div>
                                    <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>Product Title</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            className="w-full border-transparent rounded-xl text-lg font-semibold py-4 pl-4 pr-10 transition-all shadow-sm"
                                            style={{
                                                backgroundColor: `${themeConfig.surface}80`,
                                                color: themeConfig.text
                                            }}
                                        />
                                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2" style={{ color: themeConfig.textSecondary }}>edit</span>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="flex-1 flex flex-col">
                                    <div className="flex items-center justify-between mb-2 ml-1">
                                        <label className="block text-sm font-bold" style={{ color: themeConfig.text }}>Vibe-rich Description</label>
                                        <button className="text-xs font-bold flex items-center gap-1" style={{ color: primaryColor }}>
                                            <span className="material-symbols-outlined text-[14px]">refresh</span> Regenerate
                                        </button>
                                    </div>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full flex-1 min-h-[140px] border-transparent rounded-xl text-base leading-relaxed p-4 transition-all shadow-sm resize-none"
                                        style={{
                                            backgroundColor: `${themeConfig.surface}80`,
                                            color: themeConfig.text
                                        }}
                                    />
                                </div>

                                {/* Product Tags */}
                                <div>
                                    <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>
                                        Product Tags <span className="text-xs font-normal" style={{ color: themeConfig.textSecondary }}>(Internal Search)</span>
                                    </label>
                                    <div
                                        className="w-full border rounded-xl p-3 flex flex-wrap gap-2 items-center transition-all shadow-sm"
                                        style={{ backgroundColor: `${themeConfig.surface}80`, borderColor: 'transparent' }}
                                    >
                                        {productTags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-bold shadow-sm"
                                                style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                                            >
                                                {tag}
                                                <button
                                                    onClick={() => removeProductTag(tag)}
                                                    className="hover:text-red-500 transition-colors flex items-center"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                                </button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            value={newTag}
                                            onChange={(e) => setNewTag(e.target.value)}
                                            onKeyDown={addProductTag}
                                            placeholder="Add tag + Enter"
                                            className="bg-transparent border-none p-0 focus:ring-0 text-sm font-medium min-w-[120px] ml-1"
                                            style={{ color: themeConfig.text }}
                                        />
                                    </div>
                                </div>

                                {/* Pricing Section */}
                                <div className="space-y-5 pt-4 border-t" style={{ borderColor: themeConfig.border }}>
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-lg flex items-center gap-2" style={{ color: themeConfig.text }}>
                                            <span className="material-symbols-outlined" style={{ color: primaryColor }}>payments</span>
                                            Pricing
                                        </h4>
                                        <label
                                            className="inline-flex items-center cursor-pointer gap-3 px-3 py-1.5 rounded-full border transition-colors"
                                            style={{ backgroundColor: `${themeConfig.surface}50`, borderColor: themeConfig.border }}
                                        >
                                            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: themeConfig.textSecondary }}>Enable Discount</span>
                                            <div
                                                className="relative w-9 h-5 rounded-full transition-colors cursor-pointer"
                                                style={{ backgroundColor: discountEnabled ? primaryColor : themeConfig.border }}
                                                onClick={() => setDiscountEnabled(!discountEnabled)}
                                            >
                                                <div
                                                    className="absolute top-[2px] w-4 h-4 bg-white rounded-full transition-all shadow-sm"
                                                    style={{ left: discountEnabled ? '18px' : '2px' }}
                                                ></div>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>
                                                MRP <span className="text-xs font-normal">(Max Retail)</span>
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: themeConfig.textSecondary }}>Rs.</span>
                                                <input
                                                    type="number"
                                                    value={mrp}
                                                    onChange={(e) => setMrp(parseInt(e.target.value) || 0)}
                                                    className="w-full border-transparent rounded-xl text-base font-semibold py-3 pl-10 pr-4 transition-all shadow-sm"
                                                    style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>
                                                Cost Price <span className="text-xs font-normal">(Margin)</span>
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: themeConfig.textSecondary }}>Rs.</span>
                                                <input
                                                    type="number"
                                                    value={costPrice}
                                                    onChange={(e) => setCostPrice(parseInt(e.target.value) || 0)}
                                                    className="w-full border-transparent rounded-xl text-base font-semibold py-3 pl-10 pr-4 transition-all shadow-sm"
                                                    style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Discount Section */}
                                    {discountEnabled && (
                                        <div
                                            className="rounded-2xl p-5 border flex flex-col gap-4 relative overflow-hidden"
                                            style={{ backgroundColor: `${primaryColor}05`, borderColor: `${primaryColor}15` }}
                                        >
                                            <div
                                                className="absolute -right-6 -top-6 w-20 h-20 rounded-full blur-2xl"
                                                style={{ backgroundColor: `${primaryColor}15` }}
                                            ></div>

                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: primaryColor }}>Sale Active</span>
                                                    <div className="h-px w-8" style={{ backgroundColor: `${primaryColor}30` }}></div>
                                                </div>
                                                <div className="px-2 py-1 bg-rose-500 text-white text-[10px] font-extrabold uppercase tracking-wider rounded shadow-sm rotate-[-2deg]">
                                                    SALE
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-5 gap-4 items-end">
                                                <div className="col-span-2">
                                                    <label className="block text-sm font-bold mb-2" style={{ color: themeConfig.text }}>Discount (%)</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={discountPercent}
                                                            onChange={(e) => setDiscountPercent(parseInt(e.target.value) || 0)}
                                                            className="w-full border-transparent rounded-xl text-lg font-bold py-3 pl-4 pr-8 transition-all shadow-sm text-center"
                                                            style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold" style={{ color: themeConfig.textSecondary }}>%</span>
                                                    </div>
                                                </div>
                                                <div className="col-span-1 flex items-center justify-center pb-4" style={{ color: `${primaryColor}40` }}>
                                                    <span className="material-symbols-outlined">arrow_right_alt</span>
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-sm font-bold mb-2" style={{ color: primaryColor }}>Discounted Price</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: primaryColor }}>Rs.</span>
                                                        <input
                                                            type="number"
                                                            value={discountedPrice}
                                                            readOnly
                                                            className="w-full rounded-xl text-lg font-extrabold py-3 pl-9 pr-3 transition-all shadow-sm"
                                                            style={{ backgroundColor: themeConfig.surface, borderColor: `${primaryColor}30`, color: primaryColor }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-end gap-1.5 text-xs" style={{ color: themeConfig.textSecondary }}>
                                                <span>Margin:</span>
                                                <span className="font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                                    Rs. {margin} ({marginPercent}%)
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Publishing Options Card */}
                        <div
                            className="rounded-[24px] shadow-lg p-6 md:p-8 transition-all hover:-translate-y-0.5"
                            style={{ backgroundColor: themeConfig.cardBg }}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="size-10 rounded-xl flex items-center justify-center"
                                        style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                                    >
                                        <span className="material-symbols-outlined text-2xl">campaign</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg leading-tight" style={{ color: themeConfig.text }}>Publishing Options</h3>
                                        <p className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>Manage external shares</p>
                                    </div>
                                </div>
                                <label className="inline-flex items-center cursor-pointer">
                                    <div
                                        className="relative w-12 h-7 rounded-full transition-colors cursor-pointer"
                                        style={{ backgroundColor: postToSocial ? primaryColor : themeConfig.border }}
                                        onClick={() => setPostToSocial(!postToSocial)}
                                    >
                                        <div
                                            className="absolute top-[2px] w-6 h-6 bg-white rounded-full transition-all shadow-sm"
                                            style={{ left: postToSocial ? '22px' : '2px' }}
                                        ></div>
                                    </div>
                                    <span
                                        className="ms-3 text-sm font-bold transition-colors"
                                        style={{ color: postToSocial ? primaryColor : themeConfig.textSecondary }}
                                    >Post to Social Media</span>
                                </label>
                            </div>

                            {postToSocial && (
                                <div className="space-y-6">
                                    {/* Social Icons */}
                                    <div className="flex flex-wrap items-center gap-4">
                                        {[
                                            { name: 'Instagram', gradient: 'linear-gradient(135deg, #f09433 0%, #dc2743 50%, #bc1888 100%)', color: '#dc2743', active: true },
                                            { name: 'TikTok', color: '#000', active: false },
                                            { name: 'Facebook', color: '#1877F2', active: false },
                                        ].map((social) => (
                                            <div
                                                key={social.name}
                                                className={`group relative cursor-pointer transition-opacity ${social.active ? '' : 'opacity-40 hover:opacity-100'}`}
                                            >
                                                <div
                                                    className="size-12 rounded-xl p-[2px] shadow-sm transition-all hover:scale-105 hover:shadow-md"
                                                    style={{ background: social.gradient || social.color }}
                                                >
                                                    <div
                                                        className="h-full w-full rounded-[10px] flex items-center justify-center transition-colors group-hover:bg-transparent"
                                                        style={{ backgroundColor: themeConfig.surface }}
                                                    >
                                                        <span
                                                            className="material-symbols-outlined transition-colors group-hover:text-white"
                                                            style={{ color: social.color }}
                                                        >
                                                            {social.name === 'Instagram' ? 'photo_camera' : social.name === 'TikTok' ? 'music_note' : 'group'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {social.active && (
                                                    <div
                                                        className="absolute -top-1 -right-1 size-5 text-white rounded-full flex items-center justify-center border-2 shadow-sm z-10"
                                                        style={{ backgroundColor: primaryColor, borderColor: themeConfig.surface }}
                                                    >
                                                        <span className="material-symbols-outlined text-[12px] font-bold">check</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Social Caption */}
                                    <div>
                                        <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>Customize Social Caption</label>
                                        <div className="relative">
                                            <textarea
                                                value={socialCaption}
                                                onChange={(e) => setSocialCaption(e.target.value)}
                                                className="w-full border-transparent rounded-xl text-base leading-relaxed p-4 min-h-[110px] transition-all shadow-sm resize-none"
                                                style={{
                                                    backgroundColor: `${themeConfig.surface}80`,
                                                    color: themeConfig.text
                                                }}
                                            />
                                            <div className="absolute bottom-3 right-3">
                                                <span
                                                    className="text-[10px] font-bold px-2 py-1 rounded-md border backdrop-blur-sm"
                                                    style={{ backgroundColor: `${themeConfig.surface}80`, borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                                                >{280 - socialCaption.length} chars left</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column - Tags & Stock */}
                    <div className="md:col-span-3 flex flex-col gap-6">
                        {/* Vibe Tags Card */}
                        <div
                            className="rounded-[24px] shadow-lg p-6 flex flex-col gap-5 transition-all hover:-translate-y-0.5"
                            style={{ backgroundColor: themeConfig.cardBg }}
                        >
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined" style={{ color: accentColor }}>style</span>
                                    <h3 className="font-bold" style={{ color: themeConfig.text }}>Vibe Match</h3>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {vibeTags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-3 py-1.5 rounded-lg text-sm font-medium border cursor-pointer transition-colors"
                                            style={{
                                                backgroundColor: `${themeConfig.surface}50`,
                                                borderColor: themeConfig.border,
                                                color: themeConfig.text
                                            }}
                                        >{tag}</span>
                                    ))}
                                    <button
                                        onClick={() => setVibeTags(prev => [...prev, '#NewTag'])}
                                        className="size-8 rounded-lg border border-dashed flex items-center justify-center transition-colors"
                                        style={{ borderColor: themeConfig.border, color: themeConfig.textSecondary }}
                                    >
                                        <span className="material-symbols-outlined text-sm">add</span>
                                    </button>
                                </div>
                            </div>

                            <div className="h-px w-full" style={{ backgroundColor: themeConfig.border }}></div>

                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-amber-400">wb_sunny</span>
                                    <h3 className="font-bold" style={{ color: themeConfig.text }}>Weather Fit</h3>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm font-bold border border-amber-100 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">sunny</span>SunnyDay
                                    </span>
                                    <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-bold border border-blue-100 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">water_drop</span>Monsoon
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Stock Card */}
                        <div
                            className="rounded-[24px] shadow-lg p-6 flex-1 transition-all hover:-translate-y-0.5"
                            style={{ backgroundColor: themeConfig.cardBg }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>inventory_2</span>
                                    <h3 className="font-bold" style={{ color: themeConfig.text }}>Stock</h3>
                                </div>
                                <span
                                    className="text-xs font-semibold px-2 py-1 rounded-md"
                                    style={{
                                        backgroundColor: totalStock > 0 ? '#dcfce7' : '#fef2f2',
                                        color: totalStock > 0 ? '#16a34a' : '#dc2626'
                                    }}
                                >{totalStock > 0 ? 'In Stock' : 'Out of Stock'}</span>
                            </div>

                            <div className="space-y-3">
                                {(['S', 'M', 'L', 'XL'] as const).map((size) => (
                                    <div
                                        key={size}
                                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${stockBySize[size] === 0 ? 'opacity-60' : ''}`}
                                        style={{ backgroundColor: `${themeConfig.surface}50`, borderColor: 'transparent' }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center font-bold text-sm"
                                                style={{ backgroundColor: themeConfig.surface, color: stockBySize[size] > 0 ? themeConfig.text : themeConfig.textSecondary }}
                                            >{size}</span>
                                            <span className="text-sm font-medium" style={{ color: themeConfig.textSecondary }}>
                                                {size === 'S' ? 'Small' : size === 'M' ? 'Medium' : size === 'L' ? 'Large' : 'X-Large'}
                                            </span>
                                        </div>
                                        <input
                                            type="number"
                                            value={stockBySize[size] || ''}
                                            onChange={(e) => updateStock(size, parseInt(e.target.value) || 0)}
                                            placeholder="0"
                                            className="w-16 h-8 text-center rounded-lg border text-sm font-bold"
                                            style={{
                                                backgroundColor: themeConfig.surface,
                                                borderColor: themeConfig.border,
                                                color: themeConfig.text
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>

                            <button
                                className="w-full mt-4 py-2 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1"
                                style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}
                            >
                                <span className="material-symbols-outlined text-sm">add</span> Add Variant
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default VendorProductCreatePage;
