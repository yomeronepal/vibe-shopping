import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Product } from '../../api/products';
import { useAppDispatch } from '../../store/hooks';
import { addToCart } from '../../features/cart/cartSlice';
import Button from '../common/Button';
import { ShoppingCartIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface ProductCardProps {
    product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
    const dispatch = useAppDispatch();

    const handleAddToCart = () => {
        dispatch(addToCart(product));
        toast.success(`${product.name} added to cart!`);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -8 }}
            className="card group"
        >
            <Link to={`/products/${product.id}`} className="block">
                {/* Image Placeholder */}
                <div className="w-full h-64 bg-gradient-to-br from-primary-100 to-secondary-100 rounded-xl mb-4 flex items-center justify-center overflow-hidden">
                    <span className="text-6xl font-bold text-white/50">{product.name[0]}</span>
                </div>

                {/* Product Info */}
                <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-primary-600 transition">
                    {product.name}
                </h3>
                <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                    {product.description || 'No description available'}
                </p>
            </Link>

            <div className="flex items-center justify-between">
                <div>
                    <p className="text-2xl font-bold text-gradient">
                        ${Number(product.price).toFixed(2)}
                    </p>
                    <p className="text-sm text-slate-500">
                        {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                    </p>
                </div>

                <Button
                    onClick={handleAddToCart}
                    disabled={product.stock === 0}
                    variant="primary"
                    size="sm"
                    className="flex items-center gap-2"
                >
                    <ShoppingCartIcon className="w-4 h-4" />
                    Add
                </Button>
            </div>
        </motion.div>
    );
}
