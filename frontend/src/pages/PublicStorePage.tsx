
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import ProductCard from '../components/products/ProductCard';

interface Product {
    id: number;
    name: string;
    description: string;
    price: string;
    image: string;
    tenant: number;
}

const PublicStorePage: React.FC = () => {
    const { subdomain } = useParams<{ subdomain: string }>();
    const [searchParams] = useSearchParams();
    // Allow subdomain from URL param OR params for testing
    const activeSubdomain = subdomain || searchParams.get('subdomain');

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStoreProducts = async () => {
            if (!activeSubdomain) {
                setError('No store specified');
                setLoading(false);
                return;
            }

            try {
                // In production, we'd rely on Host header.
                // For dev/testing, we might need a trick.
                // We will try sending a custom header if we are not actually ON the subdomain.
                const isLocal = window.location.hostname.includes('localhost');

                const config = isLocal ? {
                    headers: {
                        'Host': `${activeSubdomain}.vibe-shopping.com` // Spoof Host header? Browsers might block this.
                        // Better: Rely on middleware checking X-Forwarded-Host or similar if allowed?
                        // actually, let's just assume the user sets up /etc/hosts or we use a query param on backend if needed.
                        // Update: Middleware checks Host. Browsers set Host. 
                        // Check if we can send a custom header that middleware also respects?
                    }
                } : {};

                // If we can't spoof Host, we might fail locally unless we use real subdomains.
                // But for now, let's try calling the public endpoint.
                // NOTE: Browser prevents setting Host header.
                // We will update Middleware to look for X-Tenant-Subdomain for easier dev?

                const response = await apiClient.get('/public/products/', {
                    headers: {
                        'X-Tenant-Subdomain': activeSubdomain // We need to update middleware to support this for dev!
                    }
                });
                setProducts(response.data.results || response.data);
            } catch (err) {
                console.error(err);
                setError('Failed to load store products.');
            } finally {
                setLoading(false);
            }
        };

        fetchStoreProducts();
    }, [activeSubdomain]);

    if (loading) return <div className="text-center py-10">Loading Store...</div>;
    if (error) return <div className="text-center py-10 text-red-500">{error}</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
                    {activeSubdomain?.toUpperCase()} Store
                </h1>
                <p className="mt-5 max-w-xl mx-auto text-xl text-gray-500">
                    Welcome to our exclusive collection.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-y-10 sm:grid-cols-2 gap-x-6 lg:grid-cols-3 xl:grid-cols-4 xl:gap-x-8">
                {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                ))}
            </div>

            {products.length === 0 && (
                <div className="text-center text-gray-500">
                    No products found in this store.
                </div>
            )}
        </div>
    );
};

export default PublicStorePage;
