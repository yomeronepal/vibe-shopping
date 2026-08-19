import apiClient from './client';

export interface WeatherTag {
    tag: string;
    fit: string;
}

export interface ProductVariantData {
    color_name: string;
    color_hex: string;
    stock_by_size: Record<string, number>;
    images?: File[];
}

export interface PublishProductData {
    name: string;
    description: string;
    price: number;
    image: File;
    ai_generated_title?: string;
    ai_generated_description?: string;
    tags?: string[];
    vibe_tags?: string[];
    weather_tags?: WeatherTag[];
    category?: string;
    subcategory?: string;
    metadata?: Record<string, any>;
    stock_by_size?: Record<string, number>;
    stock?: number;
    variants?: ProductVariantData[];
}

export interface VendorSignupData {
    username: string;
    email: string;
    password: string;
    store_name: string;
}

export interface VendorSignupResponse {
    message: string;
    tenant_id: number;
    user_id: number;
    token: string;  // Auth token for auto-login
}

export interface Product {
    id: number;
    name: string;
    description: string;
    price: string;
    image: string | null;
    processed_image: string | null;
    status: string;
    stock: number;
    is_active?: boolean;
    ai_generated_title?: string;
    tags?: string[];
    vibe_tags?: string[];
    weather_tags?: WeatherTag[];
    category?: string;
    subcategory?: string;
    metadata?: Record<string, any>;
    stock_by_size?: Record<string, number>;
    images: { id: number; image: string; alt_text: string }[];
    product_code?: string;
    qr_code?: string;
    created_at: string;
}


export interface PostEngagement {
    likes: number;
    comments: number;
    shares: number;
}

export interface AnalyticsPost {
    id: number;
    platform: 'facebook' | 'instagram';
    status: string;
    caption: string;
    image_url: string | null;
    scheduled_for: string | null;
    post_url: string | null;
    error_message: string;
    created_at: string;
    post_format: 'feed' | 'story';
    engagement: PostEngagement;
}

export interface ProductAnalytics {
    product: Product;
    totals: PostEngagement & { published_posts: number };
    posts: AnalyticsPost[];
}

export const vendorApi = {
    publishProduct: async (productData: PublishProductData) => {
        const formData = new FormData();

        formData.append('name', productData.name);
        formData.append('description', productData.description);
        formData.append('price', productData.price.toString());
        formData.append('image', productData.image);
        formData.append('stock', productData.stock?.toString() || '0');
        formData.append('is_active', 'true');

        if (productData.ai_generated_title) {
            formData.append('ai_generated_title', productData.ai_generated_title);
        }
        if (productData.ai_generated_description) {
            formData.append('ai_generated_description', productData.ai_generated_description);
        }
        if (productData.tags) {
            formData.append('tags', JSON.stringify(productData.tags));
        }
        if (productData.vibe_tags) {
            formData.append('vibe_tags', JSON.stringify(productData.vibe_tags));
        }
        if (productData.weather_tags) {
            formData.append('weather_tags', JSON.stringify(productData.weather_tags));
        }
        if (productData.category) {
            formData.append('category', productData.category);
        }
        if (productData.subcategory) {
            formData.append('subcategory', productData.subcategory);
        }
        if (productData.metadata) {
            formData.append('metadata', JSON.stringify(productData.metadata));
        }
        if (productData.stock_by_size) {
            formData.append('stock_by_size', JSON.stringify(productData.stock_by_size));
        }
        if (productData.variants && productData.variants.length > 0) {
            const variantsData = productData.variants.map((variant) => ({
                color_name: variant.color_name,
                color_hex: variant.color_hex,
                stock_by_size: variant.stock_by_size,
                images: variant.images?.length || 0
            }));
            formData.append('variants', JSON.stringify(variantsData));

            productData.variants.forEach((variant, idx) => {
                if (variant.images) {
                    variant.images.forEach((imageFile) => {
                        formData.append(`variant_${idx}_images`, imageFile);
                    });
                }
            });
        }

        const response = await apiClient.post('/vendor/products/', formData);

        return response.data;
    },

    signupVendor: async (data: VendorSignupData): Promise<VendorSignupResponse> => {
        const response = await apiClient.post('/vendor/signup/', data);
        return response.data;
    },

    updateTenant: async (data: { metadata: any }) => {
        const response = await apiClient.patch('/vendor/tenant/current/', data);
        return response.data;
    },

    getProductAnalytics: async (id: string | number, refresh = false): Promise<ProductAnalytics> => {
        const response = await apiClient.get(`/vendor/products/${id}/analytics/`, {
            params: refresh ? { refresh: '1' } : {},
        });
        return response.data;
    },

    getProducts: async () => {
        const response = await apiClient.get('/vendor/products/');
        return response.data;
    },

    getProduct: async (id: string) => {
        const response = await apiClient.get(`/vendor/products/${id}/`);
        return response.data;
    },

    createDraftProduct: async (image: File) => {
        const formData = new FormData();
        formData.append('image', image);
        const response = await apiClient.post('/vendor/products/draft/', formData);
        return response.data; // { id: number, image_url: string }
    },

    updateProduct: async (id: number, productData: PublishProductData) => {
        const formData = new FormData();
        // ... Same appending logic as publish ...
        // Refactoring to shared helper would be better but copy-paste for speed now.

        formData.append('name', productData.name);
        formData.append('description', productData.description);
        formData.append('price', productData.price.toString());
        // Image is already uploaded in draft, but if they changed it...
        if (productData.image) {
            formData.append('image', productData.image);
        }
        formData.append('stock', productData.stock?.toString() || '0');
        formData.append('is_active', 'true');
        formData.append('status', 'published'); // Ensure it gets published

        if (productData.ai_generated_title) formData.append('ai_generated_title', productData.ai_generated_title);
        if (productData.ai_generated_description) formData.append('ai_generated_description', productData.ai_generated_description);
        if (productData.tags) formData.append('tags', JSON.stringify(productData.tags));
        if (productData.vibe_tags) formData.append('vibe_tags', JSON.stringify(productData.vibe_tags));
        if (productData.weather_tags) formData.append('weather_tags', JSON.stringify(productData.weather_tags));
        if (productData.category) formData.append('category', productData.category);
        if (productData.subcategory) formData.append('subcategory', productData.subcategory);
        if (productData.metadata) formData.append('metadata', JSON.stringify(productData.metadata));
        if (productData.stock_by_size) formData.append('stock_by_size', JSON.stringify(productData.stock_by_size));

        const response = await apiClient.patch(`/vendor/products/${id}/`, formData);
        return response.data;
    },

    getSocialMediaConnections: async () => {
        const response = await apiClient.get('/vendor/tenant/social-media/');
        return response.data;
    },

    updateSocialMediaConnections: async (data: {
        social_media: Record<string, any>
    }) => {
        const response = await apiClient.patch('/vendor/tenant/social-media/', data);
        return response.data;
    },

    startOAuth: async (platform: 'instagram' | 'facebook' | 'tiktok') => {
        const response = await apiClient.get(`/vendor/tenant/oauth/${platform}/start/`);
        return response.data;
    },

    // POS Methods
    lookupProductByCode: async (code: string) => {
        const response = await apiClient.get(`/vendor/products/lookup/?code=${code}`);
        return response.data;
    },

    createPOSOrder: async (orderData: {
        items: { product_id: number; quantity: number }[];
        payment_method: string;
        customer_name?: string;
        customer_phone?: string;
        customer_email?: string;
        order_type: 'pos';
    }) => {
        const response = await apiClient.post('/vendor/orders/pos/', orderData);
        return response.data;
    },

    // Onboarding Methods
    getOnboardingStatus: async () => {
        const response = await apiClient.get('/vendor/onboarding/status/');
        return response.data;
    },

    getVendorProfile: async () => {
        const response = await apiClient.get('/vendor/onboarding/status/');
        return response.data;
    },

    saveOnboardingProfile: async (data: {
        bio?: string;
        category?: string;
        brand_vibes?: string[];
        ai_persona?: number;
    }, logo?: File | null) => {
        const formData = new FormData();

        if (data.bio) formData.append('bio', data.bio);
        if (data.category) formData.append('category', data.category);
        if (data.brand_vibes) formData.append('brand_vibes', JSON.stringify(data.brand_vibes));
        if (data.ai_persona !== undefined) formData.append('ai_persona', data.ai_persona.toString());
        if (logo) formData.append('logo', logo);

        const response = await apiClient.post('/vendor/onboarding/profile/', formData);
        return response.data;
    },

    submitKYC: async (data: {
        pan_vat_number: string;
        business_reg_no?: string;
    }, document?: File | null) => {
        const formData = new FormData();

        formData.append('pan_vat_number', data.pan_vat_number);
        if (data.business_reg_no) formData.append('business_reg_no', data.business_reg_no);
        if (document) formData.append('kyc_document', document);

        const response = await apiClient.post('/vendor/onboarding/kyc/', formData);
        return response.data;
    },

    skipSocials: async () => {
        const response = await apiClient.post('/vendor/onboarding/skip-socials/');
        return response.data;
    },

    completeOnboarding: async (theme?: string) => {
        const response = await apiClient.post('/vendor/onboarding/complete/', { theme });
        return response.data;
    },

    // Theme Methods
    getThemes: async () => {
        const response = await apiClient.get('/vendor/themes/');
        return response.data;
    },

    getTheme: async (themeId: string) => {
        const response = await apiClient.get(`/vendor/themes/${themeId}/`);
        return response.data;
    },

    analyzeLogoForTheme: async (logo: File) => {
        const formData = new FormData();
        formData.append('logo', logo);

        const response = await apiClient.post('/vendor/onboarding/analyze-logo/', formData);
        return response.data;
    },

    checkAuthStatus: async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                return { isAuthenticated: false, isOnboardingComplete: false };
            }

            const response = await apiClient.get('/vendor/onboarding/status/');
            return {
                isAuthenticated: true,
                isOnboardingComplete: response.data.is_complete || false
            };
        } catch (error) {
            localStorage.removeItem('token');
            return { isAuthenticated: false, isOnboardingComplete: false };
        }
    }
};
