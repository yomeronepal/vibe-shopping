import { useEffect, useState } from 'react';
import { vendorApi, type Product } from '../../api/vendor';
import { Plus, Loader2, Package, Share2, QrCode } from 'lucide-react';
import Button from '../common/Button';
import PostToSocialModal from './PostToSocialModal';
import ProductQRModal from './ProductQRModal';


interface VendorProductListProps {
    onCreateNew: () => void;
}

export default function VendorProductList({ onCreateNew }: VendorProductListProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, any>>({});
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [showPostModal, setShowPostModal] = useState(false);
    const [selectedProductForQR, setSelectedProductForQR] = useState<Product | null>(null);
    const [showQRModal, setShowQRModal] = useState(false);

    useEffect(() => {
        loadProducts();
        loadConnectedPlatforms();
    }, []);

    const loadProducts = async () => {
        try {
            const data = await vendorApi.getProducts();
            // Ensure we're setting an array
            const productList = Array.isArray(data) ? data : (data.results || []);
            setProducts(productList);
        } catch (err) {
            console.error('Failed to load products', err);
            setError('Failed to load products');
        } finally {
            setIsLoading(false);
        }
    };

    const loadConnectedPlatforms = async () => {
        try {
            const response = await vendorApi.getSocialMediaConnections();
            setConnectedPlatforms(response.social_media || {});
        } catch (err) {
            console.error('Failed to load connected platforms', err);
        }
    };

    const handleShareClick = (product: Product, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card click
        setSelectedProduct(product);
        setShowPostModal(true);
    };

    const hasConnectedPlatforms = Object.values(connectedPlatforms).some(
        (platform: any) => platform?.connected
    );

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--vibe-accent)' }} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12 text-red-500">
                {error}
                <div className="mt-4">
                    <Button onClick={loadProducts} variant="outline">Retry</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold" style={{ color: 'var(--vibe-fg)' }}>My Products</h2>
                <Button onClick={onCreateNew} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Add New</span>
                </Button>
            </div>

            {/* Empty State */}
            {products.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed rounded-lg"
                    style={{ borderColor: 'var(--vibe-border)' }}>
                    <Package className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--vibe-accent)' }} />
                    <p className="text-lg font-medium mb-2" style={{ color: 'var(--vibe-fg)' }}>No products yet</p>
                    <p className="mb-6 text-sm opacity-70" style={{ color: 'var(--vibe-fg)' }}>Start selling by adding your first product.</p>
                    <Button onClick={onCreateNew}>Add Product</Button>
                </div>
            ) : (
                /* Grid Layout */
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {products.map((product) => (
                        <div
                            key={product.id}
                            className="border rounded-lg overflow-hidden flex flex-col group relative"
                            style={{
                                borderColor: 'var(--vibe-border)',
                                backgroundColor: 'var(--vibe-bg)',
                            }}
                        >
                            <div
                                className="aspect-square relative bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden cursor-pointer"
                                onClick={() => window.location.href = `/product/${product.id}`}
                            >
                                {product.processed_image ? (
                                    <img
                                        src={product.processed_image}
                                        alt={`${product.name} - No Background`}
                                        className="w-full h-full object-contain p-2 bg-white"
                                    />
                                ) : product.image ? (
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center text-gray-400">
                                        <Package className="w-8 h-8" />
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold uppercase bg-white/80 dark:bg-black/80 backdrop-blur-sm shadow-sm"
                                    style={{ color: 'var(--vibe-fg)' }}>
                                    {product.status}
                                </div>

                                {/* Floating Share Button */}
                                {hasConnectedPlatforms && product.status === 'published' && (
                                    <button
                                        onClick={(e) => handleShareClick(product, e)}
                                        className="absolute bottom-2 right-2 w-10 h-10 rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                                        style={{ backgroundColor: 'var(--vibe-accent)', color: 'white' }}
                                        title="Share to Social Media"
                                    >
                                        <Share2 className="w-5 h-5" />
                                    </button>
                                )}

                                {/* QR Code Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProductForQR(product);
                                        setShowQRModal(true);
                                    }}
                                    className="absolute bottom-2 left-2 w-10 h-10 rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                                    style={{ backgroundColor: 'white', color: 'black' }}
                                    title="View QR Code"
                                >
                                    <QrCode className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-3 flex-1 flex flex-col">
                                <h3 className="font-semibold text-sm mb-1 line-clamp-2" style={{ color: 'var(--vibe-fg)' }}>
                                    {product.name}
                                </h3>
                                {/* Vibe Tags Display */}
                                {product.vibe_tags && product.vibe_tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1 mb-2">
                                        {product.vibe_tags.slice(0, 3).map((tag, idx) => (
                                            <span
                                                key={idx}
                                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-opacity-10"
                                                style={{
                                                    backgroundColor: 'var(--vibe-accent)',
                                                    color: 'var(--vibe-accent)'
                                                }}
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="mt-auto flex justify-between items-end">
                                    <span className="font-bold" style={{ color: 'var(--vibe-accent)' }}>
                                        ${product.price}
                                    </span>
                                    <span className="text-xs opacity-60" style={{ color: 'var(--vibe-fg)' }}>
                                        Stock: {product.stock}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}


            {/* Mobile FAB (only visible on small screens) */}
            <button
                onClick={onCreateNew}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center sm:hidden z-50 transform hover:scale-105 transition-transform"
                style={{ backgroundColor: 'var(--vibe-accent)', color: 'white' }}
                aria-label="Add Product"
            >
                <Plus className="w-8 h-8" />
            </button>

            {/* Post to Social Modal */}
            {selectedProduct && (
                <PostToSocialModal
                    product={selectedProduct}
                    open={showPostModal}
                    onClose={() => {
                        setShowPostModal(false);
                        setSelectedProduct(null);
                    }}
                    connectedPlatforms={connectedPlatforms}
                />
            )}

            {/* QR Code Modal */}
            {selectedProductForQR && (
                <ProductQRModal
                    product={selectedProductForQR}
                    open={showQRModal}
                    onClose={() => {
                        setShowQRModal(false);
                        setSelectedProductForQR(null);
                    }}
                />
            )}
        </div>
    );
}
