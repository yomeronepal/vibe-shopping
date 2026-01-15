import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Product } from '../../api/products';

interface CartItem extends Product {
    quantity: number;
}

interface CartState {
    items: CartItem[];
    total: number;
}

const initialState: CartState = {
    items: [],
    total: 0,
};

// Load cart from localStorage
const loadCartFromStorage = (): CartState => {
    try {
        const serialized = localStorage.getItem('cart');
        if (serialized) {
            return JSON.parse(serialized);
        }
    } catch (err) {
        console.error('Failed to load cart from storage:', err);
    }
    return initialState;
};

const cartSlice = createSlice({
    name: 'cart',
    initialState: loadCartFromStorage(),
    reducers: {
        addToCart: (state, action: PayloadAction<Product>) => {
            const existingItem = state.items.find(item => item.id === action.payload.id);

            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                state.items.push({ ...action.payload, quantity: 1 });
            }

            state.total = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            localStorage.setItem('cart', JSON.stringify(state));
        },

        removeFromCart: (state, action: PayloadAction<number>) => {
            state.items = state.items.filter(item => item.id !== action.payload);
            state.total = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            localStorage.setItem('cart', JSON.stringify(state));
        },

        updateQuantity: (state, action: PayloadAction<{ id: number; quantity: number }>) => {
            const item = state.items.find(item => item.id === action.payload.id);
            if (item) {
                item.quantity = action.payload.quantity;
                state.total = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
                localStorage.setItem('cart', JSON.stringify(state));
            }
        },

        clearCart: (state) => {
            state.items = [];
            state.total = 0;
            localStorage.removeItem('cart');
        },
    },
});

export const { addToCart, removeFromCart, updateQuantity, clearCart } = cartSlice.actions;
export default cartSlice.reducer;
