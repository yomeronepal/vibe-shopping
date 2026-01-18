import React, { useEffect, useState } from 'react';
import { publicApi } from '../../api/products';
import type { Product } from '../../api/products';
import FeedItem from './FeedItem';
import { useDispatch } from 'react-redux';
import { addToCart } from '../../features/cart/cartSlice';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

const OutfitFeed: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const dispatch = useDispatch();

    useEffect(() => {
        const fetchFeed = async () => {
            try {
                // Fetch random/latest products. 
                // For now, standard list. Ideally backend supports random ordering for discovery.
                const data = await publicApi.getProducts({ is_active: 'true' });
                setProducts(data);
            } catch (error) {
                console.error("Failed to load feed", error);
                toast.error("Could not load styles. Try again later.");
            } finally {
                setLoading(false);
            }
        };

        fetchFeed();
    }, []);

    const handleAddToCart = (product: Product) => {
        // Fix price parsing if string, although API suggests number in some places, 
        // frontend Product type says string. Redux expects matching Product type (or loosely).
        // The slice expects PayloadAction<Product>.
        // If slice Product type is different, we might have issue.
        // Assuming slice imports same Product type.

        dispatch(addToCart(product));
        toast.success(`Added ${product.name} to cart! 🛍️`);
    };

    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-black text-white">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-black text-white">
                <p>No vibes found yet. Check back later.</p>
            </div>
        );
    }

    return (
        // Snap Container
        <div className="h-[calc(100vh-64px)] w-full overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar">
            {products.map((product) => (
                <FeedItem
                    key={product.id}
                    product={product}
                    onAddToCart={handleAddToCart}
                />
            ))}

            {/* End of Feed */}
            <div className="h-64 snap-start flex items-center justify-center bg-black text-slate-500">
                <p>You've reached the end of the styles.</p>
            </div>
        </div>
    );
};

export default OutfitFeed;
