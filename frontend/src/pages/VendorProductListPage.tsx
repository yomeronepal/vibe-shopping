import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useShopTheme } from '../contexts/ShopThemeContext';
import { vendorApi, type Product } from '../api/vendor';
import toast from 'react-hot-toast';
import ThemePickerButton from '../components/theme/ThemePickerButton';

type ProductFilter = 'all' | 'low-stock' | 'archived' | 'out-of-stock';

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
    const [vendorProfile, setVendorProfile] = useState<VendorProfile>({});

    const primaryColor = themeConfig.primary;

    useEffect(() => {
        loadProducts();
        loadVendorProfile();
    }, []);

    const loadProducts = async () => {
        try {
            setLoading(true);
            const data = await vendorApi.getProducts();
            console.log('Products API response:', data);

            if (Array.isArray(data)) {
                setProducts(data);
            } else if (data && Array.isArray(data.results)) {
                setProducts(data.results);
            } else if (data && Array.isArray(data.products)) {
                setProducts(data.products);
            } else {
                console.error('Unexpected API response format:', data);
                setProducts([]);
                toast.error('Unexpected data format from server');
            }
        } catch (error) {
            toast.error('Failed to load products');
            console.error('Error loading products:', error);
            setProducts([]);
        } finally {
            setLoading(false);
        }
    };

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

    const filteredProducts = Array.isArray(products) ? products.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;

        switch (activeFilter) {
            case 'low-stock':
                return product.stock > 0 && product.stock < 10;
            case 'out-of-stock':
                return product.stock === 0;
            case 'archived':
                return product.is_active === false;
            default:
                return true;
        }
    }) : [];

    const productCounts = {
        all: Array.isArray(products) ? products.length : 0,
        'low-stock': Array.isArray(products) ? products.filter(p => p.stock > 0 && p.stock < 10).length : 0,
        archived: Array.isArray(products) ? products.filter(p => p.is_active === false).length : 0,
        'out-of-stock': Array.isArray(products) ? products.filter(p => p.stock === 0).length : 0,
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

    const handleBulkAction = (action: 'archive' | 'delete' | 'update-price') => {
        toast.success(`${action} action for ${selectedProducts.size} products`);
        setSelectedProducts(new Set());
    };

    const getStockStatus = (stock: number) => {
        if (stock === 0) {
            return { label: 'Out of Stock', bg: '#fef2f2', color: '#dc2626' };
        } else if (stock < 10) {
            return { label: 'Low Stock', bg: '#fff7ed', color: '#ea580c' };
        }
        return { label: 'In Stock', bg: '#dcfce7', color: '#16a34a' };
    };

    return (
        <div
            className="flex flex-col min-h-screen w-full overflow-x-hidden font-display"
            style={{ backgroundColor: themeConfig.background }}
        >
            <header
                className="flex items-center justify-between whitespace-nowrap border-b px-10 py-4 backdrop-blur-md sticky top-0 z-50"
                style={{
                    backgroundColor: `${themeConfig.surface}cc`,
                    borderColor: themeConfig.border
                }}
            >
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-4" style={{ color: primaryColor }}>
                        <div
                            className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
                            style={{
                                backgroundColor: vendorProfile.logo ? 'white' : primaryColor,
                                boxShadow: `0 0 0 2px ${primaryColor}30`
                            }}
                        >
                            {vendorProfile.logo ? (
                                <img
                                    src={`http://localhost:8000${vendorProfile.logo}`}
                                    alt="Store Logo"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="material-symbols-outlined text-white text-xl">storefront</span>
                            )}
                        </div>
                        <h2 className="text-xl font-black leading-tight tracking-tight" style={{ color: themeConfig.text }}>
                            {vendorProfile.store_name || 'Vibe Shop'}
                        </h2>
                    </div>
                    <div className="hidden lg:flex items-center gap-6">
                        <Link to="/vendor" className="text-sm font-medium transition-colors hover:opacity-80" style={{ color: themeConfig.textSecondary }}>
                            Insights
                        </Link>
                        <Link to="/vendor/products" className="text-sm font-bold border-b-2 pb-1" style={{ color: primaryColor, borderColor: primaryColor }}>
                            Inventory
                        </Link>
                        <Link to="/vendor/orders" className="text-sm font-medium transition-colors hover:opacity-80" style={{ color: themeConfig.textSecondary }}>
                            Orders
                        </Link>
                        <Link to="/vendor/ai-lab" className="text-sm font-medium transition-colors hover:opacity-80" style={{ color: themeConfig.textSecondary }}>
                            AI Lab
                        </Link>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <label className="flex flex-col min-w-40 h-10 max-w-64">
                        <div className="flex w-full flex-1 items-stretch rounded-xl h-full" style={{ backgroundColor: `${themeConfig.border}40` }}>
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
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
                        style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}
                    >
                        <span className="material-symbols-outlined">notifications</span>
                    </div>
                    <div
                        className="w-10 h-10 rounded-full border-2 bg-center bg-no-repeat bg-cover cursor-pointer"
                        style={{ borderColor: `${primaryColor}20` }}
                        onClick={() => navigate('/vendor')}
                    >
                        {vendorProfile.logo ? (
                            <img
                                src={`http://localhost:8000${vendorProfile.logo}`}
                                alt="Profile"
                                className="w-full h-full object-cover rounded-full"
                            />
                        ) : (
                            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                                <span className="material-symbols-outlined text-white text-sm">person</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

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
                    <div className="flex gap-3">
                        <button
                            className="flex items-center gap-2 px-6 h-12 border rounded-xl font-bold text-sm transition-all hover:shadow-lg"
                            style={{
                                backgroundColor: themeConfig.surface,
                                borderColor: themeConfig.border,
                                color: themeConfig.text
                            }}
                            onClick={() => toast.success('Analytics coming soon!')}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredProducts.map((product) => {
                            const stockStatus = getStockStatus(product.stock);
                            const isSelected = selectedProducts.has(product.id);

                            return (
                                <div
                                    key={product.id}
                                    className="group flex flex-col rounded-2xl border overflow-hidden shadow-sm transition-all duration-300 hover:shadow-xl"
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
                                                    backgroundImage: `url(http://localhost:8000${product.processed_image || product.image})`
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
                                                title="View Details"
                                                onClick={() => navigate(`/product/${product.id}`)}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                                            </button>
                                            <button
                                                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110"
                                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                title="Edit Product"
                                                onClick={() => toast.success('Edit coming soon!')}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                            </button>
                                            <button
                                                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110"
                                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                title="Archive"
                                                onClick={() => toast.success('Archive coming soon!')}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                                            </button>
                                            <button
                                                className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110 hover:bg-red-500 hover:text-white"
                                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.text }}
                                                title="Delete"
                                                onClick={() => toast.error('Delete coming soon!')}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                            </button>
                                        </div>

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
                                        <div className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>
                                            Stock: {product.stock} units
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
                            className="flex items-center gap-2 text-xs font-bold transition-colors"
                            style={{ color: themeConfig.surface }}
                            onClick={() => handleBulkAction('update-price')}
                        >
                            <span className="material-symbols-outlined text-[18px]">sell</span>
                            Update Price
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

            <ThemePickerButton />
        </div>
    );
};

export default VendorProductListPage;
