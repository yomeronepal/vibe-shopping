import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ProductCard from '../components/products/ProductCard';
import type { Product } from '../api/products';
import { productsApi } from '../api/products';

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoading(true);
                const data = await productsApi.getProducts();
                setProducts(data.results);
            } catch (err) {
                setError('Failed to load products. Please try again later.');
                console.error('Error fetching products:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-20">
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-500 border-t-transparent"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto px-4 py-20">
                <div className="glass rounded-2xl p-8 text-center">
                    <p className="text-xl text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-12">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12"
            >
                <h1 className="text-4xl font-display font-bold text-gradient mb-4">
                    Our Products
                </h1>
                <p className="text-lg text-slate-600">
                    Explore our curated collection of premium products
                </p>
            </motion.div>

            {products.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                    <p className="text-xl text-slate-600">No products available at the moment.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            )}
        </div>
    );
}
