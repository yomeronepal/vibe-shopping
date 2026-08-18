import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { vendorApi, type Product } from '../api/vendor';
import {
    createPost,
    deletePost,
    listConnectedPages,
    listPosts,
    retryPost,
    updatePost,
    type ConnectedPage,
    type PublishResult,
    type ScheduledPost,
} from '../api/socials';

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ModalState =
    | null
    | { mode: 'create'; date: Date }
    | { mode: 'edit'; post: ScheduledPost };

type PlatformKey = 'facebook' | 'instagram';

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthGrid(cursor: Date): Date[] {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const start = new Date(year, month, 1 - firstOfMonth.getDay());
    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return date;
    });
}

function toDateKey(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function toTimeValue(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function extractErrorMessage(error: unknown, fallback: string): string {
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    if (data && typeof data === 'object') {
        const record = data as Record<string, unknown>;
        if (typeof record.error === 'string') return record.error;
        if (typeof record.detail === 'string') return record.detail;
    }
    return fallback;
}

function productThumbnail(product: Product): string | null {
    const path = product.processed_image || product.image;
    return path ? `${API_ORIGIN}${path}` : null;
}

export default function PublishingCalendarPage() {
    const { config: themeConfig } = useShopTheme();

    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
    const [posts, setPosts] = useState<ScheduledPost[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [modal, setModal] = useState<ModalState>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [connectedPage, setConnectedPage] = useState<ConnectedPage | null>(null);

    const [caption, setCaption] = useState('');
    const [platforms, setPlatforms] = useState<{ facebook: boolean; instagram: boolean }>({ facebook: false, instagram: false });
    const [imageTab, setImageTab] = useState<'product' | 'upload'>('product');
    const [productId, setProductId] = useState<number | null>(null);
    const [productSearch, setProductSearch] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const grid = useMemo(() => monthGrid(monthCursor), [monthCursor]);
    const monthLabel = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const STATUS_COLORS: Record<ScheduledPost['status'], { bg: string; fg: string }> = {
        draft: { bg: `${themeConfig.border}60`, fg: themeConfig.textSecondary },
        scheduled: { bg: `${themeConfig.primary}20`, fg: themeConfig.primary },
        pending: { bg: '#fef3c7', fg: '#b45309' },
        posted: { bg: '#dcfce7', fg: '#15803d' },
        failed: { bg: '#fee2e2', fg: '#b91c1c' },
    };

    useEffect(() => {
        vendorApi.getProducts()
            .then((data) => setProducts(Array.isArray(data) ? data : data?.results ?? []))
            .catch(() => toast.error('Could not load products. Refresh to retry.'));
        listConnectedPages()
            .then((pages) => setConnectedPage(pages.find((page) => page.status === 'connected') ?? null))
            .catch(() => setConnectedPage(null));
    }, []);

    const refetchPosts = useCallback(() => {
        setLoadingPosts(true);
        listPosts(toDateKey(grid[0]), toDateKey(grid[grid.length - 1]))
            .then(setPosts)
            .catch(() => toast.error('Could not load posts. Refresh to retry.'))
            .finally(() => setLoadingPosts(false));
    }, [grid]);

    useEffect(() => {
        refetchPosts();
    }, [refetchPosts]);

    const postsByDate = useMemo(() => {
        const map = new Map<string, ScheduledPost[]>();
        posts.forEach((post) => {
            const key = toDateKey(new Date(post.scheduled_for ?? post.created_at));
            const list = map.get(key) ?? [];
            list.push(post);
            map.set(key, list);
        });
        return map;
    }, [posts]);

    const goToPrevMonth = () => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    const goToNextMonth = () => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    const goToToday = () => setMonthCursor(startOfMonth(new Date()));

    const resetComposer = () => {
        setCaption('');
        setPlatforms({ facebook: false, instagram: false });
        setImageTab('product');
        setProductId(null);
        setProductSearch('');
        setUploadFile(null);
        setScheduleDate('');
        setScheduleTime('');
        setFormError('');
        setSaving(false);
    };

    const openCreateModal = (date: Date) => {
        resetComposer();
        setPlatforms({
            facebook: Boolean(connectedPage),
            instagram: Boolean(connectedPage?.instagram_account_id),
        });
        setScheduleDate(toDateKey(date));
        setScheduleTime('12:00');
        setModal({ mode: 'create', date });
    };

    const openEditModal = (post: ScheduledPost) => {
        resetComposer();
        setCaption(post.caption);
        setPlatforms({
            facebook: post.platform === 'facebook',
            instagram: post.platform === 'instagram',
        });
        if (post.product) {
            setImageTab('product');
            setProductId(post.product.id);
        } else {
            setImageTab('upload');
        }
        const anchor = new Date(post.scheduled_for ?? post.created_at);
        setScheduleDate(toDateKey(anchor));
        setScheduleTime(toTimeValue(anchor));
        setModal({ mode: 'edit', post });
    };

    const closeModal = () => setModal(null);

    const uploadPreviewUrl = useMemo(() => (uploadFile ? URL.createObjectURL(uploadFile) : null), [uploadFile]);

    const filteredProducts = useMemo(
        () => products.filter((product) => product.name.toLowerCase().includes(productSearch.toLowerCase())),
        [products, productSearch],
    );

    const buildFormData = (): FormData => {
        const form = new FormData();
        form.append('caption', caption);
        if (platforms.facebook) form.append('platforms', 'facebook');
        if (platforms.instagram) form.append('platforms', 'instagram');
        if (imageTab === 'product' && productId) {
            form.append('product_id', String(productId));
        } else if (imageTab === 'upload' && uploadFile) {
            form.append('image', uploadFile);
        }
        return form;
    };

    const hasPlatformSelected = platforms.facebook || platforms.instagram;

    const handleSchedule = async () => {
        if (!hasPlatformSelected) {
            setFormError('Select at least one platform.');
            return;
        }
        if (!scheduleDate || !scheduleTime) {
            setFormError('Pick a date and time to schedule.');
            return;
        }
        setFormError('');
        setSaving(true);
        try {
            const form = buildFormData();
            form.append('scheduled_for', new Date(`${scheduleDate}T${scheduleTime}`).toISOString());
            if (modal?.mode === 'edit') {
                await updatePost(modal.post.id, form);
                toast.success('Post updated');
            } else {
                await createPost(form);
                toast.success('Post scheduled');
            }
            closeModal();
            refetchPosts();
        } catch (error) {
            setFormError(extractErrorMessage(error, 'Could not schedule the post.'));
        } finally {
            setSaving(false);
        }
    };

    const handleSaveDraft = async () => {
        setFormError('');
        setSaving(true);
        try {
            if (modal?.mode === 'edit') {
                await updatePost(modal.post.id, buildFormData());
                toast.success('Draft updated');
            } else {
                const form = buildFormData();
                form.append('save_as', 'draft');
                await createPost(form);
                toast.success('Draft saved');
            }
            closeModal();
            refetchPosts();
        } catch (error) {
            setFormError(extractErrorMessage(error, 'Could not save the draft.'));
        } finally {
            setSaving(false);
        }
    };

    const handlePostNow = async () => {
        if (!hasPlatformSelected) {
            setFormError('Select at least one platform.');
            return;
        }
        setFormError('');
        setSaving(true);
        try {
            const result = await createPost(buildFormData());
            if (!Array.isArray(result) && 'results' in result) {
                result.results.forEach((item: PublishResult) => {
                    if (item.status === 'posted') {
                        toast.success(`Posted to ${item.platform}`);
                    } else {
                        toast.error(`${item.platform}: ${item.error}`);
                    }
                });
            } else {
                toast.success('Post published');
            }
            if (modal?.mode === 'edit') {
                try {
                    await deletePost(modal.post.id);
                } catch {
                    toast.error('Posted, but the original draft could not be removed');
                }
            }
            closeModal();
            refetchPosts();
        } catch (error) {
            setFormError(extractErrorMessage(error, 'Could not publish the post.'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (modal?.mode !== 'edit') return;
        if (!window.confirm('Delete this post?')) return;
        setSaving(true);
        try {
            await deletePost(modal.post.id);
            toast.success('Post deleted');
            closeModal();
            refetchPosts();
        } catch {
            toast.error('Could not delete the post.');
        } finally {
            setSaving(false);
        }
    };

    const handleRetry = async () => {
        if (modal?.mode !== 'edit') return;
        setSaving(true);
        try {
            await retryPost(modal.post.id);
            toast.success('Retrying post');
            closeModal();
            refetchPosts();
        } catch {
            toast.error('Could not retry the post.');
        } finally {
            setSaving(false);
        }
    };

    const isEdit = modal?.mode === 'edit';
    const editPost = isEdit ? modal.post : null;
    const isPosted = editPost?.status === 'posted';
    const isFailed = editPost?.status === 'failed';
    const canSaveDraft = !isEdit || editPost?.status === 'draft';

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                Publishing
                            </h1>
                            <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                                Plan, schedule, and publish posts to your connected pages.
                            </p>
                        </div>
                        <button
                            onClick={() => openCreateModal(new Date())}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold shadow-sm transition-transform hover:-translate-y-0.5"
                            style={{ backgroundColor: themeConfig.buttonBg, color: themeConfig.buttonText }}
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            New post
                        </button>
                    </div>

                    <div
                        className="mt-6 flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 backdrop-blur-xl shadow-sm"
                        style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                    >
                        <div className="flex items-center gap-2">
                            <button
                                onClick={goToPrevMonth}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                                style={{ backgroundColor: `${themeConfig.border}40`, color: themeConfig.text }}
                            >
                                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                            </button>
                            <button
                                onClick={goToToday}
                                className="px-3 py-1.5 rounded-full text-sm font-semibold"
                                style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                            >
                                Today
                            </button>
                            <button
                                onClick={goToNextMonth}
                                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                                style={{ backgroundColor: `${themeConfig.border}40`, color: themeConfig.text }}
                            >
                                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                            </button>
                        </div>
                        <h2 className="text-lg font-bold" style={{ color: themeConfig.text }}>
                            {monthLabel}
                            {loadingPosts && (
                                <span className="ml-2 text-xs font-medium" style={{ color: themeConfig.textSecondary }}>
                                    Loading…
                                </span>
                            )}
                        </h2>
                        <div className="w-[132px]" />
                    </div>

                    <div
                        className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-2xl border"
                        style={{ borderColor: `${themeConfig.border}60`, backgroundColor: `${themeConfig.border}60` }}
                    >
                        {WEEKDAYS.map((day) => (
                            <div
                                key={day}
                                className="py-2 text-center text-xs font-bold uppercase tracking-wide"
                                style={{ backgroundColor: themeConfig.surface, color: themeConfig.textSecondary }}
                            >
                                {day}
                            </div>
                        ))}
                        {grid.map((date) => {
                            const key = toDateKey(date);
                            const dayPosts = postsByDate.get(key) ?? [];
                            const inMonth = date.getFullYear() === monthCursor.getFullYear() && date.getMonth() === monthCursor.getMonth();
                            const isToday = key === toDateKey(new Date());
                            return (
                                <div
                                    key={key}
                                    onClick={() => openCreateModal(date)}
                                    className="min-h-[110px] p-2 flex flex-col gap-1 cursor-pointer transition-colors"
                                    style={{
                                        backgroundColor: themeConfig.surface,
                                        opacity: inMonth ? 1 : 0.45,
                                        boxShadow: isToday ? `inset 0 0 0 2px ${themeConfig.primary}` : 'none',
                                    }}
                                >
                                    <span className="text-xs font-bold" style={{ color: themeConfig.text }}>
                                        {date.getDate()}
                                    </span>
                                    <div className="flex flex-col gap-1">
                                        {dayPosts.slice(0, 3).map((post) => {
                                            const palette = STATUS_COLORS[post.status];
                                            return (
                                                <span
                                                    key={post.id}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openEditModal(post);
                                                    }}
                                                    className="truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold flex items-center gap-1"
                                                    style={{ backgroundColor: palette.bg, color: palette.fg }}
                                                >
                                                    {post.status === 'failed' && (
                                                        <span className="material-symbols-outlined text-[12px]">error</span>
                                                    )}
                                                    {post.platform === 'facebook' ? 'FB' : 'IG'} {post.caption.slice(0, 18)}
                                                </span>
                                            );
                                        })}
                                        {dayPosts.length > 3 && (
                                            <span className="text-[10px] font-semibold" style={{ color: themeConfig.textSecondary }}>
                                                +{dayPosts.length - 3} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {modal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={closeModal}
                >
                    <div
                        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-6"
                        style={{ backgroundColor: themeConfig.surface }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold" style={{ color: themeConfig.text }}>
                                {isEdit ? 'Edit post' : 'New post'}
                            </h3>
                            <button onClick={closeModal} className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>
                                close
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <textarea
                                    value={caption}
                                    onChange={(event) => setCaption(event.target.value.slice(0, 280))}
                                    readOnly={isPosted}
                                    placeholder="Write a caption…"
                                    className="w-full min-h-[100px] rounded-xl p-3 text-sm resize-none focus:outline-none"
                                    style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                />
                                <div className="text-right text-xs mt-1" style={{ color: themeConfig.textSecondary }}>
                                    {caption.length}/280
                                </div>
                            </div>

                            <div className="flex gap-2">
                                {(['facebook', 'instagram'] as PlatformKey[]).map((key) => {
                                    const enabled = key === 'facebook' ? Boolean(connectedPage) : Boolean(connectedPage?.instagram_account_id);
                                    const active = platforms[key];
                                    return (
                                        <button
                                            key={key}
                                            disabled={!enabled || isPosted}
                                            onClick={() => setPlatforms((prev) => ({ ...prev, [key]: !prev[key] }))}
                                            className="px-3 py-1.5 rounded-full text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                            style={active
                                                ? { backgroundColor: themeConfig.primary, color: '#ffffff' }
                                                : { backgroundColor: `${themeConfig.border}40`, color: themeConfig.textSecondary }}
                                        >
                                            {key === 'facebook' ? 'Facebook' : 'Instagram'}
                                        </button>
                                    );
                                })}
                            </div>

                            <div>
                                <div className="flex gap-2 mb-2">
                                    <button
                                        onClick={() => setImageTab('product')}
                                        disabled={isPosted}
                                        className="px-3 py-1.5 rounded-full text-sm font-semibold disabled:opacity-40"
                                        style={imageTab === 'product'
                                            ? { backgroundColor: themeConfig.primary, color: '#ffffff' }
                                            : { backgroundColor: `${themeConfig.border}40`, color: themeConfig.textSecondary }}
                                    >
                                        Product
                                    </button>
                                    <button
                                        onClick={() => setImageTab('upload')}
                                        disabled={isPosted}
                                        className="px-3 py-1.5 rounded-full text-sm font-semibold disabled:opacity-40"
                                        style={imageTab === 'upload'
                                            ? { backgroundColor: themeConfig.primary, color: '#ffffff' }
                                            : { backgroundColor: `${themeConfig.border}40`, color: themeConfig.textSecondary }}
                                    >
                                        Upload
                                    </button>
                                </div>

                                {imageTab === 'product' ? (
                                    <div>
                                        <input
                                            value={productSearch}
                                            onChange={(event) => setProductSearch(event.target.value)}
                                            placeholder="Search products…"
                                            disabled={isPosted}
                                            className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                        />
                                        <div className="mt-2 grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                            {filteredProducts.map((product) => {
                                                const thumbnail = productThumbnail(product);
                                                const selected = productId === product.id;
                                                return (
                                                    <button
                                                        key={product.id}
                                                        disabled={isPosted}
                                                        onClick={() => setProductId(product.id)}
                                                        className="rounded-lg overflow-hidden aspect-square disabled:opacity-40"
                                                        style={{ boxShadow: selected ? `0 0 0 2px ${themeConfig.primary}` : `0 0 0 1px ${themeConfig.border}` }}
                                                        title={product.name}
                                                    >
                                                        {thumbnail ? (
                                                            <img src={thumbnail} alt={product.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${themeConfig.border}40` }}>
                                                                <span className="material-symbols-outlined text-[16px]" style={{ color: themeConfig.textSecondary }}>image</span>
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={isPosted}
                                            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                                            className="text-sm"
                                            style={{ color: themeConfig.text }}
                                        />
                                        {(uploadPreviewUrl || (editPost?.image_url && !uploadFile)) && (
                                            <img
                                                src={uploadPreviewUrl ?? `${API_ORIGIN}${editPost?.image_url}`}
                                                alt="Preview"
                                                className="mt-2 h-24 rounded-lg object-cover"
                                            />
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <input
                                    type="date"
                                    value={scheduleDate}
                                    onChange={(event) => setScheduleDate(event.target.value)}
                                    disabled={isPosted}
                                    className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                />
                                <input
                                    type="time"
                                    value={scheduleTime}
                                    onChange={(event) => setScheduleTime(event.target.value)}
                                    disabled={isPosted}
                                    className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                />
                            </div>

                            {formError && (
                                <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>{formError}</p>
                            )}
                            {isFailed && editPost?.error_message && (
                                <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>{editPost.error_message}</p>
                            )}
                            {isPosted && editPost?.post_url && (
                                <a
                                    href={editPost.post_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-semibold underline"
                                    style={{ color: themeConfig.primary }}
                                >
                                    View post
                                </a>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-2">
                                {!isPosted && (
                                    <>
                                        <button
                                            onClick={handleSchedule}
                                            disabled={saving}
                                            className="px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
                                            style={{ backgroundColor: themeConfig.buttonBg, color: themeConfig.buttonText }}
                                        >
                                            Schedule
                                        </button>
                                        {canSaveDraft && (
                                            <button
                                                onClick={handleSaveDraft}
                                                disabled={saving}
                                                className="px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
                                                style={{ backgroundColor: `${themeConfig.border}40`, color: themeConfig.text }}
                                            >
                                                Save draft
                                            </button>
                                        )}
                                        <button
                                            onClick={handlePostNow}
                                            disabled={saving}
                                            className="px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
                                            style={{ backgroundColor: `${themeConfig.primary}15`, color: themeConfig.primary }}
                                        >
                                            Post now
                                        </button>
                                    </>
                                )}
                                {isFailed && (
                                    <button
                                        onClick={handleRetry}
                                        disabled={saving}
                                        className="px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
                                        style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}
                                    >
                                        Retry
                                    </button>
                                )}
                                {isEdit && (
                                    <button
                                        onClick={handleDelete}
                                        disabled={saving}
                                        className="ml-auto px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
                                        style={{ color: '#b91c1c' }}
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </VendorShell>
    );
}
