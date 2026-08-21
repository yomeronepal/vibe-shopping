import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mediaUrl } from '../api/media';
import { useShopTheme } from '../contexts/ShopThemeContext';
import { vendorApi, type Product } from '../api/vendor';
import toast from 'react-hot-toast';
import ThemePickerButton from '../components/theme/ThemePickerButton';
import VendorShell from '../components/vendor/VendorShell';
import ConfirmDialog from '../components/common/ConfirmDialog';

interface ConfirmRequest {
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    action: () => Promise<void>;
}

type ProductFilter = 'all' | 'drafts' | 'low-stock' | 'archived' | 'out-of-stock';

interface VendorProfile {
    store_name?: string;
    logo?: string;
}

const VendorProductListPage: React.FC = () => {
    const navigate = useNavigate();
    const { config: themeConfig } = useShopTheme();
    const [activeFilter, setActiveFilter] = useState<ProductFilter>('all');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [nextPage, setNextPage] = useState<number | null>(null);
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [stats, setStats] = useState<{ all: number; draft: number; archived: number; low_stock: number; out_of_stock: number } | null>(null);
    const [, setVendorProfile] = useState<VendorProfile>({});

    const primaryColor = themeConfig.primary;

    const filterParams = (filter: ProductFilter, query: string) => {
        const params: { status?: string; stock?: string; q?: string } = {};
        if (filter === 'drafts') params.status = 'draft';
        if (filter === 'archived') params.status = 'archived';
        if (filter === 'low-stock') params.stock = 'low';
        if (filter === 'out-of-stock') params.stock = 'out';
        if (query.trim()) params.q = query.trim();
        return params;
    };

    const loadProducts = async (page = 1, filter = activeFilter, query = searchQuery, sort = sortOrder) => {
        try {
            if (page === 1) setLoading(true);
            const data = await vendorApi.getProducts({ page, sort, ...filterParams(filter, query) });
            const results: Product[] = Array.isArray(data) ? data : data?.results ?? [];
            setProducts((prev) => (page === 1 ? results : [...prev, ...results]));
            setTotalCount(Array.isArray(data) ? results.length : data?.count ?? results.length);
            setNextPage(!Array.isArray(data) && data?.next ? page + 1 : null);
        } catch (error) {
            toast.error('Failed to load products');
            if (page === 1) setProducts([]);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = () => {
        vendorApi.getProductStats().then(setStats).catch(() => {});
    };

    useEffect(() => {
        const handle = window.setTimeout(() => loadProducts(1), searchQuery ? 350 : 0);
        return () => window.clearTimeout(handle);
    }, [activeFilter, searchQuery, sortOrder]);

    useEffect(() => {
        loadStats();
        loadVendorProfile();
    }, []);

    const loadVendorProfile = async () => {
        try {
            const profile = await vendorApi.getVendorProfile();
            setVendorProfile({
                store_name: profile.store_name || 'BizAlly',
                logo: profile.logo || null
            });
        } catch (error) {
            console.error('Failed to load vendor profile:', error);
        }
    };

    const filteredProducts = products;

    const productCounts = {
        all: stats?.all ?? totalCount,
        drafts: stats?.draft ?? 0,
        'low-stock': stats?.low_stock ?? 0,
        archived: stats?.archived ?? 0,
        'out-of-stock': stats?.out_of_stock ?? 0,
    };

    const toggleProductSelection = (productId: number) => {
        setSelectedProducts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(productId)) {
                newSet.delete(productId);
            } else {
                newSet.add(productId);
            }
            return newSet;
        });
    };

    const applyProductUpdate = (updated: Product) => {
        setProducts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    };

    const removeFromList = (productId: number) => {
        setProducts(prev => prev.filter(p => p.id !== productId));
        setSelectedProducts(prev => {
            const next = new Set(prev);
            next.delete(productId);
            return next;
        });
    };

    const runArchive = async (product: Product) => {
        try {
            applyProductUpdate(await vendorApi.archiveProduct(product.id));
            toast.success(`${product.name} archived`);
        } catch {
            toast.error('Could not archive product');
        }
    };

    const restoreProduct = async (product: Product) => {
        try {
            applyProductUpdate(await vendorApi.publishDraftProduct(product.id));
            toast.success(`${product.name} is back in your store`);
        } catch {
            toast.error('Could not restore product');
        }
    };

    const runDelete = async (product: Product) => {
        try {
            await vendorApi.deleteProduct(product.id);
            removeFromList(product.id);
            toast.success(`${product.name} deleted`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not delete product');
        }
    };

    const archiveProduct = (product: Product) => {
        setConfirmRequest({
            title: `Archive ${product.name}?`,
            message: 'It will be hidden from your store but keeps all its history. You can restore it anytime.',
            confirmLabel: 'Archive',
            danger: false,
            action: () => runArchive(product),
        });
    };

    const deleteProduct = (product: Product) => {
        setConfirmRequest({
            title: `Delete ${product.name}?`,
            message: 'This permanently removes the product and cannot be undone. Products with order history cannot be deleted.',
            confirmLabel: 'Delete forever',
            danger: true,
            action: () => runDelete(product),
        });
    };

    const runBulkAction = async (action: 'archive' | 'delete', targets: Product[]) => {
        let done = 0;
        let failed = 0;
        for (const product of targets) {
            try {
                if (action === 'archive') {
                    applyProductUpdate(await vendorApi.archiveProduct(product.id));
                } else {
                    await vendorApi.deleteProduct(product.id);
                    removeFromList(product.id);
                }
                done += 1;
            } catch {
                failed += 1;
            }
        }
        setSelectedProducts(new Set());
        if (done > 0) toast.success(`${done} product(s) ${action === 'archive' ? 'archived' : 'deleted'}`);
        if (failed > 0) toast.error(`${failed} product(s) skipped (order history or error)`);
    };

    const handleBulkAction = (action: 'archive' | 'delete') => {
        const targets = products.filter(p => selectedProducts.has(p.id));
        if (targets.length === 0) return;
        const isDelete = action === 'delete';
        setConfirmRequest({
            title: isDelete ? `Delete ${targets.length} product(s)?` : `Archive ${targets.length} product(s)?`,
            message: isDelete
                ? 'This permanently removes them and cannot be undone. Products with order history will be skipped.'
                : 'They will be hidden from your store but keep all their history. You can restore them anytime.',
            confirmLabel: isDelete ? 'Delete forever' : 'Archive all',
            danger: isDelete,
            action: () => runBulkAction(action, targets),
        });
    };

    const confirmCurrentRequest = () => {
        if (!confirmRequest) return;
        const { action } = confirmRequest;
        setConfirmRequest(null);
        action();
    };

    const getStockStatus = (stock: number, itemType?: string) => {
        if (itemType === 'service') {
            return { label: 'Service', bg: '#ede9fe', color: '#6d28d9' };
        }
        if (stock === 0) {
            return { label: 'Out of Stock', bg: '#fef2f2', color: '#dc2626' };
        }
        if (stock < 10) {
            return { label: 'Low Stock', bg: '#fff7ed', color: '#ea580c' };
        }
        return { label: 'In Stock', bg: '#dcfce7', color: '#16a34a' };
    };

    return (
        <VendorShell>
        <div
            className="flex flex-col h-full w-full overflow-y-auto overflow-x-hidden font-display"
        >

            <main className="flex-1 px-10 py-8 max-w-[1440px] mx-auto w-full">
                <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-4xl font-black tracking-tight" style={{ color: themeConfig.text }}>
                            Stock Control
                        </h1>
                        <p className="text-base font-normal" style={{ color: themeConfig.textSecondary }}>
                            Real-time inventory orchestration for your products.
                        </p>
                    </div>
                    <div className="flex gap-3 items-center flex-wrap">
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                            className="h-12 rounded-xl px-3 text-sm font-semibold focus:outline-none border"
                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                        >
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                        </select>
                        <label className="flex flex-col min-w-40 h-12 max-w-64">
                            <div className="flex w-full flex-1 items-stretch rounded-xl h-full border" style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border }}>
                                <div className="flex items-center justify-center pl-4" style={{ color: themeConfig.textSecondary }}>
                                    <span className="material-symbols-outlined text-lg">search</span>
                                </div>
                                <input
                                    className="form-input flex w-full min-w-0 flex-1 border-none bg-transparent focus:ring-0 px-2 text-sm font-normal outline-none"
                                    style={{ color: themeConfig.text }}
                                    placeholder="Search inventory..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </label>
                        <button
                            className="flex items-center gap-2 px-6 h-12 border rounded-xl font-bold text-sm transition-all hover:shadow-lg"
                            style={{
                                backgroundColor: themeConfig.surface,
                                borderColor: themeConfig.border,
                                color: themeConfig.text
                            }}
                            onClick={() => navigate('/vendor/analytics')}
                        >
                            <span className="material-symbols-outlined text-[20px]">analytics</span>
                            Analytics
                        </button>
                        <button
                            className="flex items-center gap-2 px-6 h-12 rounded-xl font-bold text-sm transition-all hover:shadow-xl hover:scale-[1.02]"
                            style={{
                                backgroundColor: primaryColor,
                                color: themeConfig.buttonText
                            }}
                            onClick={() => navigate('/vendor/products/new')}
                        >
                            <span className="material-symbols-outlined text-[20px]">add_circle</span>
                            Create New
                        </button>
                    </div>
                </div>

                <div className="flex border-b mb-8 overflow-x-auto" style={{ borderColor: themeConfig.border }}>
                    {[
                        { id: 'all', label: 'All Products', count: productCounts.all },
                        { id: 'drafts', label: 'Drafts', count: productCounts.drafts, badgeBg: '#fef3c7', badgeColor: '#b45309' },
                        { id: 'low-stock', label: 'Low Stock', count: productCounts['low-stock'], badgeBg: '#fff7ed', badgeColor: '#ea580c' },
                        { id: 'archived', label: 'Archived', count: productCounts.archived },
                        { id: 'out-of-stock', label: 'Out of Stock', count: productCounts['out-of-stock'] },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveFilter(tab.id as ProductFilter)}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 text-sm whitespace-nowrap transition-colors ${
                                activeFilter === tab.id ? 'font-bold' : 'font-semibold'
                            }`}
                            style={{
                                borderColor: activeFilter === tab.id ? primaryColor : 'transparent',
                                color: activeFilter === tab.id ? themeConfig.text : themeConfig.textSecondary
                            }}
                        >
                            {tab.label}
                            <span
                                className="px-2 py-0.5 rounded-full text-[10px]"
                                style={{
                                    backgroundColor: tab.badgeBg || `${primaryColor}10`,
                                    color: tab.badgeColor || primaryColor
                                }}
                            >
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                {!loading && searchQuery.trim() && (
                    <p className="text-sm font-semibold mb-3" style={{ color: themeConfig.textSecondary }}>
                        {totalCount} result{totalCount === 1 ? '' : 's'} for "{searchQuery.trim()}" across your whole catalog
                    </p>
                )}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: `${primaryColor}20`, borderTopColor: primaryColor }}></div>
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div
                            className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                            style={{ backgroundColor: `${primaryColor}10` }}
                        >
                            <span className="material-symbols-outlined text-5xl" style={{ color: primaryColor }}>inventory_2</span>
                        </div>
                        <h3 className="text-xl font-bold mb-2" style={{ color: themeConfig.text }}>
                            No products found
                        </h3>
                        <p className="text-sm mb-6" style={{ color: themeConfig.textSecondary }}>
                            {searchQuery ? 'Try adjusting your search' : 'Start by adding your first product'}
                        </p>
                        {!searchQuery && (
                            <button
                                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02]"
                                style={{
                                    backgroundColor: primaryColor,
                                    color: themeConfig.buttonText
                                }}
                                onClick={() => navigate('/vendor/products/new')}
                            >
                                <span className="material-symbols-outlined">add</span>
                                Add Product
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                        {filteredProducts.map((product) => {
                            const stockStatus = getStockStatus(product.stock, product.item_type);
                            const isSelected = selectedProducts.has(product.id);

                            return (
                                <div
                                    key={product.id}
                                    onClick={() => navigate(`/vendor/products/${product.id}`)}
                                    className="group flex flex-col rounded-2xl border overflow-hidden shadow-sm transition-all duration-300 hover:shadow-xl cursor-pointer"
                                    style={{
                                        backgroundColor: themeConfig.cardBg,
                                        borderColor: themeConfig.border
                                    }}
                                >
                                    <div className="relative h-64 w-full overflow-hidden" style={{ backgroundColor: `${themeConfig.border}40` }}>
                                        {product.processed_image || product.image ? (
                                            <div
                                                className="absolute inset-0 bg-center bg-no-repeat bg-cover transition-transform duration-500 group-hover:scale-110"
                                                style={{
                                                    backgroundImage: `url(${mediaUrl(product.processed_image || product.image)})`
                                                }}
                                            />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-6xl" style={{ color: themeConfig.textSecondary }}>
                                                    image
                                                </span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center gap-2 bg-black/20 backdrop-blur-[2px]">
                                            <button
                                                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110"
                                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                title="Details & social performance"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/vendor/products/${product.id}`);
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                                            </button>
                                            <button
                                                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110"
                                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                title="Edit"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/vendor/products/${product.id}/edit`);
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                            </button>
                                            {product.status === 'archived' ? (
                                                <button
                                                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110"
                                                    style={{ backgroundColor: themeConfig.surface, color: '#16a34a' }}
                                                    title="Restore to store"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        restoreProduct(product);
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">restore</span>
                                                </button>
                                            ) : (
                                                <button
                                                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110"
                                                    style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                    title="Archive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        archiveProduct(product);
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                                                </button>
                                            )}
                                            <button
                                                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110 hover:bg-red-500 hover:text-white"
                                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                title="Delete"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteProduct(product);
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                            </button>
                                        </div>

                                        {product.status === 'draft' && (
                                            <div className="absolute top-4 right-4 px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wide shadow-sm" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                                                Draft
                                            </div>
                                        )}
                                        {product.status === 'archived' && (
                                            <div className="absolute top-4 right-4 px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wide shadow-sm" style={{ backgroundColor: '#f3f4f6', color: '#4b5563' }}>
                                                Archived
                                            </div>
                                        )}
                                        <div className="absolute top-4 left-4">
                                            <input
                                                className="w-5 h-5 rounded-md border-white/50 text-primary cursor-pointer"
                                                style={{
                                                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                                    backdropFilter: 'blur(12px)',
                                                    accentColor: primaryColor
                                                }}
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleProductSelection(product.id)}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-6 flex flex-col gap-3">
                                        <div className="flex justify-between items-start gap-2">
                                            <h3 className="text-lg font-bold leading-tight line-clamp-2" style={{ color: themeConfig.text }}>
                                                {product.name}
                                            </h3>
                                            <span
                                                className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                                                style={{
                                                    backgroundColor: stockStatus.bg,
                                                    color: stockStatus.color
                                                }}
                                            >
                                                {stockStatus.label}
                                            </span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xl font-extrabold" style={{ color: primaryColor }}>
                                                NPR {parseFloat(product.price).toLocaleString()}
                                            </span>
                                            {product.metadata?.original_price && (
                                                <span className="text-xs line-through" style={{ color: themeConfig.textSecondary }}>
                                                    NPR {product.metadata.original_price}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs font-medium" style={{ color: themeConfig.textSecondary }}>
                                            <span>Stock: {product.stock} units</span>
                                            {product.product_code && <span className="font-mono">{product.product_code}</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div
                            className="group flex flex-col items-center justify-center min-h-64 rounded-2xl border-2 border-dashed transition-all cursor-pointer hover:scale-[1.02]"
                            style={{
                                backgroundColor: `${primaryColor}05`,
                                borderColor: `${primaryColor}30`
                            }}
                            onClick={() => navigate('/vendor/products/new')}
                        >
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm mb-4 transition-transform group-hover:scale-110"
                                style={{ backgroundColor: themeConfig.surface, color: primaryColor }}
                            >
                                <span className="material-symbols-outlined">add</span>
                            </div>
                            <span className="font-bold text-sm" style={{ color: primaryColor }}>
                                Add New Product
                            </span>
                            <span className="text-[11px] mt-1 text-center px-6" style={{ color: themeConfig.textSecondary }}>
                                Upload images or import from CSV
                            </span>
                        </div>
                    </div>
                )}
                {nextPage && !loading && (
                    <div className="flex justify-center py-6">
                        <button
                            onClick={() => loadProducts(nextPage)}
                            className="px-6 py-2.5 rounded-xl font-bold text-sm border"
                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                        >
                            Load more ({products.length} of {totalCount})
                        </button>
                    </div>
                )}
            </main>

            {selectedProducts.size > 0 && (
                <div
                    className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-[100] border backdrop-blur-xl"
                    style={{
                        backgroundColor: themeConfig.text,
                        borderColor: `${themeConfig.border}40`,
                        color: themeConfig.surface
                    }}
                >
                    <div
                        className="flex items-center gap-3 pr-6 border-r"
                        style={{ borderColor: `${themeConfig.border}40` }}
                    >
                        <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                            style={{ backgroundColor: primaryColor, color: 'white' }}
                        >
                            {selectedProducts.size}
                        </span>
                        <span className="text-sm font-bold">Items Selected</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            className="flex items-center gap-2 text-xs font-bold transition-colors"
                            style={{ color: themeConfig.surface }}
                            onClick={() => handleBulkAction('archive')}
                        >
                            <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                            Archive
                        </button>
                        <button
                            className="flex items-center gap-2 text-xs font-bold transition-colors hover:text-red-400"
                            style={{ color: themeConfig.surface }}
                            onClick={() => handleBulkAction('delete')}
                        >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                            Delete
                        </button>
                        <button
                            className="ml-2 text-xs opacity-50 hover:opacity-100 transition-opacity"
                            onClick={() => setSelectedProducts(new Set())}
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmRequest !== null}
                title={confirmRequest?.title ?? ''}
                message={confirmRequest?.message ?? ''}
                confirmLabel={confirmRequest?.confirmLabel ?? ''}
                danger={confirmRequest?.danger}
                onConfirm={confirmCurrentRequest}
                onCancel={() => setConfirmRequest(null)}
            />

            <ThemePickerButton />
        </div>
        </VendorShell>
    );
};

export default VendorProductListPage;
