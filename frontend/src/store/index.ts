import { configureStore } from '@reduxjs/toolkit';
import cartReducer from '@/features/cart/cartSlice';
import authReducer from '@/features/auth/authSlice';
import socialsReducer from '@/features/socials/socialsSlice';
import inboxReducer from '@/features/inbox/inboxSlice';

export const store = configureStore({
    reducer: {
        cart: cartReducer,
        auth: authReducer,
        socials: socialsReducer,
        inbox: inboxReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
