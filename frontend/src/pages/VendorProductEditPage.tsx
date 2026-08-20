import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import TagEditor from '../components/vendor/TagEditor';
import { vendorApi, type AnalyticsPost } from '../api/vendor';
import { mediaUrl } from '../api/media';

export default function VendorProductEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { config: themeConfig } = useShopTheme();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState(0);
    const [stock, setStock] = useState(0);
    const [tags, setTags] = useState<string[]>([]);
    const [vibeTags, setVibeTags] = useState<string[]>([]);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [sku, setSku] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [posts, setPosts] = useState<AnalyticsPost[]>([]);
    const [syncSocial, setSyncSocial] = useState(true);
    const [itemType, setItemType] = useState<'physical' | 'service'>('physical');

    useEffect(() => {
        if (!id) return;
        vendorApi.getProductAnalytics(id)
            .then((data) => {
                setName(data.product.name);
                setDescription(data.product.description || '');
                setPrice(Number(data.product.price) || 0);
                setStock(data.product.stock || 0);
                setTags(data.product.tags ?? []);
                setVibeTags(data.product.vibe_tags ?? []);
                setCurrentImage(mediaUrl(data.product.processed_image || data.product.image));
                setSku(data.product.product_code || '');
                setItemType(data.product.item_type === 'service' ? 'service' : 'physical');
                setPosts(data.posts);
            })
            .catch(() => setNotFound(true))
            .finally(() => setLoading(false));
    }, [id]);

    const editableFacebookPosts = posts.filter(
        (post) => post.status === 'posted' && post.platform === 'facebook' && post.post_format !== 'story',
    );
    const instagramPosts = posts.filter((post) => post.status === 'posted' && post.platform === 'instagram');

    const pickImage = (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(file);
        });
    };

    const reportSyncOutcome = (results: { status: string }[]) => {
        const updated = results.filter((r) => r.status === 'updated').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        if (updated > 0) toast.success(`${updated} Facebook post(s) updated`);
        if (failed > 0) toast.error(`${failed} Facebook post(s) could not be updated`);
    };

    const handleSave = async () => {
        if (!id) return;
        if (!name.trim()) {
            toast.error('Product needs a name');
            return;
        }
        if (price <= 0) {
            toast.error('Price must be greater than zero');
            return;
        }
        setSaving(true);
        try {
            await vendorApi.updateProduct(Number(id), {
                name: name.trim(),
                description,
                price,
                stock,
                tags,
                vibe_tags: vibeTags,
                image: imageFile,
            });
            toast.success('Product updated');
            if (syncSocial && editableFacebookPosts.length > 0) {
                try {
                    const sync = await vendorApi.syncProductSocial(Number(id));
                    reportSyncOutcome(sync.results);
                } catch {
                    toast.error('Could not update Facebook posts');
                }
            }
            navigate(`/vendor/products/${id}`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to update product');
        } finally {
            setSaving(false);
        }
    };

    const fieldStyle = { backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-4xl px-4 md:px-6 py-8">
                    <Link to={`/vendor/products/${id}`} className="text-sm font-semibold" style={{ color: themeConfig.primary }}>
                        ← Back to product
                    </Link>

                    {loading && (
                        <p className="mt-8 text-sm" style={{ color: themeConfig.textSecondary }}>Loading product…</p>
                    )}
                    {notFound && !loading && (
                        <p className="mt-8 text-sm" style={{ color: themeConfig.textSecondary }}>
                            Product not found. It may have been deleted.
                        </p>
                    )}

                    {!loading && !notFound && (
                        <>
                            <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
                                <div>
                                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                        Edit product
                                    </h1>
                                    <p className="mt-1 text-sm font-medium" style={{ color: themeConfig.textSecondary }}>
                                        Changes go live in your store immediately.
                                    </p>
                                </div>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-7 py-3 rounded-2xl font-bold shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                                    style={{ backgroundColor: themeConfig.buttonBg, color: themeConfig.buttonText, boxShadow: `0 10px 30px -10px ${themeConfig.primary}60` }}
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        {saving ? 'hourglass_empty' : 'save'}
                                    </span>
                                    {saving ? 'Saving…' : 'Save changes'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
                                <div className="md:col-span-2 rounded-3xl shadow-lg p-5" style={{ backgroundColor: themeConfig.cardBg }}>
                                    <div
                                        className="aspect-square rounded-2xl overflow-hidden flex items-center justify-center"
                                        style={{ backgroundColor: `${themeConfig.border}50` }}
                                    >
                                        {imagePreview || currentImage ? (
                                            <img src={imagePreview ?? currentImage ?? ''} alt={name} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-5xl" style={{ color: themeConfig.textSecondary }}>image</span>
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => pickImage(e.target.files)}
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
                                        style={{ backgroundColor: `${themeConfig.primary}10`, color: themeConfig.primary, border: `2px dashed ${themeConfig.primary}40` }}
                                    >
                                        <span className="material-symbols-outlined text-base">photo_camera</span>
                                        {imageFile ? 'Choose a different photo' : 'Replace photo'}
                                    </button>
                                    <p className="mt-3 text-xs leading-relaxed" style={{ color: themeConfig.textSecondary }}>
                                        Replacing the photo updates your store only — photos on posts already published to Facebook and Instagram cannot be changed.
                                    </p>
                                    {sku && (
                                        <div className="mt-4 pt-4 border-t" style={{ borderColor: `${themeConfig.border}60` }}>
                                            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: themeConfig.textSecondary }}>SKU</p>
                                            <p className="text-sm font-mono font-semibold" style={{ color: themeConfig.text }}>{sku}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="md:col-span-3 flex flex-col gap-6">
                                    <div className="rounded-3xl shadow-lg p-6 flex flex-col gap-5" style={{ backgroundColor: themeConfig.cardBg }}>
                                        <div>
                                            <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>Product title</label>
                                            <input
                                                type="text"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full border-transparent rounded-xl text-lg font-semibold py-3.5 px-4 shadow-sm"
                                                style={fieldStyle}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>Description</label>
                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                className="w-full min-h-[120px] border-transparent rounded-xl text-base leading-relaxed p-4 shadow-sm resize-none"
                                                style={fieldStyle}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Price</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: themeConfig.textSecondary }}>Rs.</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={price || ''}
                                                        placeholder="0"
                                                        onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
                                                        className="w-full border-transparent rounded-xl text-base font-semibold py-3 pl-11 pr-4 shadow-sm"
                                                        style={fieldStyle}
                                                    />
                                                </div>
                                            </div>
                                            {itemType === 'physical' ? (
                                            <div>
                                                <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Stock (units)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={stock || ''}
                                                    placeholder="0"
                                                    onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                                                    className="w-full border-transparent rounded-xl text-base font-semibold py-3 px-4 shadow-sm"
                                                    style={fieldStyle}
                                                />
                                            </div>
                                            ) : (
                                            <div>
                                                <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Type</label>
                                                <div
                                                    className="w-full rounded-xl text-base font-semibold py-3 px-4 shadow-sm flex items-center gap-2"
                                                    style={fieldStyle}
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">design_services</span>
                                                    Service — always bookable
                                                </div>
                                            </div>
                                            )}
                                        </div>
                                        <TagEditor label="Search tags" tags={tags} placeholder="Add tag, press Enter" onChange={setTags} />
                                        <TagEditor label="Vibe tags" tags={vibeTags} placeholder="Add vibe, press Enter" onChange={setVibeTags} />
                                    </div>

                                    {(editableFacebookPosts.length > 0 || instagramPosts.length > 0) && (
                                        <div className="rounded-3xl shadow-lg p-6" style={{ backgroundColor: themeConfig.cardBg }}>
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="size-10 rounded-xl flex items-center justify-center shrink-0"
                                                    style={{ backgroundColor: `${themeConfig.accent}15`, color: themeConfig.accent }}
                                                >
                                                    <span className="material-symbols-outlined text-2xl">sync</span>
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg leading-tight" style={{ color: themeConfig.text }}>Social posts</h3>
                                                    <p className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>
                                                        This product has posts published on social media
                                                    </p>
                                                </div>
                                            </div>
                                            {editableFacebookPosts.length > 0 && (
                                                <label className="mt-5 flex items-start gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={syncSocial}
                                                        onChange={(e) => setSyncSocial(e.target.checked)}
                                                        className="mt-0.5 w-5 h-5 rounded-md cursor-pointer"
                                                        style={{ accentColor: themeConfig.primary }}
                                                    />
                                                    <span className="text-sm leading-relaxed" style={{ color: themeConfig.text }}>
                                                        Rewrite the caption of <span className="font-bold">{editableFacebookPosts.length} published Facebook post(s)</span> with the updated description
                                                    </span>
                                                </label>
                                            )}
                                            {instagramPosts.length > 0 && (
                                                <p
                                                    className="mt-4 flex items-start gap-2 text-xs leading-relaxed rounded-xl p-3"
                                                    style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.textSecondary }}
                                                >
                                                    <span className="material-symbols-outlined text-[16px] shrink-0">info</span>
                                                    {instagramPosts.length} Instagram post(s) will keep their original caption — Meta does not allow editing published Instagram posts.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
