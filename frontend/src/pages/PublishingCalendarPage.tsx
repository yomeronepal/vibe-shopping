import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { aiApi } from '../api/ai';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import BoostAdvisor from '../components/vendor/BoostAdvisor';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { vendorApi, type Product } from '../api/vendor';
import { mediaUrl } from '../api/media';
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

function addDays(d: Date, amount: number): Date {
    const result = new Date(d);
    result.setDate(result.getDate() + amount);
    return result;
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

function suggestSchedule(cellDate: Date): { date: string; time: string } {
    const now = new Date();
    if (toDateKey(cellDate) !== toDateKey(now)) {
        return { date: toDateKey(cellDate), time: '12:00' };
    }
    const rounded = new Date(now);
    rounded.setSeconds(0, 0);
    rounded.setMinutes(0);
    rounded.setHours(rounded.getHours() + 1);
    return { date: toDateKey(rounded), time: toTimeValue(rounded) };
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
    return mediaUrl(path);
}

export default function PublishingCalendarPage() {
    const { config: themeConfig } = useShopTheme();

    const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [weekCursor, setWeekCursor] = useState(() => new Date());
    const [posts, setPosts] = useState<ScheduledPost[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [modal, setModal] = useState<ModalState>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [connectedPage, setConnectedPage] = useState<ConnectedPage | null>(null);

    const [caption, setCaption] = useState('');
    const [captionLoading, setCaptionLoading] = useState(false);
    const [aiType, setAiType] = useState<'caption' | 'promo' | 'announcement' | 'ad'>('caption');
    const [aiTone, setAiTone] = useState('');
    const [aiLanguage, setAiLanguage] = useState('');
    const [postFormat, setPostFormat] = useState<'feed' | 'story'>('feed');
    const [platforms, setPlatforms] = useState<{ facebook: boolean; instagram: boolean }>({ facebook: false, instagram: false });
    const [imageTab, setImageTab] = useState<'product' | 'upload'>('product');
    const [productId, setProductId] = useState<number | null>(null);
    const [productSearch, setProductSearch] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const grid = useMemo(() => {
        if (viewMode === 'week') {
            const start = addDays(weekCursor, -weekCursor.getDay());
            return Array.from({ length: 7 }, (_, index) => addDays(start, index));
        }
        return monthGrid(monthCursor);
    }, [monthCursor, weekCursor, viewMode]);
    const monthLabel = viewMode === 'week'
        ? `${grid[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${grid[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const STATUS_COLORS: Record<ScheduledPost['status'], { bg: string; fg: string }> = {
        draft: { bg: `${themeConfig.border}60`, fg: themeConfig.textSecondary },
        scheduled: { bg: `${themeConfig.primary}20`, fg: themeConfig.primary },
        pending: { bg: '#fef3c7', fg: '#b45309' },
        posted: { bg: '#dcfce7', fg: '#15803d' },
        failed: { bg: '#fee2e2', fg: '#b91c1c' },
    };

    useEffect(() => {
        const handle = window.setTimeout(() => {
            vendorApi.getProducts({ q: productSearch.trim(), page: 1 })
                .then((data: any) => setProducts(Array.isArray(data) ? data : data?.results ?? []))
                .catch(() => {});
        }, productSearch ? 300 : 0);
        return () => window.clearTimeout(handle);
    }, [productSearch]);

    useEffect(() => {
        listConnectedPages()
            .then((pages) => setConnectedPage(pages.find((page) => page.status === 'connected') ?? null))
            .catch(() => setConnectedPage(null));
    }, []);

    const refetchPosts = useCallback(() => {
        setLoadingPosts(true);
        listPosts(toDateKey(addDays(grid[0], -1)), toDateKey(addDays(grid[grid.length - 1], 1)))
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

    const goToPrevMonth = () => {
        if (viewMode === 'week') setWeekCursor((prev) => addDays(prev, -7));
        else setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };
    const goToNextMonth = () => {
        if (viewMode === 'week') setWeekCursor((prev) => addDays(prev, 7));
        else setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };
    const goToToday = () => {
        setMonthCursor(startOfMonth(new Date()));
        setWeekCursor(new Date());
    };

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
        const suggestion = suggestSchedule(date);
        setScheduleDate(suggestion.date);
        setScheduleTime(suggestion.time);
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

    const generateCaption = async () => {
        const useProduct = imageTab === 'product' && productId;
        if (!useProduct && caption.trim().length < 5) {
            toast.error('Pick a product or write a few words first');
            return;
        }
        setCaptionLoading(true);
        try {
            const generated = await aiApi.generateCaption({
                ...(useProduct ? { product_id: productId as number } : { context: caption.trim() }),
                content_type: aiType,
                tone: aiTone || undefined,
                language: aiLanguage || undefined,
            });
            setCaption(generated.slice(0, 280));
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not write a caption. Try again.');
        } finally {
            setCaptionLoading(false);
        }
    };

    const closeModal = () => setModal(null);

    const uploadPreviewUrl = useMemo(() => (uploadFile ? URL.createObjectURL(uploadFile) : null), [uploadFile]);

    const filteredProducts = products;

    const buildCreateFormData = (): FormData => {
        const form = new FormData();
        form.append('caption', postFormat === 'story' ? '' : caption);
        form.append('post_format', postFormat);
        if (platforms.facebook) form.append('platforms', 'facebook');
        if (platforms.instagram) form.append('platforms', 'instagram');
        if (imageTab === 'product' && productId) {
            form.append('product_id', String(productId));
        } else if (imageTab === 'upload' && uploadFile) {
            form.append('image', uploadFile);
        }
        return form;
    };

    const buildUpdateFormData = (): FormData => {
        const form = new FormData();
        form.append('caption', caption);
        if (uploadFile) {
            form.append('image', uploadFile);
        }
        return form;
    };

    const hasPlatformSelected = platforms.facebook || platforms.instagram;
    const isStoryFormat = (modal?.mode === 'edit' ? (modal.post.post_format ?? 'feed') : postFormat) === 'story';

    const handleSchedule = async () => {
        if (!hasPlatformSelected) {
            setFormError('Select at least one platform.');
            return;
        }
        if (!scheduleDate || !scheduleTime) {
            setFormError('Pick a date and time to schedule.');
            return;
        }
        const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
        if (scheduledAt.getTime() <= Date.now()) {
            setFormError('Pick a time in the future');
            return;
        }
        setFormError('');
        setSaving(true);
        try {
            if (modal?.mode === 'edit') {
                const form = buildUpdateFormData();
                form.append('scheduled_for', scheduledAt.toISOString());
                await updatePost(modal.post.id, form);
                toast.success('Post updated');
            } else {
                const form = buildCreateFormData();
                form.append('scheduled_for', scheduledAt.toISOString());
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
                await updatePost(modal.post.id, buildUpdateFormData());
                toast.success('Draft updated');
            } else {
                const form = buildCreateFormData();
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
            const result = await createPost(buildCreateFormData());
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
        setConfirmingDelete(false);
        setSaving(true);
        try {
            await deletePost(modal.post.id);
            toast.success('Post deleted');
            closeModal();
            refetchPosts();
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Could not delete the post.'));
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
        } catch (error) {
            toast.error(extractErrorMessage(error, 'Could not retry the post.'));
        } finally {
            setSaving(false);
        }
    };

    const isEdit = modal?.mode === 'edit';
    const editPost = isEdit ? modal.post : null;
    const isPosted = editPost?.status === 'posted';
    const isPending = editPost?.status === 'pending';
    const isFailed = editPost?.status === 'failed';
    const isReadOnly = isPosted || isPending;
    const canMutateSchedule = !isEdit || editPost?.status === 'draft' || editPost?.status === 'scheduled';
    const canSaveDraft = !isEdit || editPost?.status === 'draft';
    const canDelete = isEdit && (editPost?.status === 'draft' || editPost?.status === 'scheduled' || editPost?.status === 'failed');
    const postNowNeedsImage = isEdit && !editPost?.product && !uploadFile;

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

                    <div className="mt-6">
                        <BoostAdvisor />
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
                        <div className="flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: `${themeConfig.border}40` }}>
                            {(['month', 'week'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setViewMode(mode)}
                                    className="px-3 py-1 rounded-full text-xs font-bold capitalize transition-colors"
                                    style={viewMode === mode
                                        ? { backgroundColor: themeConfig.surface, color: themeConfig.primary }
                                        : { color: themeConfig.textSecondary }}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
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
                            const inMonth = viewMode === 'week'
                                || (date.getFullYear() === monthCursor.getFullYear() && date.getMonth() === monthCursor.getMonth());
                            const isToday = key === toDateKey(new Date());
                            return (
                                <div
                                    key={key}
                                    onClick={() => openCreateModal(date)}
                                    className={`${viewMode === 'week' ? 'min-h-[340px]' : 'min-h-[110px]'} p-2 flex flex-col gap-1 cursor-pointer transition-colors`}
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
                                        {dayPosts.slice(0, viewMode === 'week' ? 12 : 3).map((post) => {
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
                                                    {post.platform === 'facebook' ? 'FB' : 'IG'}{post.post_format === 'story' ? ' ◉' : ''} {post.post_format === 'story' && !post.caption ? 'Story' : post.caption.slice(0, 18)}
                                                </span>
                                            );
                                        })}
                                        {dayPosts.length > (viewMode === 'week' ? 12 : 3) && (
                                            <span className="text-[10px] font-semibold" style={{ color: themeConfig.textSecondary }}>
                                                +{dayPosts.length - (viewMode === 'week' ? 12 : 3)} more
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
                                {!isReadOnly && !isStoryFormat && (
                                    <div className="flex items-center justify-end gap-1.5 mb-1 flex-wrap">
                                        <select
                                            value={aiType}
                                            onChange={(e) => setAiType(e.target.value as typeof aiType)}
                                            className="text-xs font-semibold rounded-lg px-1.5 py-1 focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                        >
                                            <option value="caption">Caption</option>
                                            <option value="promo">Promo</option>
                                            <option value="announcement">Announcement</option>
                                            <option value="ad">Ad copy</option>
                                        </select>
                                        <select
                                            value={aiTone}
                                            onChange={(e) => setAiTone(e.target.value)}
                                            className="text-xs font-semibold rounded-lg px-1.5 py-1 focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                        >
                                            <option value="">Friendly</option>
                                            <option value="professional">Professional</option>
                                            <option value="casual">Casual</option>
                                            <option value="promotional">Promotional</option>
                                        </select>
                                        <select
                                            value={aiLanguage}
                                            onChange={(e) => setAiLanguage(e.target.value)}
                                            className="text-xs font-semibold rounded-lg px-1.5 py-1 focus:outline-none"
                                            style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                        >
                                            <option value="">Mixed</option>
                                            <option value="english">English</option>
                                            <option value="nepali">Nepali</option>
                                        </select>
                                        <button
                                            onClick={generateCaption}
                                            disabled={captionLoading}
                                            className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition-all disabled:opacity-40"
                                            style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                                        >
                                            <span className={`material-symbols-outlined text-[14px] ${captionLoading ? 'animate-spin' : ''}`}>
                                                {captionLoading ? 'progress_activity' : 'auto_awesome'}
                                            </span>
                                            {captionLoading ? 'Writing…' : 'AI caption'}
                                        </button>
                                    </div>
                                )}
                                <textarea
                                    value={isStoryFormat ? '' : caption}
                                    onChange={(event) => setCaption(event.target.value.slice(0, 280))}
                                    readOnly={isReadOnly || isStoryFormat}
                                    placeholder={isStoryFormat ? 'Stories don’t include captions' : 'Write a caption…'}
                                    className="w-full min-h-[100px] rounded-xl p-3 text-sm resize-none focus:outline-none"
                                    style={{
                                        backgroundColor: `${themeConfig.background}`,
                                        border: `1px solid ${themeConfig.border}`,
                                        color: themeConfig.text,
                                        opacity: isStoryFormat ? 0.6 : 1,
                                    }}
                                />
                                <div className="text-right text-xs mt-1" style={{ color: themeConfig.textSecondary }}>
                                    {isStoryFormat ? 'Stories don’t include captions' : `${caption.length}/280`}
                                </div>
                            </div>

                            <div className="flex gap-2 items-center">
                                {(['feed', 'story'] as const).map((format) => {
                                    const active = (isEdit ? (editPost?.post_format ?? 'feed') : postFormat) === format;
                                    return (
                                        <button
                                            key={format}
                                            disabled={isEdit}
                                            onClick={() => setPostFormat(format)}
                                            className="px-3 py-1.5 rounded-full text-sm font-semibold disabled:cursor-not-allowed"
                                            style={active
                                                ? { backgroundColor: themeConfig.accent, color: '#ffffff' }
                                                : { backgroundColor: `${themeConfig.border}40`, color: themeConfig.textSecondary }}
                                        >
                                            {format === 'feed' ? 'Feed' : 'Story'}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-2">
                                {isEdit ? (
                                    <span
                                        className="px-3 py-1.5 rounded-full text-sm font-semibold"
                                        style={{ backgroundColor: themeConfig.primary, color: '#ffffff' }}
                                    >
                                        {editPost?.platform === 'facebook' ? 'Facebook' : 'Instagram'}
                                    </span>
                                ) : (
                                    (['facebook', 'instagram'] as PlatformKey[]).map((key) => {
                                        const enabled = key === 'facebook' ? Boolean(connectedPage) : Boolean(connectedPage?.instagram_account_id);
                                        const active = platforms[key];
                                        return (
                                            <button
                                                key={key}
                                                disabled={!enabled}
                                                onClick={() => setPlatforms((prev) => ({ ...prev, [key]: !prev[key] }))}
                                                className="px-3 py-1.5 rounded-full text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                                style={active
                                                    ? { backgroundColor: themeConfig.primary, color: '#ffffff' }
                                                    : { backgroundColor: `${themeConfig.border}40`, color: themeConfig.textSecondary }}
                                            >
                                                {key === 'facebook' ? 'Facebook' : 'Instagram'}
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            <div>
                                {isEdit ? (
                                    <div className="flex items-center gap-3">
                                        {(uploadPreviewUrl || editPost?.image_url) ? (
                                            <img
                                                src={uploadPreviewUrl ?? `${API_ORIGIN}${editPost?.image_url}`}
                                                alt="Current"
                                                className="h-20 w-20 rounded-lg object-cover"
                                            />
                                        ) : (
                                            <div className="h-20 w-20 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${themeConfig.border}40` }}>
                                                <span className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>image</span>
                                            </div>
                                        )}
                                        {!isReadOnly && (
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0] ?? null;
                                                    setUploadFile(file);
                                                    if (file) setImageTab('upload');
                                                }}
                                                className="text-sm"
                                                style={{ color: themeConfig.text }}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-2 mb-2">
                                            <button
                                                onClick={() => setImageTab('product')}
                                                className="px-3 py-1.5 rounded-full text-sm font-semibold"
                                                style={imageTab === 'product'
                                                    ? { backgroundColor: themeConfig.primary, color: '#ffffff' }
                                                    : { backgroundColor: `${themeConfig.border}40`, color: themeConfig.textSecondary }}
                                            >
                                                Product
                                            </button>
                                            <button
                                                onClick={() => setImageTab('upload')}
                                                className="px-3 py-1.5 rounded-full text-sm font-semibold"
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
                                                    placeholder="Search by name or SKU…"
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
                                                                onClick={() => setProductId(product.id)}
                                                                className="rounded-lg overflow-hidden aspect-square"
                                                                style={{ boxShadow: selected ? `0 0 0 2px ${themeConfig.primary}` : `0 0 0 1px ${themeConfig.border}` }}
                                                                title={`${product.name}${product.product_code ? ` (${product.product_code})` : ''}`}
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
                                                    onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                                                    className="text-sm"
                                                    style={{ color: themeConfig.text }}
                                                />
                                                {uploadPreviewUrl && (
                                                    <img
                                                        src={uploadPreviewUrl}
                                                        alt="Preview"
                                                        className="mt-2 h-24 rounded-lg object-cover"
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <input
                                    type="date"
                                    value={scheduleDate}
                                    onChange={(event) => setScheduleDate(event.target.value)}
                                    disabled={isReadOnly}
                                    className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                />
                                <input
                                    type="time"
                                    value={scheduleTime}
                                    onChange={(event) => setScheduleTime(event.target.value)}
                                    disabled={isReadOnly}
                                    className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    style={{ backgroundColor: `${themeConfig.background}`, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                />
                            </div>

                            {(() => {
                                if (isStoryFormat && !caption) return null;
                                const selectedProduct = imageTab === 'product' && productId
                                    ? products.find((p) => p.id === productId) ?? null
                                    : null;
                                const previewImage = uploadPreviewUrl
                                    ?? (selectedProduct ? productThumbnail(selectedProduct) : null)
                                    ?? (isEdit && editPost?.image_url ? mediaUrl(editPost.image_url) : null);
                                if (!previewImage && !caption) return null;
                                return (
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: themeConfig.textSecondary }}>Preview</p>
                                        <div className="rounded-xl border overflow-hidden" style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.background }}>
                                            <div className="flex items-center gap-2 px-3 py-2">
                                                <div className="size-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: '#1877F2' }}>
                                                    {(connectedPage?.name ?? 'P').charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold leading-tight" style={{ color: themeConfig.text }}>{connectedPage?.name ?? 'Your Page'}</p>
                                                    <p className="text-[10px]" style={{ color: themeConfig.textSecondary }}>
                                                        {[platforms.facebook ? 'Facebook' : '', platforms.instagram ? 'Instagram' : ''].filter(Boolean).join(' · ') || 'Not published yet'}
                                                        {postFormat === 'story' ? ' · Story' : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            {!isStoryFormat && caption && (
                                                <p className="px-3 pb-2 text-sm whitespace-pre-wrap" style={{ color: themeConfig.text }}>{caption}</p>
                                            )}
                                            {previewImage && (
                                                <img src={previewImage} alt="Post preview" className="w-full max-h-56 object-cover" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

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
                            {isPending && (
                                <p className="text-sm font-medium" style={{ color: themeConfig.textSecondary }}>
                                    Publishing…
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-2">
                                {canMutateSchedule && (
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
                                            disabled={saving || postNowNeedsImage}
                                            className="px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50"
                                            style={{ backgroundColor: `${themeConfig.primary}15`, color: themeConfig.primary }}
                                        >
                                            Post now
                                        </button>
                                        {postNowNeedsImage && (
                                            <span className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>
                                                Choose an image to post now
                                            </span>
                                        )}
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
                                {canDelete && (
                                    <button
                                        onClick={() => setConfirmingDelete(true)}
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
            <ConfirmDialog
                open={confirmingDelete}
                title="Delete this post?"
                message="The post will be removed from your calendar. This cannot be undone."
                confirmLabel="Delete post"
                danger
                onConfirm={handleDelete}
                onCancel={() => setConfirmingDelete(false)}
            />
        </VendorShell>
    );
}
