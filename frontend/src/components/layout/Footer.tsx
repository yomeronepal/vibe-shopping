import { Link } from 'react-router-dom';

export default function Footer() {
    return (
        <footer className="glass border-t border-white/20 mt-20">
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-lg flex items-center justify-center">
                                <span className="text-white font-bold text-xl">V</span>
                            </div>
                            <span className="text-xl font-display font-bold text-gradient">
                                BizAlly
                            </span>
                        </div>
                        <p className="text-slate-600 text-sm">
                            Your one-stop destination for premium products and exceptional shopping experience.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h3 className="font-semibold text-slate-900 mb-4">Quick Links</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link to="/products" className="text-slate-600 hover:text-primary-600 transition">
                                    All Products
                                </Link>
                            </li>
                            <li>
                                <Link to="/about" className="text-slate-600 hover:text-primary-600 transition">
                                    About Us
                                </Link>
                            </li>
                            <li>
                                <Link to="/contact" className="text-slate-600 hover:text-primary-600 transition">
                                    Contact
                                </Link>
                            </li>
                            <li>
                                <Link to="/faq" className="text-slate-600 hover:text-primary-600 transition">
                                    FAQ
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Customer Service */}
                    <div>
                        <h3 className="font-semibold text-slate-900 mb-4">Customer Service</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link to="/shipping" className="text-slate-600 hover:text-primary-600 transition">
                                    Shipping Info
                                </Link>
                            </li>
                            <li>
                                <Link to="/returns" className="text-slate-600 hover:text-primary-600 transition">
                                    Returns
                                </Link>
                            </li>
                            <li>
                                <Link to="/privacy" className="text-slate-600 hover:text-primary-600 transition">
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link to="/terms" className="text-slate-600 hover:text-primary-600 transition">
                                    Terms of Service
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Newsletter */}
                    <div>
                        <h3 className="font-semibold text-slate-900 mb-4">Newsletter</h3>
                        <p className="text-slate-600 text-sm mb-4">
                            Subscribe to get special offers and updates.
                        </p>
                        <div className="flex">
                            <input
                                type="email"
                                placeholder="Your email"
                                className="flex-1 px-4 py-2 rounded-l-lg border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                            />
                            <button className="px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-r-lg hover:shadow-lg transition">
                                Subscribe
                            </button>
                        </div>
                    </div>
                </div>

                {/* Bottom */}
                <div className="mt-8 pt-8 border-t border-slate-200 text-center text-slate-600 text-sm">
                    <p>&copy; {new Date().getFullYear()} BizAlly. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}
