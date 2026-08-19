import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Package, ShoppingBag, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { publicApi, type Product } from '../api/products';
import { mediaUrl } from '../api/media';
import { addToCart } from '../features/cart/cartSlice';
import { useAppDispatch } from '@/store/hooks';
import Button from '../components/common/Button';

interface GalleryImage {
    src: string;
    type: string;
}

function collectImages(product: Product): GalleryImage[] {
    const images: GalleryImage[] = [];
    const processed = mediaUrl(product.processed_image);
    const main = mediaUrl(product.image);
    if (processed) images.push({ src: processed, type: 'processed' });
    if (main) images.push({ src: main, type: 'original' });
    for (const gallery of product.images ?? []) {
        const src = mediaUrl(gallery.image);
        if (src) images.push({ src, type: 'gallery' });
    }
    return images;
}

function LoadingSkeleton() {
    return (
        <div className="min-h-screen p-4 md:p-8">
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 animate-pulse">
                <div className="aspect-square rounded-2xl bg-gray-100 dark:bg-gray-800" />
                <div className="space-y-6 pt-4">
                    <div className="h-10 w-3/4 rounded-lg bg-gray-100 dark:bg-gray-800" />
                    <div className="h-6 w-1/3 rounded-lg bg-gray-100 dark:bg-gray-800" />
                    <div className="h-24 w-full rounded-lg bg-gray-100 dark:bg-gray-800" />
                    <div className="h-12 w-1/2 rounded-full bg-gray-100 dark:bg-gray-800" />
                </div>
            </div>
        </div>
    );
}

function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="text-center max-w-sm">
                <Package className="w-14 h-14 mx-auto mb-4 opacity-40" />
                <h1 className="text-2xl font-bold mb-2">This product isn't available</h1>
                <p className="opacity-70 mb-6">It may have been removed or is no longer for sale.</p>
                <Link
                    to="/products"
                    className="inline-block px-6 py-3 rounded-full font-semibold text-white"
                    style={{ backgroundColor: 'var(--vibe-accent, #8A2BE2)' }}
                >
                    Browse products
                </Link>
            </div>
        </div>
    );
}

export default function ProductDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [added, setAdded] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        publicApi.getProduct(id)
            .then((data) => {
                setProduct(data);
                setSelectedImage(collectImages(data)[0] ?? null);
            })
            .catch(() => setProduct(null))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return <LoadingSkeleton />;
    if (!product) return <NotFound />;

    const allImages = collectImages(product);
    const inStock = product.stock > 0;

    const handleAddToCart = () => {
        if (!inStock) return;
        dispatch(addToCart(product));
        setAdded(true);
        toast.success(`${product.name} added to your bag`);
        window.setTimeout(() => setAdded(false), 2000);
    };

    return (
        <div className="min-h-screen bg-white dark:bg-black text-[var(--vibe-fg)] p-4 md:p-8">
            <Button variant="ghost" className="mb-6 flex items-center gap-2" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4" /> Back
            </Button>

            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                <div className="space-y-4">
                    <div className={`aspect-square rounded-2xl overflow-hidden border border-[var(--vibe-border)] flex items-center justify-center ${selectedImage?.type === 'processed' ? 'bg-white' : 'bg-gray-50 dark:bg-gray-900'}`}>
                        {selectedImage ? (
                            <img
                                src={selectedImage.src}
                                alt={product.name}
                                className={`w-full h-full ${selectedImage.type === 'processed' ? 'object-contain p-8' : 'object-cover'}`}
                            />
                        ) : (
                            <div className="text-gray-400 flex flex-col items-center">
                                <Package className="w-12 h-12 mb-2" />
                                <span>No image yet</span>
                            </div>
                        )}
                    </div>

                    {allImages.length > 1 && (
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                            {allImages.map((img, idx) => (
                                <button
                                    key={`${img.src}-${idx}`}
                                    onClick={() => setSelectedImage(img)}
                                    className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${selectedImage?.src === img.src
                                        ? 'border-[var(--vibe-accent)] ring-2 ring-[var(--vibe-accent)] ring-opacity-50'
                                        : 'border-transparent opacity-70 hover:opacity-100'
                                        }`}
                                >
                                    <img
                                        src={img.src}
                                        alt={`View ${idx + 1} of ${product.name}`}
                                        className={`w-full h-full object-cover ${img.type === 'processed' ? 'bg-white object-contain p-1' : ''}`}
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {product.vibe_tags?.slice(0, 3).map(tag => (
                                <span key={tag} className="text-xs font-bold uppercase tracking-wider text-[var(--vibe-accent)] bg-opacity-10 bg-[var(--vibe-accent)] px-2 py-1 rounded-full">
                                    {tag}
                                </span>
                            ))}
                            <span
                                className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full ${inStock ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}
                            >
                                {inStock ? 'In stock' : 'Out of stock'}
                            </span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">{product.name}</h1>
                        <p className="text-2xl font-light opacity-90">Rs. {Number(product.price).toLocaleString()}</p>
                    </div>

                    {product.description && (
                        <p className="text-lg leading-relaxed opacity-80">{product.description}</p>
                    )}

                    <button
                        onClick={handleAddToCart}
                        disabled={!inStock}
                        className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold text-white transition-transform hover:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: 'var(--vibe-accent, #8A2BE2)' }}
                    >
                        {added ? <Check className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
                        {added ? 'Added to bag' : inStock ? 'Add to bag' : 'Out of stock'}
                    </button>

                    <div className="grid grid-cols-2 gap-6 py-6 border-t border-b border-[var(--vibe-border)]">
                        <div>
                            <span className="block text-sm opacity-50 mb-1">Category</span>
                            <span className="font-medium">{product.category || 'Uncategorized'}</span>
                        </div>
                        <div>
                            <span className="block text-sm opacity-50 mb-1">Subcategory</span>
                            <span className="font-medium">{product.subcategory || '—'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
