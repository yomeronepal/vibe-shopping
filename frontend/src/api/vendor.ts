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
    image?: File | null;
    status?: 'draft' | 'published';
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
    item_type?: 'physical' | 'service';
    variants?: ProductVariantData[];
}

export interface StockHistoryEntry {
    delta: number;
    resulting_stock: number;
    reason: string;
    note: string;
    created_at: string;
}

export interface UpdateProductData {
    name?: string;
    description?: string;
    price?: number;
    stock?: number;
    stock_by_size?: Record<string, number>;
    image?: File | null;
    tags?: string[];
    vibe_tags?: string[];
}

export interface SocialSyncResult {
    post_id: number;
    platform: string;
    status: 'updated' | 'skipped' | 'failed';
    reason?: string;
    error?: string;
}

export interface SocialSyncResponse {
    caption: string;
    results: SocialSyncResult[];
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
    item_type?: 'physical' | 'service';
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
        if (productData.image) {
            formData.append('image', productData.image);
        }
        formData.append('stock', productData.stock?.toString() || '0');
        formData.append('status', productData.status || 'published');
        formData.append('item_type', productData.item_type || 'physical');

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

    publishDraftProduct: async (id: number): Promise<Product> => {
        const response = await apiClient.post(`/vendor/products/${id}/publish/`);
        return response.data;
    },

    updateProduct: async (id: number, data: UpdateProductData): Promise<Product> => {
        const formData = new FormData();
        if (data.name !== undefined) formData.append('name', data.name);
        if (data.description !== undefined) formData.append('description', data.description);
        if (data.price !== undefined) formData.append('price', data.price.toString());
        if (data.stock !== undefined) formData.append('stock', data.stock.toString());
        if (data.stock_by_size) formData.append('stock_by_size', JSON.stringify(data.stock_by_size));
        if (data.image) formData.append('image', data.image);
        if (data.tags) formData.append('tags', JSON.stringify(data.tags));
        if (data.vibe_tags) formData.append('vibe_tags', JSON.stringify(data.vibe_tags));
        const response = await apiClient.patch(`/vendor/products/${id}/`, formData);
        return response.data;
    },

    syncProductSocial: async (id: number, caption?: string): Promise<SocialSyncResponse> => {
        const response = await apiClient.post(
            `/vendor/products/${id}/sync-social/`,
            caption ? { caption } : {},
        );
        return response.data;
    },

    getStockHistory: async (id: number | string): Promise<StockHistoryEntry[]> => {
        const response = await apiClient.get(`/vendor/products/${id}/stock-history/`);
        return response.data;
    },

    archiveProduct: async (id: number): Promise<Product> => {
        const response = await apiClient.post(`/vendor/products/${id}/archive/`);
        return response.data;
    },

    deleteProduct: async (id: number): Promise<void> => {
        await apiClient.delete(`/vendor/products/${id}/`);
    },

    getProductAnalytics: async (id: string | number, refresh = false): Promise<ProductAnalytics> => {
        const response = await apiClient.get(`/vendor/products/${id}/analytics/`, {
            params: refresh ? { refresh: '1' } : {},
        });
        return response.data;
    },

    getProducts: async (params?: { page?: number; status?: string; stock?: string; q?: string; sort?: string }) => {
        const response = await apiClient.get('/vendor/products/', { params });
        return response.data;
    },

    getProductStats: async (): Promise<{
        all: number;
        published: number;
        draft: number;
        archived: number;
        low_stock: number;
        out_of_stock: number;
        low_stock_products: { id: number; name: string; stock: number }[];
        out_of_stock_products: { id: number; name: string }[];
    }> => {
        const response = await apiClient.get('/vendor/products/stats/');
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
        offering?: 'products' | 'services' | 'both';
        phone?: string;
        email?: string;
        address?: string;
    }, logo?: File | null) => {
        const formData = new FormData();

        if (data.bio) formData.append('bio', data.bio);
        if (data.category) formData.append('category', data.category);
        if (data.brand_vibes) formData.append('brand_vibes', JSON.stringify(data.brand_vibes));
        if (data.ai_persona !== undefined) formData.append('ai_persona', data.ai_persona.toString());
        if (data.offering) formData.append('offering', data.offering);
        if (data.phone) formData.append('phone', data.phone);
        if (data.email) formData.append('email', data.email);
        if (data.address) formData.append('address', data.address);
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

export interface StoreProfile {
    store_name: string;
    subdomain: string | null;
    logo: string | null;
    bio: string;
    category: string;
    brand_vibes: string[];
    phone: string;
    email: string;
    address: string;
    ai_knowledge: string;
    ai_assistant_enabled: boolean;
    ai_auto_reply: boolean;
    ai_tone: string;
    ai_language: string;
    order_fields: string[];
    service_fields: string[];
    offering: 'products' | 'services' | 'both';
    role?: string;
    followup_hours: number;
    followup_message: string;
    restricted_topics: string[];
    ai_max_discount: number;
    max_auto_order_value: number;
    knowledge_docs: { name: string; chars: number }[];
    website_knowledge: { url: string; chars: number };
}

export const uploadKnowledgeDoc = async (file: File): Promise<{ name: string; chars: number }[]> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/vendor/knowledge/documents/', formData);
    return response.data.documents;
};

export const deleteKnowledgeDoc = async (name: string): Promise<{ name: string; chars: number }[]> => {
    const response = await apiClient.delete(`/vendor/knowledge/documents/?name=${encodeURIComponent(name)}`);
    return response.data.documents;
};

export const fetchWebsiteKnowledge = async (url: string): Promise<{ url: string; chars: number }> => {
    const response = await apiClient.post('/vendor/knowledge/website/', { url });
    return response.data;
};

export const removeWebsiteKnowledge = async (): Promise<void> => {
    await apiClient.delete('/vendor/knowledge/website/');
};

export interface UpdateStoreProfileData {
    store_name?: string;
    offering?: 'products' | 'services' | 'both';
    bio?: string;
    category?: string;
    brand_vibes?: string[];
    phone?: string;
    email?: string;
    address?: string;
    logo?: File | null;
}

export interface TeamMember {
    id: number;
    username: string;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    last_login: string | null;
    joined_at: string;
    password?: string;
}

export const listTeam = async (): Promise<{ members: TeamMember[]; your_role: string }> => {
    const response = await apiClient.get('/vendor/team/');
    return response.data;
};

export const createStaff = async (name: string, email: string, role: string): Promise<TeamMember> => {
    const response = await apiClient.post('/vendor/team/', { name, email, role });
    return response.data;
};

export const updateTeamMember = async (userId: number, data: { role?: string; is_active?: boolean }): Promise<TeamMember> => {
    const response = await apiClient.patch(`/vendor/team/${userId}/`, data);
    return response.data;
};

export const resetTeamPassword = async (userId: number): Promise<TeamMember> => {
    const response = await apiClient.post(`/vendor/team/${userId}/reset-password/`);
    return response.data;
};

export const getStoreProfile = async (): Promise<StoreProfile> => {
    const response = await apiClient.get('/vendor/profile/');
    return response.data;
};

export const updateAssistantSettings = async (
    knowledge: string,
    enabled: boolean,
    autoReply: boolean,
    orderFields: string[],
    tone: string,
    language: string,
    followupHours: number,
    followupMessage: string,
    restrictedTopics: string[],
    maxDiscount: number,
    maxAutoOrderValue: number,
    serviceFields: string[],
): Promise<StoreProfile> => {
    const response = await apiClient.patch('/vendor/profile/', {
        ai_knowledge: knowledge,
        ai_assistant_enabled: enabled,
        ai_auto_reply: autoReply,
        order_fields: JSON.stringify(orderFields),
        service_fields: JSON.stringify(serviceFields),
        ai_tone: tone,
        ai_language: language,
        followup_hours: followupHours,
        followup_message: followupMessage,
        restricted_topics: JSON.stringify(restrictedTopics),
        ai_max_discount: maxDiscount,
        max_auto_order_value: maxAutoOrderValue,
    });
    return response.data;
};

export const saveAiSetup = async (data: {
    ai_knowledge?: string;
    ai_auto_reply?: boolean;
    ai_tone?: string;
    ai_language?: string;
}): Promise<StoreProfile> => {
    const response = await apiClient.patch('/vendor/profile/', data);
    return response.data;
};

export const generateStoreBio = async (data: {
    sells: string;
    audience?: string;
    special?: string;
}): Promise<{ bio: string }> => {
    const response = await apiClient.post('/store/generate-bio/', data);
    return response.data;
};

export const updateStoreProfile = async (data: UpdateStoreProfileData): Promise<StoreProfile> => {
    const formData = new FormData();
    if (data.store_name !== undefined) formData.append('store_name', data.store_name);
    if (data.bio !== undefined) formData.append('bio', data.bio);
    if (data.category !== undefined) formData.append('category', data.category);
    if (data.brand_vibes !== undefined) formData.append('brand_vibes', JSON.stringify(data.brand_vibes));
    if (data.phone !== undefined) formData.append('phone', data.phone);
    if (data.email !== undefined) formData.append('email', data.email);
    if (data.address !== undefined) formData.append('address', data.address);
    if (data.logo) formData.append('logo', data.logo);
    const response = await apiClient.patch('/vendor/profile/', formData);
    return response.data;
};

export interface AnalyticsSummary {
    days: number;
    sales: {
        total_orders: number;
        revenue: number;
        average_order_value: number;
        cancelled_orders: number;
        returned_orders: number;
        repeat_customers: number;
        conversion_rate: number;
        conversations: number;
        best_sellers: { name: string; units: number; revenue: number }[];
    };
    social: {
        messages_received: number;
        comments_received: number;
        average_response_minutes: number | null;
        followers: { facebook: number | null; instagram: number | null };
        best_posts: { caption: string; platform: string; engagement: number; post_url: string | null }[];
        best_products: { name: string; engagement: number }[];
    };
    ai: {
        ai_conversations: number;
        handoff_rate: number;
        resolution_rate: number;
        ai_orders: number;
        ai_order_revenue: number;
        ai_conversion_rate: number;
        usage: { provider: string; calls: number; tokens: number; cost_usd: number }[];
        failed_calls: number;
    };
}

export const getAnalyticsSummary = async (days = 30): Promise<AnalyticsSummary> => {
    const response = await apiClient.get('/vendor/analytics/summary/', { params: { days } });
    return response.data;
};
