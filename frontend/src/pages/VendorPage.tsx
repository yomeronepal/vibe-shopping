import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, Upload, Sparkles, Check, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import toast from 'react-hot-toast';
import { aiApi } from '../api/ai';
import type { AIProductDetails } from '../api/ai';

interface ProductData {
    name: string;
    description: string;
    price: string;
    images: File[];
    aiData?: AIProductDetails;
}

export default function VendorPage() {
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [productData, setProductData] = useState<ProductData>({
        name: '',
        description: '',
        price: '',
        images: [],
    });

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
        const loadingToast = toast.loading('🤖 Gemini AI is analyzing your product...');

        try {
            const result = await aiApi.generateProductDetails(
                productData.images[0],
                productData.price ? parseFloat(productData.price) : undefined
            );

            setProductData(prev => ({
                ...prev,
                aiData: result,
            }));

            toast.dismiss(loadingToast);
            toast.success(`✨ Generated ${result.tags.length} tags and complete product details!`);
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Failed to generate AI content. Check your API key.');
            console.error(error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleNext = () => {
        if (step === 2 && productData.images.length === 0) {
            toast.error('Please upload at least one product image');
            return;
        }
        if (step === 2) {
            generateAIContent();
        }
        setStep(prev => Math.min(prev + 1, 4));
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

            await vendorApi.publishProduct({
                name: productData.name,
                description: productData.description,
                price: parseFloat(productData.price),
                image: productData.images[0], // Use first image
                ai_generated_title: productData.aiData?.title,
                ai_generated_description: productData.aiData?.description,
                tags: productData.aiData?.tags,
                category: productData.aiData?.category,
                subcategory: productData.aiData?.subcategory,
                metadata: productData.aiData ? {
                    attributes: productData.aiData.attributes,
                    target_audience: productData.aiData.target_audience,
                    occasions: productData.aiData.occasions,
                    season: productData.aiData.season,
                    care_instructions: productData.aiData.care_instructions,
                    seo_keywords: productData.aiData.seo_keywords,
                    selling_points: productData.aiData.selling_points,
                } : undefined,
            });

            toast.dismiss(loadingToast);
            toast.success('🎉 Product published successfully!');

            // Reset form
            setProductData({ name: '', description: '', price: '', images: [] });
            setStep(1);
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error('Failed to publish product');
            console.error(error);
        }
    };

    return (
        <div className="container mx-auto px-4 py-12">
            <h1 className="text-5xl font-bold mb-2" style={{ color: 'var(--vibe-fg)' }}>
                Vendor Dashboard 🏪
            </h1>
            <p className="text-xl mb-8" style={{ color: 'var(--vibe-accent)' }}>
                Upload your products and let AI help you shine
            </p>

            {/* Progress Bar */}
            <div className="mb-12">
                <div className="flex items-center justify-between mb-4">
                    {[1, 2, 3, 4].map((num) => (
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
                            {num < 4 && (
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
                    <span>Product Info</span>
                    <span>Photos</span>
                    <span>AI Review</span>
                    <span>Publish</span>
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
                {/* Step 1: Product Info */}
                {step === 1 && (
                    <div className="space-y-6">
                        <h2 className="text-3xl font-bold mb-6" style={{ color: 'var(--vibe-fg)' }}>
                            Product Information
                        </h2>
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
                    </div>
                )}

                {/* Step 2: Photo Upload */}
                {step === 2 && (
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

                {/* Step 3: AI Review */}
                {step === 3 && (
                    <div className="space-y-6">
                        <h2 className="text-3xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--vibe-fg)' }}>
                            {isProcessing ? (
                                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--vibe-accent)' }} />
                            ) : (
                                <Sparkles className="w-8 h-8" style={{ color: 'var(--vibe-accent)' }} />
                            )}
                            AI Generated Content
                        </h2>

                        {isProcessing ? (
                            <div className="text-center py-12">
                                <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin" style={{ color: 'var(--vibe-accent)' }} />
                                <p className="text-xl" style={{ color: 'var(--vibe-fg)' }}>
                                    Gemini AI is analyzing your product...
                                </p>
                            </div>
                        ) : productData.aiData ? (
                            <>
                                {/* Title */}
                                <div className="p-6 border-2" style={{
                                    borderColor: 'var(--vibe-border)',
                                    borderRadius: 'var(--vibe-radius)',
                                    backgroundColor: 'var(--vibe-secondary)',
                                }}>
                                    <label className="font-semibold mb-2 block" style={{ color: 'var(--vibe-fg)' }}>
                                        Suggested Title:
                                    </label>
                                    <p className="text-xl" style={{ color: 'var(--vibe-accent)' }}>
                                        {productData.aiData.title}
                                    </p>
                                </div>

                                {/* Description */}
                                <div className="p-6 border-2" style={{
                                    borderColor: 'var(--vibe-border)',
                                    borderRadius: 'var(--vibe-radius)',
                                    backgroundColor: 'var(--vibe-secondary)',
                                }}>
                                    <label className="font-semibold mb-2 block" style={{ color: 'var(--vibe-fg)' }}>
                                        AI-Generated Description:
                                    </label>
                                    <p className="text-sm leading-relaxed" style={{ color: 'var(--vibe-accent)' }}>
                                        {productData.aiData.description}
                                    </p>
                                </div>

                                {/* All Tags (20-30) */}
                                <div className="p-6 border-2" style={{
                                    borderColor: 'var(--vibe-border)',
                                    borderRadius: 'var(--vibe-radius)',
                                    backgroundColor: 'var(--vibe-secondary)',
                                }}>
                                    <label className="font-semibold mb-3 block" style={{ color: 'var(--vibe-fg)' }}>
                                        Generated Tags ({productData.aiData.tags.length}):
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {productData.aiData.tags.map((tag, idx) => (
                                            <span
                                                key={idx}
                                                className="px-3 py-1 text-sm font-semibold"
                                                style={{
                                                    backgroundColor: 'var(--vibe-accent)',
                                                    color: 'var(--vibe-bg)',
                                                    borderRadius: 'var(--vibe-radius)',
                                                }}
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Category & Subcategory */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 border-2" style={{
                                        borderColor: 'var(--vibe-border)',
                                        borderRadius: 'var(--vibe-radius)',
                                        backgroundColor: 'var(--vibe-secondary)',
                                    }}>
                                        <label className="font-semibold text-sm mb-1 block" style={{ color: 'var(--vibe-fg)' }}>
                                            Category:
                                        </label>
                                        <p style={{ color: 'var(--vibe-accent)' }}>{productData.aiData.category}</p>
                                    </div>
                                    <div className="p-4 border-2" style={{
                                        borderColor: 'var(--vibe-border)',
                                        borderRadius: 'var(--vibe-radius)',
                                        backgroundColor: 'var(--vibe-secondary)',
                                    }}>
                                        <label className="font-semibold text-sm mb-1 block" style={{ color: 'var(--vibe-fg)' }}>
                                            Subcategory:
                                        </label>
                                        <p style={{ color: 'var(--vibe-accent)' }}>{productData.aiData.subcategory}</p>
                                    </div>
                                </div>

                                {/* Attributes */}
                                {productData.aiData.attributes && (
                                    <div className="p-6 border-2" style={{
                                        borderColor: 'var(--vibe-border)',
                                        borderRadius: 'var(--vibe-radius)',
                                        backgroundColor: 'var(--vibe-secondary)',
                                    }}>
                                        <label className="font-semibold mb-3 block" style={{ color: 'var(--vibe-fg)' }}>
                                            Product Attributes:
                                        </label>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div><span className="font-medium">Style:</span> {productData.aiData.attributes.style}</div>
                                            <div><span className="font-medium">Color:</span> {productData.aiData.attributes.color.join(', ')}</div>
                                            <div><span className="font-medium">Material:</span> {productData.aiData.attributes.material.join(', ')}</div>
                                            <div><span className="font-medium">Fit:</span> {productData.aiData.attributes.fit}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Selling Points */}
                                {productData.aiData.selling_points && (
                                    <div className="p-6 border-2" style={{
                                        borderColor: 'var(--vibe-border)',
                                        borderRadius: 'var(--vibe-radius)',
                                        backgroundColor: 'var(--vibe-secondary)',
                                    }}>
                                        <label className="font-semibold mb-3 block" style={{ color: 'var(--vibe-fg)' }}>
                                            Key Selling Points:
                                        </label>
                                        <ul className="list-disc list-inside space-y-1 text-sm" style={{ color: 'var(--vibe-accent)' }}>
                                            {productData.aiData.selling_points.map((point, idx) => (
                                                <li key={idx}>{point}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-12">
                                <p className="text-xl" style={{ color: 'var(--vibe-accent)' }}>
                                    Click "Next" from Step 2 to generate AI content
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: Publish */}
                {step === 4 && (
                    <div className="text-center py-12">
                        <h2 className="text-4xl font-bold mb-4" style={{ color: 'var(--vibe-fg)' }}>
                            Ready to Publish! 🚀
                        </h2>
                        <p className="text-xl mb-8" style={{ color: 'var(--vibe-accent)' }}>
                            Your product looks amazing. Let's share it with the world!
                        </p>
                        <div className="max-w-md mx-auto text-left space-y-3">
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--vibe-accent)' }}>Product:</span>
                                <span className="font-semibold" style={{ color: 'var(--vibe-fg)' }}>
                                    {productData.name}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--vibe-accent)' }}>Price:</span>
                                <span className="font-semibold" style={{ color: 'var(--vibe-fg)' }}>
                                    ${productData.price}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--vibe-accent)' }}>Images:</span>
                                <span className="font-semibold" style={{ color: 'var(--vibe-fg)' }}>
                                    {productData.images.length} photos
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Navigation Buttons */}
            <div className="flex justify-between">
                <Button
                    onClick={handlePrevious}
                    disabled={step === 1}
                    variant="outline"
                    className="flex items-center gap-2"
                >
                    <ChevronLeft className="w-5 h-5" />
                    Previous
                </Button>

                {step < 4 ? (
                    <Button onClick={handleNext} className="flex items-center gap-2">
                        Next
                        <ChevronRight className="w-5 h-5" />
                    </Button>
                ) : (
                    <Button onClick={handlePublish} variant="secondary" className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5" />
                        Publish Product
                    </Button>
                )}
            </div>
        </div>
    );
}
