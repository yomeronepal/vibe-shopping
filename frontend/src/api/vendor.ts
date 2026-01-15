import apiClient from './client';

export interface PublishProductData {
    name: string;
    description: string;
    price: number;
    image: File;
    ai_generated_title?: string;
    ai_generated_description?: string;
    tags?: string[];
    category?: string;
    subcategory?: string;
    metadata?: Record<string, any>;
}

export const vendorApi = {
    publishProduct: async (productData: PublishProductData) => {
        const formData = new FormData();

        formData.append('name', productData.name);
        formData.append('description', productData.description);
        formData.append('price', productData.price.toString());
        formData.append('image', productData.image);
        formData.append('stock', '10'); // Default stock
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
        if (productData.category) {
            formData.append('category', productData.category);
        }
        if (productData.subcategory) {
            formData.append('subcategory', productData.subcategory);
        }
        if (productData.metadata) {
            formData.append('metadata', JSON.stringify(productData.metadata));
        }

        const response = await apiClient.post('/products/', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return response.data;
    },
};
