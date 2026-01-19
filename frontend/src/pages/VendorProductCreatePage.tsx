import React, { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import imageCompression from 'browser-image-compression';
import { useShopTheme } from '../contexts/ShopThemeContext';
import { vendorApi, type WeatherTag } from '../api/vendor';
import toast from 'react-hot-toast';
import ThemePickerButton from '../components/theme/ThemePickerButton';

interface StockBySize {
    S: number;
    M: number;
    L: number;
    XL: number;
    [key: string]: number;
}

interface VendorProfile {
    store_name?: string;
    logo?: string;
}

interface ColorVariant {
    id?: number;
    color_name: string;
    color_hex: string;
    stock_by_size: StockBySize;
    images: File[];
    imageUrls: string[];
}

const VendorProductCreatePage: React.FC = () => {
    const navigate = useNavigate();
    const { config: themeConfig } = useShopTheme();

    const primaryColor = themeConfig.primary;
    const accentColor = themeConfig.accent;

    // Vendor profile state
    const [vendorProfile, setVendorProfile] = useState<VendorProfile>({});

    // Product state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [stockBySize, setStockBySize] = useState<StockBySize>({ S: 0, M: 0, L: 0, XL: 0 });
    const [vibeTags, setVibeTags] = useState<string[]>([]);
    const [weatherTags, setWeatherTags] = useState<WeatherTag[]>([]);
    const [productTags, setProductTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');
    const [socialCaption, setSocialCaption] = useState('');
    const [postToSocial, setPostToSocial] = useState(false);
    const [isAiScanning, setIsAiScanning] = useState(false);
    const [aiProgress, setAiProgress] = useState(0);
    const [aiProgressMessage, setAiProgressMessage] = useState('');
    const [aiError, setAiError] = useState<string | null>(null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<any>(null);
    const [colorVariants, setColorVariants] = useState<ColorVariant[]>([]);
    const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(null);

    useEffect(() => {
        const loadVendorProfile = async () => {
            try {
                const profile = await vendorApi.getVendorProfile();
                setVendorProfile({
                    store_name: profile.store_name || 'Vibe Shop',
                    logo: profile.logo || null
                });
            } catch (error) {
                console.error('Failed to load vendor profile:', error);
            }
        };
        loadVendorProfile();
    }, []);

    // Pricing state
    const [mrp, setMrp] = useState(0);
    const [costPrice, setCostPrice] = useState(0);
    const [discountEnabled, setDiscountEnabled] = useState(false);
    const [discountPercent, setDiscountPercent] = useState(0);

    // Calculate discounted price
    const discountedPrice = Math.round(mrp - (mrp * discountPercent / 100));
    const margin = discountedPrice - costPrice;
    const marginPercent = Math.round((margin / costPrice) * 100);

    // Dropzone
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const newFiles = acceptedFiles.slice(0, 8 - imageFiles.length);

        const compressionOptions = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: 'image/jpeg'
        };

        const compressedFiles: File[] = [];

        for (const file of newFiles) {
            try {
                const compressedFile = await imageCompression(file, compressionOptions);
                compressedFiles.push(compressedFile);

                const reader = new FileReader();
                reader.onloadend = () => {
                    setImages(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(compressedFile);
            } catch (error) {
                console.error('Image compression failed:', error);
                compressedFiles.push(file);

                const reader = new FileReader();
                reader.onloadend = () => {
                    setImages(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(file);
            }
        }

        setImageFiles(prev => [...prev, ...compressedFiles]);

        if (compressedFiles.length > 0 && imageFiles.length === 0) {
            setIsAiScanning(true);
            setAiProgress(0);
            setAiError(null);

            const progressSteps = [
                { progress: 15, message: 'Uploading image...' },
                { progress: 30, message: 'AI analyzing product...' },
                { progress: 50, message: 'Detecting colors & materials...' },
                { progress: 70, message: 'Generating tags & vibes...' },
                { progress: 85, message: 'Creating description...' },
                { progress: 95, message: 'Finalizing details...' }
            ];

            let currentStep = 0;
            const progressInterval = setInterval(() => {
                if (currentStep < progressSteps.length) {
                    setAiProgress(progressSteps[currentStep].progress);
                    setAiProgressMessage(progressSteps[currentStep].message);
                    currentStep++;
                }
            }, 800);

            try {
                const formData = new FormData();
                formData.append('image', compressedFiles[0]);
                formData.append('price', mrp.toString());

                const response = await fetch('http://localhost:8000/api/products/generate-details/', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${localStorage.getItem('token')}`
                    },
                    body: formData
                });

                const data = await response.json();

                clearInterval(progressInterval);

                if (!response.ok) {
                    throw new Error(data.error || 'AI analysis failed');
                }

                setAiProgress(100);
                setAiProgressMessage('Complete!');

                if (data.title) {
                    setTitle(data.title);
                    setDescription(data.description || '');
                    setProductTags(data.tags || []);
                    setVibeTags(data.vibe_tags || []);
                    setWeatherTags(data.weather_tags || []);
                    setAiSuggestions(data);

                    setTimeout(() => {
                        toast.success('AI analysis complete!');
                        setAiError(null);
                    }, 500);
                }
            } catch (error: any) {
                console.error('AI analysis failed:', error);
                clearInterval(progressInterval);

                let errorMessage = 'AI analysis encountered an issue. You can still create your product manually!';

                if (error.message?.includes('rate_limit') || error.message?.includes('429')) {
                    errorMessage = 'AI is taking a quick break (rate limit reached). Please wait a moment and try again, or fill in details manually.';
                } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
                    errorMessage = 'Connection issue detected. Check your internet and try again, or proceed with manual entry.';
                } else if (error.message?.includes('timeout')) {
                    errorMessage = 'AI is taking longer than expected. Try with a smaller image, or add details manually.';
                }

                setAiError(errorMessage);
                toast.error('AI analysis failed - you can still add details manually');
            } finally {
                setTimeout(() => {
                    setIsAiScanning(false);
                    setAiProgress(0);
                    setAiProgressMessage('');
                }, 1000);
            }
        }
    }, [imageFiles.length, mrp]);

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

        if (imageFiles.length === 0) {
            toast.error('Please upload at least one image');
            return;
        }

        setIsPublishing(true);
        try {
            const finalPrice = discountEnabled ? discountedPrice : mrp;

            await vendorApi.publishProduct({
                name: title,
                description: description,
                price: finalPrice,
                image: imageFiles[0],
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
                variants: colorVariants.length > 0 ? colorVariants.map(v => ({
                    color_name: v.color_name,
                    color_hex: v.color_hex,
                    stock_by_size: v.stock_by_size,
                    images: v.images
                })) : undefined
            });

            toast.success('🎉 Product published successfully!');
            navigate('/vendor');
        } catch (error: any) {
            console.error('Failed to publish product:', error);
            toast.error(error.response?.data?.error || 'Failed to publish product');
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

    const addColorVariant = () => {
        const newVariant = {
            color_name: '',
            color_hex: '#000000',
            stock_by_size: { S: 0, M: 0, L: 0, XL: 0 },
            images: [],
            imageUrls: []
        };
        setColorVariants(prev => {
            const updated = [...prev, newVariant];
            console.log('Adding color variant. Total variants:', updated.length);
            return updated;
        });
        toast.success('Color variant added! Fill in the details below.');
    };

    const updateVariant = (index: number, field: keyof ColorVariant, value: any) => {
        setColorVariants(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const updateVariantStock = (variantIndex: number, size: keyof StockBySize, value: number) => {
        setColorVariants(prev => {
            const updated = [...prev];
            updated[variantIndex].stock_by_size = {
                ...updated[variantIndex].stock_by_size,
                [size]: value
            };
            return updated;
        });
    };

    const removeVariant = (index: number) => {
        setColorVariants(prev => prev.filter((_, i) => i !== index));
        if (selectedVariantIndex === index) {
            setSelectedVariantIndex(null);
        }
    };

    const handleVariantImageUpload = (variantIndex: number, files: File[]) => {
        const urls = files.map(file => URL.createObjectURL(file));
        setColorVariants(prev => {
            const updated = [...prev];
            updated[variantIndex].images = [...updated[variantIndex].images, ...files];
            updated[variantIndex].imageUrls = [...updated[variantIndex].imageUrls, ...urls];
            return updated;
        });
    };

    const totalStock = Object.values(stockBySize).reduce((a, b) => a + b, 0);
    const totalVariantStock = colorVariants.reduce((total, variant) =>
        total + Object.values(variant.stock_by_size).reduce((a, b) => a + b, 0), 0
    );

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
                            className="size-10 rounded-xl flex items-center justify-center shadow-lg overflow-hidden"
                            style={{
                                backgroundColor: vendorProfile.logo ? 'white' : themeConfig.buttonBg,
                                color: themeConfig.buttonText,
                                boxShadow: `0 10px 30px -10px ${primaryColor}50`
                            }}
                        >
                            {vendorProfile.logo ? (
                                <img src={`http://localhost:8000${vendorProfile.logo}`} alt="Store Logo" className="w-full h-full object-cover" />
                            ) : (
                                <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold leading-none tracking-tight" style={{ color: themeConfig.text }}>{vendorProfile.store_name || 'Vibe Shop'}</h2>
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
                            className="group flex items-center gap-2 px-8 py-3 rounded-2xl font-bold shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
                            style={{ backgroundColor: themeConfig.buttonBg, color: themeConfig.buttonText, boxShadow: `0 10px 30px -10px ${primaryColor}60` }}
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
                            {/* AI Status with Progress Bar */}
                            {isAiScanning && (
                                <div
                                    className="mb-8 p-5 rounded-2xl border"
                                    style={{ backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}20` }}
                                >
                                    <div className="flex items-center gap-3 mb-4">
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
                                        <span className="text-sm font-bold flex-1" style={{ color: primaryColor }}>
                                            {aiProgressMessage || 'AI analyzing...'}
                                        </span>
                                        <span className="text-sm font-bold tabular-nums" style={{ color: primaryColor }}>
                                            {aiProgress}%
                                        </span>
                                    </div>

                                    <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${primaryColor}15` }}>
                                        <div
                                            className="absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out"
                                            style={{
                                                width: `${aiProgress}%`,
                                                background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})`,
                                                boxShadow: `0 0 10px ${primaryColor}40`
                                            }}
                                        >
                                            <div
                                                className="absolute inset-0 animate-pulse"
                                                style={{
                                                    background: `linear-gradient(90deg, transparent, ${primaryColor}30, transparent)`,
                                                    animation: 'shimmer 1.5s infinite'
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* AI Error Message */}
                            {aiError && (
                                <div
                                    className="mb-8 p-5 rounded-2xl border"
                                    style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 mt-0.5">
                                            <span className="material-symbols-outlined text-red-500">error</span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-sm font-bold text-red-900 mb-1">AI Analysis Failed</h4>
                                            <p className="text-sm text-red-700 mb-3">{aiError}</p>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => {
                                                        setAiError(null);
                                                        if (imageFiles.length > 0) {
                                                            const event = { target: { files: imageFiles } };
                                                            onDrop(imageFiles);
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all hover:shadow-sm"
                                                    style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
                                                >
                                                    <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm">refresh</span>
                                                        Try Again
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={() => setAiError(null)}
                                                    className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all hover:shadow-sm"
                                                    style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}
                                                >
                                                    <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm">edit</span>
                                                        Add Manually
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setAiError(null)}
                                            className="flex-shrink-0 p-1 rounded-lg hover:bg-red-100 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-sm text-red-500">close</span>
                                        </button>
                                    </div>
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

                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined" style={{ color: accentColor }}>wb_sunny</span>
                                    <h3 className="font-bold" style={{ color: themeConfig.text }}>Weather Match</h3>
                                </div>
                                <div className="space-y-3">
                                    {weatherTags.map((weatherTag, index) => (
                                        <div
                                            key={index}
                                            className="p-3 rounded-xl border transition-all"
                                            style={{
                                                backgroundColor: `${themeConfig.surface}50`,
                                                borderColor: themeConfig.border
                                            }}
                                        >
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span
                                                    className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
                                                    style={{
                                                        backgroundColor: `${primaryColor}15`,
                                                        color: primaryColor
                                                    }}
                                                >{weatherTag.tag}</span>
                                            </div>
                                            <p className="text-sm leading-relaxed" style={{ color: themeConfig.textSecondary }}>
                                                {weatherTag.fit}
                                            </p>
                                        </div>
                                    ))}
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
                                    <h3 className="font-bold" style={{ color: themeConfig.text }}>
                                        {colorVariants.length > 0 ? `Color Variants (${colorVariants.length})` : 'Stock'}
                                    </h3>
                                </div>
                                <span
                                    className="text-xs font-semibold px-2 py-1 rounded-md"
                                    style={{
                                        backgroundColor: (colorVariants.length > 0 ? totalVariantStock : totalStock) > 0 ? '#dcfce7' : '#fef2f2',
                                        color: (colorVariants.length > 0 ? totalVariantStock : totalStock) > 0 ? '#16a34a' : '#dc2626'
                                    }}
                                >{(colorVariants.length > 0 ? totalVariantStock : totalStock) > 0 ? 'In Stock' : 'Out of Stock'}</span>
                            </div>

                            {colorVariants.length === 0 ? (
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
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        value={variant.color_name}
                                                        onChange={(e) => updateVariant(variantIdx, 'color_name', e.target.value)}
                                                        placeholder="Color name (e.g., Navy Blue)"
                                                        className="w-full px-3 py-2 rounded-lg border text-sm font-medium"
                                                        style={{
                                                            backgroundColor: themeConfig.surface,
                                                            borderColor: themeConfig.border,
                                                            color: themeConfig.text
                                                        }}
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => removeVariant(variantIdx)}
                                                    className="p-2 rounded-lg hover:bg-red-50 transition-colors"
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
                                                            value={variant.stock_by_size[size] || ''}
                                                            onChange={(e) => updateVariantStock(variantIdx, size, parseInt(e.target.value) || 0)}
                                                            placeholder="0"
                                                            className="w-16 h-7 text-center rounded-lg border text-xs font-bold"
                                                            style={{
                                                                backgroundColor: themeConfig.surface,
                                                                borderColor: themeConfig.border,
                                                                color: themeConfig.text
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-3">
                                                <label className="block text-xs font-medium mb-2" style={{ color: themeConfig.textSecondary }}>
                                                    Variant Images
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {variant.imageUrls.map((url, imgIdx) => (
                                                        <div key={imgIdx} className="w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: themeConfig.border }}>
                                                            <img src={url} alt="" className="w-full h-full object-cover" />
                                                        </div>
                                                    ))}
                                                    <label
                                                        className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-opacity-50 transition-colors"
                                                        style={{ borderColor: themeConfig.border, backgroundColor: `${themeConfig.surface}50` }}
                                                    >
                                                        <input
                                                            type="file"
                                                            multiple
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={(e) => {
                                                                if (e.target.files) {
                                                                    handleVariantImageUpload(variantIdx, Array.from(e.target.files));
                                                                }
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
                                className="w-full mt-4 py-2.5 text-sm font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                                style={{
                                    backgroundColor: `${primaryColor}10`,
                                    color: primaryColor,
                                    border: `2px dashed ${primaryColor}40`
                                }}
                            >
                                <span className="material-symbols-outlined text-base">palette</span>
                                Add Color Variant
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            <ThemePickerButton />
        </div>
    );
};

export default VendorProductCreatePage;
