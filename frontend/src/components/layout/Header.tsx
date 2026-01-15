import { Link } from 'react-router-dom';
import { ShoppingCartIcon, UserIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAppSelector } from '@/store/hooks';

export default function Header() {
    const cartItems = useAppSelector((state) => state.cart.items);
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <header className="glass sticky top-0 z-50 border-b border-white/20">
            <nav className="container mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                    {/* Logo */}
                    <Link to="/" className="flex items-center space-x-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-xl">V</span>
                        </div>
                        <span className="text-2xl font-display font-bold text-gradient">
                            Vibe Shopping
                        </span>
                    </Link>

                    {/* Navigation Links */}
                    <div className="hidden md:flex items-center space-x-8">
                        <Link to="/" className="text-slate-700 hover:text-primary-600 font-medium transition">
                            Home
                        </Link>
                        <Link to="/products" className="text-slate-700 hover:text-primary-600 font-medium transition">
                            Products
                        </Link>
                        <Link to="/about" className="text-slate-700 hover:text-primary-600 font-medium transition">
                            About
                        </Link>
                        <Link to="/contact" className="text-slate-700 hover:text-primary-600 font-medium transition">
                            Contact
                        </Link>
                    </div>

                    {/* Search Bar */}
                    <div className="hidden lg:flex items-center flex-1 max-w-md mx-8">
                        <div className="relative w-full">
                            <input
                                type="text"
                                placeholder="Search products..."
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition outline-none"
                            />
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                        </div>
                    </div>

                    {/* Right Side Icons */}
                    <div className="flex items-center space-x-4">
                        {/* Cart */}
                        <Link to="/cart" className="relative p-2 hover:bg-primary-50 rounded-lg transition">
                            <ShoppingCartIcon className="w-6 h-6 text-slate-700" />
                            {cartCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-secondary-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                                    {cartCount}
                                </span>
                            )}
                        </Link>

                        {/* User */}
                        <Link
                            to={isAuthenticated ? '/profile' : '/login'}
                            className="p-2 hover:bg-primary-50 rounded-lg transition"
                        >
                            <UserIcon className="w-6 h-6 text-slate-700" />
                        </Link>
                    </div>
                </div>
            </nav>
        </header>
    );
}
