import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
    completeOAuth,
    connectPage,
    disconnectPage,
    getConnectUrl,
    listConnectedPages,
    type ConnectedPage,
    type MetaPage,
} from '@/api/socials';

interface SocialsState {
    pages: ConnectedPage[];
    availablePages: MetaPage[];
    loading: boolean;
    error: string | null;
}

const initialState: SocialsState = {
    pages: [],
    availablePages: [],
    loading: false,
    error: null,
};

export const fetchConnectedPages = createAsyncThunk(
    'socials/fetchConnectedPages',
    async () => listConnectedPages(),
);

export const startConnect = createAsyncThunk(
    'socials/startConnect',
    async () => getConnectUrl(),
);

export const finishOAuth = createAsyncThunk(
    'socials/finishOAuth',
    async ({ code, state }: { code: string; state: string }) =>
        completeOAuth(code, state),
);

export const connectMetaPage = createAsyncThunk(
    'socials/connectMetaPage',
    async (pageId: string) => connectPage(pageId),
);

export const disconnectMetaPage = createAsyncThunk(
    'socials/disconnectMetaPage',
    async (pageId: string) => disconnectPage(pageId),
);

const socialsSlice = createSlice({
    name: 'socials',
    initialState,
    reducers: {
        clearAvailablePages(state) {
            state.availablePages = [];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchConnectedPages.fulfilled, (state, action) => {
                state.pages = action.payload;
                state.loading = false;
            })
            .addCase(finishOAuth.fulfilled, (state, action) => {
                state.availablePages = action.payload;
                state.loading = false;
            })
            .addCase(connectMetaPage.fulfilled, (state, action) => {
                state.pages = state.pages
                    .filter((p) => p.page_id !== action.payload.page_id)
                    .concat(action.payload);
                state.availablePages = [];
                state.loading = false;
            })
            .addCase(disconnectMetaPage.fulfilled, (state, action) => {
                state.pages = state.pages.map((p) =>
                    p.page_id === action.payload.page_id ? action.payload : p,
                );
                state.loading = false;
            });
        builder
            .addMatcher(
                (action) => action.type.startsWith('socials/') && action.type.endsWith('/pending'),
                (state) => {
                    state.loading = true;
                    state.error = null;
                },
            )
            .addMatcher(
                (action) => action.type.startsWith('socials/') && action.type.endsWith('/rejected'),
                (state, action) => {
                    state.loading = false;
                    state.error = (action as { error?: { message?: string } }).error?.message ?? 'Something went wrong';
                },
            );
    },
});

export const { clearAvailablePages } = socialsSlice.actions;
export default socialsSlice.reducer;
