import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '@/components/common/Button';
import { SparklesIcon, TruckIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function HomePage() {
    return (
        <div>
            {/* Hero Section */}
            <section className="relative py-20 overflow-hidden">
                <div className="container mx-auto px-4">
                    <div className="flex flex-col lg:flex-row items-center gap-12">
                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex-1 text-center lg:text-left"
                        >
                            <h1 className="text-5xl lg:text-7xl font-display font-bold mb-6">
                                Welcome to{' '}
                                <span className="text-gradient">Vibe Shopping</span>
                            </h1>
                            <p className="text-xl text-slate-600 mb-8 max-w-2xl">
                                Discover amazing products with exceptional quality. Your ultimate shopping destination for everything you need.
                            </p>
                            <div className="flex gap-4 justify-center lg:justify-start">
                                <Link to="/products">
                                    <Button variant="primary" size="lg">
                                        Shop Now
                                    </Button>
                                </Link>
                                <Link to="/about">
                                    <Button variant="outline" size="lg">
                                        Learn More
                                    </Button>
                                </Link>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex-1"
                        >
                            <div className="relative">
                                <div className="w-full h-96 bg-gradient-to-br from-primary-400 to-secondary-400 rounded-3xl glass animate-float"></div>
                                <div className="absolute -bottom-6 -right-6 w-64 h-64 bg-gradient-to-br from-secondary-300 to-primary-300 rounded-3xl glass"></div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-20 bg-white/50">
                <div className="container mx-auto px-4">
                    <h2 className="text-4xl font-display font-bold text-center mb-12 text-gradient">
                        Why Choose Us?
                    </h2>
                    <div className="grid md:grid-cols-3 gap-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="card text-center"
                        >
                            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <SparklesIcon className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold mb-3">Premium Quality</h3>
                            <p className="text-slate-600">
                                Hand-picked products with exceptional quality standards
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="card text-center"
                        >
                            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <TruckIcon className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold mb-3">Fast Shipping</h3>
                            <p className="text-slate-600">
                                Quick and reliable delivery to your doorstep
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="card text-center"
                        >
                            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <ShieldCheckIcon className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold mb-3">Secure Payment</h3>
                            <p className="text-slate-600">
                                Your transactions are safe and encrypted
                            </p>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20">
                <div className="container mx-auto px-4">
                    <div className="glass rounded-3xl p-12 text-center">
                        <h2 className="text-4xl font-display font-bold mb-4 text-gradient">
                            Ready to Start Shopping?
                        </h2>
                        <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
                            Join thousands of happy customers and discover amazing deals today!
                        </p>
                        <Link to="/products">
                            <Button variant="secondary" size="lg">
                                Browse Products
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
