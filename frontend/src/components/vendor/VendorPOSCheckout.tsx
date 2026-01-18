import { useState, useEffect, useRef } from 'react';
import { vendorApi, type Product } from '../../api/vendor';
import { Html5QrcodeScanner } from 'html5-qrcode';
import Button from '../common/Button';
import { Search, Loader2, Trash2, CreditCard, ShoppingCart, User, Smartphone, Banknote, Scan, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function VendorPOSCheckout() {
    const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
    const [searchCode, setSearchCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [customerInfo, setCustomerInfo] = useState({
        name: '',
        email: '',
        phone: ''
    });
    const [paymentMethod, setPaymentMethod] = useState('credit_card');
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + (Number(item.product.price) * item.quantity), 0);
    const tax = 0; // Assuming tax included or 0 for now
    const total = subtotal + tax;

    useEffect(() => {
        if (showScanner) {
            // Initialize scanner
            const scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );

            scanner.render(onScanSuccess, onScanFailure);
            scannerRef.current = scanner;

            return () => {
                scanner.clear().catch(console.error);
            };
        }
    }, [showScanner]);

    const onScanSuccess = async (decodedText: string, _decodedResult: any) => {
        // Extract code if it's a URL or just use the text
        let code = decodedText;
        if (decodedText.includes('code=')) {
            code = decodedText.split('code=')[1];
        }

        // Stop scanning temporarily
        if (scannerRef.current) {
            scannerRef.current.pause();
        }

        await handleLookup(code);

        // Resume scanning after short delay
        setTimeout(() => {
            if (scannerRef.current) {
                scannerRef.current.resume();
            }
        }, 1500);
    };

    const onScanFailure = (_error: any) => {
        // Handle scan failure, usually ignore
    };

    const handleLookup = async (code: string) => {
        if (!code) return;
        setIsLoading(true);
        try {
            const product = await vendorApi.lookupProductByCode(code);
            addToCart(product);
            setSearchCode('');
            toast.success(`Added ${product.name}`);
        } catch (error) {
            toast.error('Product not found / invalid code');
        } finally {
            setIsLoading(false);
        }
    };

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock) {
                    toast.error('Insufficient stock');
                    return prev;
                }
                return prev.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            if (product.stock <= 0) {
                toast.error('Out of stock');
                return prev;
            }
            return [...prev, { product, quantity: 1 }];
        });
    };

    const removeFromCart = (productId: number) => {
        setCart(prev => prev.filter(item => item.product.id !== productId));
    };

    const updateQuantity = (productId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.product.id === productId) {
                const newQty = item.quantity + delta;
                if (newQty <= 0) return item;
                if (newQty > item.product.stock) {
                    toast.error('Max stock reached');
                    return item;
                }
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const handleCheckout = async () => {
        if (cart.length === 0) return;
        setIsLoading(true);

        try {
            await vendorApi.createPOSOrder({
                items: cart.map(item => ({
                    product_id: item.product.id,
                    quantity: item.quantity
                })),
                payment_method: paymentMethod,
                order_type: 'pos',
                customer_name: customerInfo.name,
                customer_email: customerInfo.email,
                customer_phone: customerInfo.phone
            });

            toast.success('Order completed successfully!');
            setCart([]);
            setCustomerInfo({ name: '', email: '', phone: '' });

        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Checkout failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
            {/* Left Panel - Scanner & Lookup */}
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2">

                {/* Search Bar */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={searchCode}
                            onChange={(e) => setSearchCode(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLookup(searchCode)}
                            placeholder="Enter Product Code / SKU"
                            className="w-full pl-10 pr-4 py-3 rounded-lg border bg-white dark:bg-gray-800 focus:ring-2 focus:ring-vibe-accent outline-none"
                            style={{ borderColor: 'var(--vibe-border)' }}
                        />
                        <Search className="absolute left-3 top-3.5 w-5 h-5 opacity-50" />
                    </div>
                    <Button onClick={() => handleLookup(searchCode)} disabled={isLoading}>
                        {isLoading ? <Loader2 className="animate-spin" /> : 'Add'}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowScanner(!showScanner)}
                        className={showScanner ? 'bg-red-50 text-red-600 border-red-200' : ''}
                    >
                        {showScanner ? <X className="w-5 h-5" /> : <Scan className="w-5 h-5" />}
                    </Button>
                </div>

                {/* Scanner Area */}
                {showScanner && (
                    <div className="bg-black rounded-lg overflow-hidden relative min-h-[300px]">
                        <div id="reader" className="w-full h-full"></div>
                    </div>
                )}

                {/* Quick Stats / Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                        <h3 className="font-semibold text-blue-700 dark:text-blue-300 mb-1">Scanning Mode</h3>
                        <p className="text-sm opacity-80">Scan product QR codes or enter SKU manually to add items to cart.</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800">
                        <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-1">Inventory Check</h3>
                        <p className="text-sm opacity-80">Stock levels are automatically checked and updated upon checkout.</p>
                    </div>
                </div>
            </div>

            {/* Right Panel - Cart & Checkout */}
            <div className="w-full lg:w-[400px] flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border"
                style={{ borderColor: 'var(--vibe-border)' }}>

                {/* Cart Header */}
                <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--vibe-border)' }}>
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5" />
                        <h2 className="font-bold text-lg">Current Order</h2>
                    </div>
                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">
                        {cart.reduce((acc, item) => acc + item.quantity, 0)} items
                    </span>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                            <ShoppingCart className="w-12 h-12 mb-2" />
                            <p>Cart is empty</p>
                        </div>
                    ) : (
                        cart.map((item) => (
                            <div key={item.product.id} className="flex gap-3">
                                <div className="w-16 h-16 bg-gray-100 rounded-md overflow-hidden flex-shrink-0">
                                    {item.product.image && (
                                        <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-medium text-sm line-clamp-2">{item.product.name}</h4>
                                    <p className="text-xs opacity-60 mb-1">{item.product.product_code}</p>
                                    <div className="flex justify-between items-center">
                                        <div className="font-bold">${item.product.price}</div>
                                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg p-1">
                                            <button onClick={() => updateQuantity(item.product.id, -1)} className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded">-</button>
                                            <span className="text-sm w-4 text-center">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.product.id, 1)} className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded">+</button>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => removeFromCart(item.product.id)} className="text-red-400 hover:text-red-600 p-1">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Totals & Checkout */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t space-y-4" style={{ borderColor: 'var(--vibe-border)' }}>

                    {/* Customer Info (Collapsible or compact) */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                            <User className="w-4 h-4" /> Customer Info
                        </div>
                        <input
                            type="text"
                            placeholder="Customer Name (Optional)"
                            value={customerInfo.name}
                            onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                            className="w-full p-2 text-sm rounded border bg-white dark:bg-gray-800"
                        />
                        <div className="flex gap-2">
                            <input
                                type="email"
                                placeholder="Email"
                                value={customerInfo.email}
                                onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                                className="w-1/2 p-2 text-sm rounded border bg-white dark:bg-gray-800"
                            />
                            <input
                                type="tel"
                                placeholder="Phone"
                                value={customerInfo.phone}
                                onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                                className="w-1/2 p-2 text-sm rounded border bg-white dark:bg-gray-800"
                            />
                        </div>
                    </div>

                    {/* Payment Method */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'credit_card', icon: CreditCard, label: 'Card' },
                            { id: 'cash', icon: Banknote, label: 'Cash' },
                            { id: 'mobile_payment', icon: Smartphone, label: 'Mobile' }
                        ].map(method => (
                            <button
                                key={method.id}
                                onClick={() => setPaymentMethod(method.id)}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs transition-colors ${paymentMethod === method.id
                                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                                        : 'bg-white border-transparent hover:bg-gray-100'
                                    }`}
                            >
                                <method.icon className="w-4 h-4 mb-1" />
                                {method.label}
                            </button>
                        ))}
                    </div>

                    <div className="pt-2 border-t border-dashed border-gray-300">
                        <div className="flex justify-between text-lg font-bold">
                            <span>Total</span>
                            <span>${total.toFixed(2)}</span>
                        </div>
                    </div>

                    <Button
                        onClick={handleCheckout}
                        className="w-full py-3 text-lg"
                        disabled={cart.length === 0 || isLoading}
                    >
                        {isLoading ? <Loader2 className="animate-spin mx-auto" /> : `Charge $${total.toFixed(2)}`}
                    </Button>
                </div>
            </div>
        </div>
    );
}
