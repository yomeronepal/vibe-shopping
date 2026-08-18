import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Upload, X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

interface WardrobeItem {
    id: string;
    image: string;
    name: string;
    processedImage?: string;
}

export default function WardrobePage() {
    const [items, setItems] = useState<WardrobeItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        acceptedFiles.forEach((file) => {
            const reader = new FileReader();

            reader.onload = () => {
                const newItem: WardrobeItem = {
                    id: Date.now().toString() + Math.random(),
                    image: reader.result as string,
                    name: file.name,
                };

                // Mock background removal process
                setIsProcessing(true);
                setTimeout(() => {
                    setItems(prev => [...prev, { ...newItem, processedImage: reader.result as string }]);
                    setIsProcessing(false);
                    toast.success('✨ Image added to wardrobe!');
                }, 1500);
            };

            reader.readAsDataURL(file);
        });
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: true,
    });

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
        toast.success('Item removed from wardrobe');
    };

    const container: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item: Variants = {
        hidden: { scale: 0, opacity: 0, rotate: -10 },
        show: {
            scale: 1,
            opacity: 1,
            rotate: 0,
            transition: {
                type: 'spring',
                bounce: 0.4
            }
        }
    };

    return (
        <div className="container mx-auto px-4 py-12">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <h1 className="text-5xl font-bold mb-4" style={{ color: 'var(--vibe-fg)' }}>
                    Digital Wardrobe 👗
                </h1>
                <p className="text-xl" style={{ color: 'var(--vibe-accent)' }}>
                    Upload your clothing images and create your virtual wardrobe
                </p>
            </motion.div>

            {/* Upload Area */}
            <motion.div
                {...(getRootProps() as object)}
                whileHover={{ scale: 1.02 }}
                className="mb-12 p-12 border-2 border-dashed cursor-pointer transition-all"
                style={{
                    borderColor: isDragActive ? 'var(--vibe-accent)' : 'var(--vibe-border)',
                    backgroundColor: isDragActive ? 'var(--vibe-secondary)' : 'transparent',
                    borderRadius: 'var(--vibe-radius)',
                }}
            >
                <input {...getInputProps()} />
                <div className="text-center">
                    <Upload className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--vibe-accent)' }} />
                    <p className="text-2xl font-semibold mb-2" style={{ color: 'var(--vibe-fg)' }}>
                        {isDragActive ? 'Drop your images here!' : 'Drag & drop clothing images'}
                    </p>
                    <p style={{ color: 'var(--vibe-accent)' }}>
                        or click to browse your files
                    </p>
                    {isProcessing && (
                        <div className="mt-4 flex items-center justify-center gap-2" style={{ color: 'var(--vibe-accent)' }}>
                            <Sparkles className="animate-spin" />
                            <span>Processing image...</span>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Wardrobe Grid */}
            {items.length > 0 ? (
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                >
                    <AnimatePresence>
                        {items.map((wardrobeItem) => (
                            <motion.div
                                key={wardrobeItem.id}
                                variants={item}
                                exit={{ scale: 0, opacity: 0 }}
                                className="relative group aspect-square border-2 overflow-hidden"
                                style={{
                                    borderColor: 'var(--vibe-border)',
                                    borderRadius: 'var(--vibe-radius)',
                                    boxShadow: 'var(--vibe-shadow)',
                                }}
                            >
                                <img
                                    src={wardrobeItem.processedImage || wardrobeItem.image}
                                    alt={wardrobeItem.name}
                                    className="w-full h-full object-cover"
                                />
                                <motion.button
                                    initial={{ opacity: 0 }}
                                    whileHover={{ opacity: 1 }}
                                    onClick={() => removeItem(wardrobeItem.id)}
                                    className="absolute top-2 right-2 p-2 rounded-full"
                                    style={{
                                        backgroundColor: 'var(--vibe-accent)',
                                        color: 'var(--vibe-bg)',
                                    }}
                                >
                                    <X className="w-4 h-4" />
                                </motion.button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            ) : (
                <div className="text-center py-20">
                    <p className="text-xl" style={{ color: 'var(--vibe-accent)' }}>
                        Your wardrobe is empty. Start uploading images!
                    </p>
                </div>
            )}
        </div>
    );
}
