import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, Upload, Sparkles, Check, Loader2, ArrowLeft } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import toast from 'react-hot-toast';
import type { AIProductDetails } from '../api/ai';
import AISuggestionsPanel from '../components/vendor/AISuggestionsPanel';
import DashboardTabs from '../components/vendor/DashboardTabs';

interface ProductData {
    id?: number; // Added draft ID
    name: string;
    description: string;
    price: string;
    images: File[];
    aiData?: AIProductDetails;
    stock_by_size: Record<string, number>;
}

export default function VendorPage() {
    // View State: 'list' (Dashboard) or 'add' (Wizard)
    const [view, setView] = useState<'list' | 'add'>('list');

    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [productData, setProductData] = useState<ProductData>({
        name: '',
        description: '',
        price: '',
        images: [],
        stock_by_size: {},
    });

    const handleNext = async () => {
        // Step 1: Photos -> Step 2: Info (Trigger AI)
        if (step === 1) {
            if (productData.images.length === 0) {
                toast.error('Please upload at least one product image');
                return;
            }
            // Trigger AI before moving next
            await generateAIContent();
        }

        // Step 2: Product Info -> Step 3: Success (Publish)
        setStep(prev => Math.min(prev + 1, 3));
    };

    const handlePrevious = () => {
        setStep(prev => Math.max(prev - 1, 1));
    };

    const handlePublish = async () => {
        if (!productData.name || !productData.price || productData.images.length === 0) {
            toast.error('Please fill in all required fields');
            return;
        }

        const loadingToast = toast.loading('Publishing product...');

        try {
            const { vendorApi } = await import('../api/vendor');

            const payload = {
                name: productData.name,
                description: productData.description,
                price: parseFloat(productData.price),
                stock: Object.values(productData.stock_by_size).reduce((a, b) => a + b, 0) || 10,
                stock_by_size: productData.stock_by_size,
                image: productData.images[0], // Use first image
                ai_generated_title: productData.aiData?.title,
                ai_generated_description: productData.aiData?.description,
                tags: productData.aiData?.tags,
                category: productData.aiData?.category,
                subcategory: productData.aiData?.subcategory,
                vibe_tags: productData.aiData?.vibe_tags,
                metadata: productData.aiData ? {
                    attributes: productData.aiData.attributes,
                    target_audience: productData.aiData.target_audience,
                    occasions: productData.aiData.occasions,
                    season: productData.aiData.season,
                    care_instructions: productData.aiData.care_instructions,
                    seo_keywords: productData.aiData.seo_keywords,
                    selling_points: productData.aiData.selling_points,
                } : undefined,
            };

            if (productData.id) {
                await vendorApi.updateProduct(productData.id, payload);
            } else {
                await vendorApi.publishProduct(payload);
            }

            toast.dismiss(loadingToast);
            toast.success('🎉 Product published successfully!');

            // Reset and return to list view
            setProductData({ name: '', description: '', price: '', images: [], stock_by_size: {} });
            setStep(1);
            setView('list'); // Return to dashboard

        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Failed to publish product');
            console.error(error);
        }
    };

    const { getRootProps, getInputProps } = useDropzone({
        accept: { 'image/*': [] },
        onDrop: (files) => {
            setProductData(prev => ({ ...prev, images: [...prev.images, ...files] }));
            toast.success(`${files.length} image(s) added`);
        },
    });

    const generateAIContent = async () => {
        if (productData.images.length === 0) {
            toast.error('Please upload at least one image first');
            return;
        }

        setIsProcessing(true);
        const loadingToast = toast.loading('Uploading image & initializing AI...');

        try {
            // 1. Create Draft Product
            const { vendorApi } = await import('../api/vendor');
            const draft = await vendorApi.createDraftProduct(productData.images[0]);

            setProductData(prev => ({ ...prev, id: draft.id }));

            toast.success('Image uploaded! connecting to AI...', { id: loadingToast });

            // 2. Connect WebSocket
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Assuming API runs on port 8000 for dev, we can try to derive from API URL or hardcode for now
            // A robust way would be using env var, but for MVP:
            const wsBase = 'localhost:8000'; // Adjust if using different port or env
            const wsUrl = `${protocol}//${wsBase}/ws/vendor/ai-generate/`;

            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WS Connected');
                ws.send(JSON.stringify({
                    image_id: draft.id,
                    price: productData.price ? parseFloat(productData.price) : undefined
                }));
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.status === 'processing') {
                    toast.loading(data.message || 'AI is thinking...', { id: loadingToast });
                } else if (data.status === 'completed') {
                    const result = data.data;
                    setProductData(prev => ({
                        ...prev,
                        name: result.title,
                        description: result.description,
                        aiData: result,
                    }));

                    toast.success('✨ AI generation complete!', { id: loadingToast });
                    setIsProcessing(false);
                    ws.close();
                } else if (data.status === 'error') {
                    toast.error(`AI Error: ${data.error}`, { id: loadingToast });
                    setIsProcessing(false);
                    ws.close();
                }
            };

            ws.onerror = (e) => {
                console.error('WS Error', e);
                toast.error('Connection to AI service failed', { id: loadingToast });
                setIsProcessing(false);
            };

        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Failed to start AI generation.');
            console.error(error);
            setIsProcessing(false);
        }
    };


    // --- Dashboard View (List) ---
    if (view === 'list') {
        return (
            <div className="container mx-auto px-4 py-8">
                <DashboardTabs onCreateNew={() => setView('add')} />
            </div>
        );
    }

    // --- Add Product View (Wizard) ---
    return (
        <div className="container mx-auto px-4 py-12">
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" size="sm" onClick={() => setView('list')} className="p-0 hover:bg-transparent">
                    <ArrowLeft className="w-6 h-6" style={{ color: 'var(--vibe-fg)' }} />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold" style={{ color: 'var(--vibe-fg)' }}>
                        Add Product
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--vibe-accent)' }}>
                        Upload and let AI do the rest
                    </p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-12">
                <div className="flex items-center justify-between mb-4">
                    {[1, 2, 3].map((num) => (
                        <div key={num} className="flex items-center flex-1">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center font-bold border-2"
                                style={{
                                    backgroundColor: step >= num ? 'var(--vibe-accent)' : 'transparent',
                                    borderColor: step >= num ? 'var(--vibe-accent)' : 'var(--vibe-border)',
                                    color: step >= num ? 'var(--vibe-bg)' : 'var(--vibe-fg)',
                                }}
                            >
                                {step > num ? <Check className="w-5 h-5" /> : num}
                            </div>
                            {num < 3 && ( // Only show connections between steps 1-2 and 2-3
                                <div
                                    className="flex-1 h-1 mx-2"
                                    style={{
                                        backgroundColor: step > num ? 'var(--vibe-accent)' : 'var(--vibe-border)',
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex justify-between text-sm" style={{ color: 'var(--vibe-accent)' }}>
                    <span>Photos</span>
                    <span>Details & AI</span>
                    <span>Done</span>
                </div>
            </div>

            {/* Step Content */}
            <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 border-2 mb-8"
                style={{
                    borderColor: 'var(--vibe-border)',
                    borderRadius: 'var(--vibe-radius)',
                    backgroundColor: 'var(--vibe-bg)',
                    boxShadow: 'var(--vibe-shadow)',
                }}
            >
                {/* Step 1: Photo Upload */}
                {step === 1 && (
                    <div>
                        <h2 className="text-3xl font-bold mb-6" style={{ color: 'var(--vibe-fg)' }}>
                            Product Photos
                        </h2>
                        <div
                            {...getRootProps()}
                            className="p-12 border-2 border-dashed cursor-pointer mb-6"
                            style={{
                                borderColor: 'var(--vibe-border)',
                                borderRadius: 'var(--vibe-radius)',
                            }}
                        >
                            <input {...getInputProps()} />
                            <div className="text-center">
                                <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--vibe-accent)' }} />
                                <p className="text-xl font-semibold mb-2" style={{ color: 'var(--vibe-fg)' }}>
                                    Drop product images here
                                </p>
                                <p style={{ color: 'var(--vibe-accent)' }}>
                                    or click to browse
                                </p>
                            </div>
                        </div>
                        {productData.images.length > 0 && (
                            <div className="grid grid-cols-3 gap-4">
                                {productData.images.map((file, idx) => (
                                    <div
                                        key={idx}
                                        className="aspect-square border-2 overflow-hidden"
                                        style={{
                                            borderColor: 'var(--vibe-border)',
                                            borderRadius: 'var(--vibe-radius)',
                                        }}
                                    >
                                        <img
                                            src={URL.createObjectURL(file)}
                                            alt={`Product ${idx + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Product Info + AI Review */}
                {step === 2 && (
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-3xl font-bold mb-6" style={{ color: 'var(--vibe-fg)' }}>
                                Product Details
                            </h2>
                            <div className="bg-blue-50 p-4 rounded-md mb-6 border border-blue-100">
                                <p className="text-blue-700 text-sm flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" />
                                    AI is analyzing your image...
                                </p>
                            </div>

                            <div className="space-y-6">
                                <Input
                                    label="Product Name"
                                    value={productData.name}
                                    onChange={(e) => setProductData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g., Vintage Denim Jacket"
                                />
                                <div>
                                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--vibe-fg)' }}>
                                        Description
                                    </label>
                                    <textarea
                                        value={productData.description}
                                        onChange={(e) => setProductData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Tell us about your product..."
                                        rows={4}
                                        className="w-full px-4 py-3 border-2 outline-none"
                                        style={{
                                            borderColor: 'var(--vibe-border)',
                                            borderRadius: 'var(--vibe-radius)',
                                            backgroundColor: 'var(--vibe-bg)',
                                            color: 'var(--vibe-fg)',
                                        }}
                                    />
                                </div>
                                <Input
                                    label="Price  (USD)"
                                    type="number"
                                    value={productData.price}
                                    onChange={(e) => setProductData(prev => ({ ...prev, price: e.target.value }))}
                                    placeholder="29.99"
                                />

                                {/* Size & Quantity Management */}
                                <div>
                                    <label className="block text-sm font-medium mb-3" style={{ color: 'var(--vibe-fg)' }}>
                                        Sizes & Quantity
                                    </label>
                                    <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-[var(--vibe-border)]">
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            {Object.entries(productData.stock_by_size).map(([size, qty]) => (
                                                <div key={size} className="flex items-center gap-2 bg-white dark:bg-black p-2 rounded border border-[var(--vibe-border)]">
                                                    <span className="font-bold w-12 text-center" style={{ color: 'var(--vibe-fg)' }}>{size}</span>
                                                    <input
                                                        type="number"
                                                        value={qty}
                                                        onChange={(e) => {
                                                            const newQty = parseInt(e.target.value) || 0;
                                                            setProductData(prev => ({
                                                                ...prev,
                                                                stock_by_size: { ...prev.stock_by_size, [size]: newQty }
                                                            }));
                                                        }}
                                                        className="w-20 p-1 text-center bg-transparent outline-none border-b border-gray-200"
                                                    />
                                                    <span className="text-xs opacity-50">units</span>
                                                    <button
                                                        onClick={() => {
                                                            const newStock = { ...productData.stock_by_size };
                                                            delete newStock[size];
                                                            setProductData(prev => ({ ...prev, stock_by_size: newStock }));
                                                        }}
                                                        className="ml-auto text-red-400 hover:text-red-500"
                                                    >
                                                        &times;
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex gap-2">
                                            {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(size => (
                                                <button
                                                    key={size}
                                                    onClick={() => {
                                                        if (productData.stock_by_size[size] === undefined) {
                                                            setProductData(prev => ({
                                                                ...prev,
                                                                stock_by_size: { ...prev.stock_by_size, [size]: 0 }
                                                            }));
                                                        }
                                                    }}
                                                    className={`px-3 py-1 rounded text-sm transition-colors ${productData.stock_by_size[size] !== undefined
                                                        ? 'bg-[var(--vibe-accent)] text-white opacity-50 cursor-not-allowed'
                                                        : 'bg-white dark:bg-gray-800 border border-[var(--vibe-border)] hover:border-[var(--vibe-accent)]'
                                                        }`}
                                                >
                                                    + {size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Suggestions Section */}
                        <div className="pt-6 border-t" style={{ borderColor: 'var(--vibe-border)' }}>
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--vibe-fg)' }}>
                                <Sparkles className="w-5 h-5" style={{ color: 'var(--vibe-accent)' }} />
                                AI Suggestions
                            </h3>

                            {isProcessing ? (
                                <div className="text-center py-8">
                                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" style={{ color: 'var(--vibe-accent)' }} />
                                    <p className="text-sm" style={{ color: 'var(--vibe-accent)' }}>Generating tags & attributes...</p>
                                </div>
                            ) : productData.aiData ? (
                                <AISuggestionsPanel
                                    initialData={productData.aiData}
                                    initialPrice={productData.price}
                                    onUpdate={(updates) => {
                                        setProductData(prev => ({
                                            ...prev,
                                            ...updates
                                        }));
                                    }}
                                />
                            ) : (
                                <p className="text-sm text-gray-500 italic">Upload an image to get AI suggestions.</p>
                            )}
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Navigation Buttons */}
            <div className="flex justify-between">
                {step < 3 && (
                    <Button
                        onClick={handlePrevious}
                        disabled={step === 1}
                        variant="outline"
                        className="flex items-center gap-2"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        Previous
                    </Button>
                )}

                {step === 1 && (
                    <Button onClick={handleNext} className="flex items-center gap-2 ml-auto">
                        Next
                        <ChevronRight className="w-5 h-5" />
                    </Button>
                )}

                {step === 2 && (
                    <Button onClick={handlePublish} variant="secondary" className="flex items-center gap-2 ml-auto">
                        <Sparkles className="w-5 h-5" />
                        Publish Now
                    </Button>
                )}
            </div>
        </div>
    );
}
