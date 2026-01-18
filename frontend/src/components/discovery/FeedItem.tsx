import React from 'react';
import { Heart, ShoppingCart, Share2, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from '../common/Button';
import type { Product } from '../../api/products';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

interface FeedItemProps {
    product: Product;
    onAddToCart: (product: Product) => void;
}

const FeedItem: React.FC<FeedItemProps> = ({ product, onAddToCart }) => {
    const handleLike = () => {
        toast.success("Saved to your Likes! ❤️");
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied! 🔗");
    };

    return (
        <div className="relative w-full h-[calc(100vh-64px)] snap-start shrink-0 flex items-center justify-center bg-black overflow-hidden group">

            {/* Background Image */}
            <div className="absolute inset-0">
                <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105"
                />
                {/* Gradient Overlay for Text Readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            </div>

            {/* Content Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 flex flex-col gap-4">

                {/* Vendor & Title */}
                <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                        {product.tenant && (
                            <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10 uppercase tracking-wider">
                                {product.tenant}
                            </span>
                        )}
                        {product.ai_generated_title && (
                            <motion.span
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="text-xs text-indigo-300 font-bold flex items-center gap-1"
                            >
                                ✨ AI Pick
                            </motion.span>
                        )}
                    </div>

                    <h2 className="text-3xl md:text-5xl font-black text-white leading-tight drop-shadow-lg">
                        {product.name}
                    </h2>
                    <p className="text-lg text-slate-200 line-clamp-2 max-w-2xl drop-shadow-md">
                        {product.ai_generated_description || product.description}
                    </p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 my-2">
                    {(product.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs font-medium text-slate-300">#{tag}</span>
                    ))}
                </div>

                {/* Actions Row */}
                <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-4">
                        <span className="text-4xl font-bold text-white drop-shadow-lg">
                            ${parseFloat(product.price).toFixed(2)}
                        </span>

                        <Button
                            onClick={() => onAddToCart(product)}
                            className="bg-white text-black hover:bg-white/90 font-bold px-8 py-4 rounded-full flex items-center gap-2 transform transition hover:scale-105"
                        >
                            <ShoppingCart className="w-5 h-5" />
                            Buy Now
                        </Button>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleLike}
                            className="p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all hover:scale-110"
                        >
                            <Heart className="w-6 h-6" />
                        </button>
                        <button
                            onClick={handleShare}
                            className="p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all hover:scale-110"
                        >
                            <Share2 className="w-6 h-6" />
                        </button>
                        <Link
                            to={`/products/${product.id}`}
                            className="p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all hover:scale-110"
                        >
                            <ExternalLink className="w-6 h-6" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Scroll Hint */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-50 animate-bounce">
                <span className="text-[10px] uppercase tracking-widest text-white">Swipe</span>
                <div className="w-1 h-8 bg-white/50 rounded-full" />
            </div>
        </div>
    );
};

export default FeedItem;
