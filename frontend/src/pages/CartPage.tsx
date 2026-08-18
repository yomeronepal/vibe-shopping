import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { removeFromCart, updateQuantity } from '@/features/cart/cartSlice';
import Button from '@/components/common/Button';
import { TrashIcon, MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function CartPage() {
    const dispatch = useAppDispatch();
    const { items, total } = useAppSelector((state) => state.cart);

    const handleRemoveItem = (id: number, name: string) => {
        dispatch(removeFromCart(id));
        toast.success(`${name} removed from cart`);
    };

    const handleUpdateQuantity = (id: number, currentQuantity: number, change: number) => {
        const newQuantity = currentQuantity + change;
        if (newQuantity > 0) {
            dispatch(updateQuantity({ id, quantity: newQuantity }));
        }
    };

    if (items.length === 0) {
        return (
            <div className="container mx-auto px-4 py-20">
                <div className="glass rounded-2xl p-12 text-center max-w-2xl mx-auto">
                    <h2 className="text-3xl font-bold text-gradient mb-4">Your Cart is Empty</h2>
                    <p className="text-slate-600 mb-8">
                        Looks like you haven't added anything to your cart yet.
                    </p>
                    <Link to="/products">
                        <Button variant="primary" size="lg">
                            Start Shopping
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-12">
            <h1 className="text-4xl font-display font-bold text-gradient mb-8">
                Shopping Cart
            </h1>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Cart Items */}
                <div className="lg:col-span-2 space-y-4">
                    {items.map((item) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="glass rounded-xl p-6"
                        >
                            <div className="flex gap-6">
                                {/* Image Placeholder */}
                                <div className="w-24 h-24 bg-gradient-to-br from-primary-100 to-secondary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <span className="text-3xl font-bold text-white/50">{item.name[0]}</span>
                                </div>

                                <div className="flex-1">
                                    <Link to={`/products/${item.id}`} className="text-lg font-semibold text-slate-900 hover:text-primary-600 transition">
                                        {item.name}
                                    </Link>
                                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                                        {item.description}
                                    </p>

                                    <div className="flex items-center justify-between mt-4">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => handleUpdateQuantity(item.id, item.quantity, -1)}
                                                className="w-8 h-8 rounded-lg border-2 border-slate-300 flex items-center justify-center hover:border-primary-500 hover:bg-primary-50 transition"
                                            >
                                                <MinusIcon className="w-4 h-4" />
                                            </button>
                                            <span className="font-semibold w-8 text-center">{item.quantity}</span>
                                            <button
                                                onClick={() => handleUpdateQuantity(item.id, item.quantity, 1)}
                                                className="w-8 h-8 rounded-lg border-2 border-slate-300 flex items-center justify-center hover:border-primary-500 hover:bg-primary-50 transition"
                                            >
                                                <PlusIcon className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <p className="text-xl font-bold text-gradient">
                                                ${(Number(item.price) * item.quantity).toFixed(2)}
                                            </p>
                                            <button
                                                onClick={() => handleRemoveItem(item.id, item.name)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                            >
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Order Summary */}
                <div className="lg:col-span-1">
                    <div className="glass rounded-xl p-6 sticky top-24">
                        <h2 className="text-2xl font-bold mb-6">Order Summary</h2>

                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-slate-600">
                                <span>Subtotal</span>
                                <span>${total.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                                <span>Shipping</span>
                                <span>Free</span>
                            </div>
                            <div className="border-t border-slate-200 pt-3 flex justify-between text-xl font-bold">
                                <span>Total</span>
                                <span className="text-gradient">${total.toFixed(2)}</span>
                            </div>
                        </div>

                        <Button variant="primary" className="w-full mb-3">
                            Proceed to Checkout
                        </Button>
                        <Link to="/products">
                            <Button variant="outline" className="w-full">
                                Continue Shopping
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
