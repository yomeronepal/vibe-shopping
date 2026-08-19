import apiClient from './client';

export interface Product {
    id: number;
    tenant: string;
    name: string;
    description: string;
    price: string; // Django DecimalField returns string usually, or number if float. Checking usages.
    image?: string;
    processed_image?: string | null;
    images?: { id: number; image: string }[];
    category?: string;
    subcategory?: string;
    vibe_tags?: string[];
    stock: number;
    is_active: boolean;
    ai_generated_title?: string;
    ai_generated_description?: string;
    tags?: string[];
    created_at: string;
    updated_at: string;
}

export interface ProductsResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: Product[];
}

export const productsApi = {
    getProducts: async (page = 1): Promise<ProductsResponse> => {
        const response = await apiClient.get<ProductsResponse>(`/products/?page=${page}`);
        return response.data;
    },
    getProduct: async (id: number): Promise<Product> => {
        const response = await apiClient.get<Product>(`/products/${id}/`);
        return response.data;
    }
};

export const publicApi = {
    getProducts: async (params?: any): Promise<Product[]> => {
        const response = await apiClient.get<Product[]>('/public/products/', { params });
        return response.data;
    },
    getProduct: async (id: string | number): Promise<Product> => {
        const response = await apiClient.get<Product>(`/public/products/${id}/`);
        return response.data;
    }
};
