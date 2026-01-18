import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { vendorApi, type Product } from '../api/vendor';
import { ArrowLeft, Package } from 'lucide-react';
import Button from '../components/common/Button';

export default function ProductDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<{ src: string; type: string } | null>(null);

    useEffect(() => {
        if (id) {
            loadProduct(id);
        }
    }, [id]);

    const loadProduct = async (productId: string) => {
        try {
            const data = await vendorApi.getProduct(productId);
            setProduct(data);

            // Default to processed image, then main image
            if (data.processed_image) {
                setSelectedImage({ src: data.processed_image, type: 'processed' });
            } else if (data.image) {
                setSelectedImage({ src: data.image, type: 'original' });
            }
        } catch (error) {
            console.error('Failed to load product', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    if (!product) {
        return <div className="min-h-screen flex items-center justify-center">Product not found</div>;
    }

    // Collect all unique images for gallery strip
    const allImages = [
        ...(product.processed_image ? [{ src: product.processed_image, type: 'processed' }] : []),
        ...(product.image ? [{ src: product.image, type: 'original' }] : []),
        ...(product.images || []).map(img => ({ src: img.image, type: 'gallery' }))
    ];

    return (
        <div className="min-h-screen bg-white dark:bg-black text-[var(--vibe-fg)] p-4 md:p-8">
            <Button variant="ghost" className="mb-6 flex items-center gap-2" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4" /> Back
            </Button>

            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                {/* Image Gallery Section */}
                <div className="space-y-4">
                    {/* Main Stage */}
                    <div className={`aspect-square rounded-2xl overflow-hidden border border-[var(--vibe-border)] flex items-center justify-center ${selectedImage?.type === 'processed' ? 'bg-white' : 'bg-gray-50 dark:bg-gray-900'
                        }`}>
                        {selectedImage ? (
                            <img
                                src={selectedImage.src}
                                alt={product.name}
                                className={`w-full h-full ${selectedImage.type === 'processed' ? 'object-contain p-8' : 'object-cover'}`}
                            />
                        ) : (
                            <div className="text-gray-400 flex flex-col items-center">
                                <Package className="w-12 h-12 mb-2" />
                                <span>No Image</span>
                            </div>
                        )}
                    </div>

                    {/* Thumbnails */}
                    {allImages.length > 1 && (
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                            {allImages.map((img, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedImage(img)}
                                    className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${selectedImage?.src === img.src
                                            ? 'border-[var(--vibe-accent)] ring-2 ring-[var(--vibe-accent)] ring-opacity-50'
                                            : 'border-transparent opacity-70 hover:opacity-100'
                                        }`}
                                >
                                    <img
                                        src={img.src}
                                        alt={`View ${idx + 1}`}
                                        className={`w-full h-full object-cover ${img.type === 'processed' ? 'bg-white object-contain p-1' : ''}`}
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Product Info Section */}
                <div className="space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            {product.vibe_tags?.slice(0, 3).map(tag => (
                                <span key={tag} className="text-xs font-bold uppercase tracking-wider text-[var(--vibe-accent)] bg-opacity-10 bg-[var(--vibe-accent)] px-2 py-1 rounded-full">
                                    {tag}
                                </span>
                            ))}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">{product.name}</h1>
                        <p className="text-2xl font-light opacity-90">${product.price}</p>
                    </div>

                    <div className="prose dark:prose-invert max-w-none">
                        <p className="text-lg leading-relaxed opacity-80">{product.description}</p>
                    </div>

                    {/* Metadata / Details Grid */}
                    <div className="grid grid-cols-2 gap-6 py-6 border-t border-b border-[var(--vibe-border)]">
                        <div>
                            <span className="block text-sm opacity-50 mb-1">Category</span>
                            <span className="font-medium">{product.category || 'Uncategorized'}</span>
                        </div>
                        <div>
                            <span className="block text-sm opacity-50 mb-1">Subcategory</span>
                            <span className="font-medium">{product.subcategory || '-'}</span>
                        </div>
                        <div>
                            <span className="block text-sm opacity-50 mb-1">Status</span>
                            <span className="capitalize font-medium">{product.status}</span>
                        </div>
                        <div>
                            <span className="block text-sm opacity-50 mb-1">Stock</span>
                            <span className="font-medium">{product.stock} units</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
