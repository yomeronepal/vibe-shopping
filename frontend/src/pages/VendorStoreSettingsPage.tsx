import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import SettingsTabs from '../components/vendor/SettingsTabs';
import TagEditor from '../components/vendor/TagEditor';
import { getStoreProfile, updateStoreProfile } from '../api/vendor';
import { mediaUrl } from '../api/media';

export default function VendorStoreSettingsPage() {
    const { config: themeConfig } = useShopTheme();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [storeName, setStoreName] = useState('');
    const [subdomain, setSubdomain] = useState<string | null>(null);
    const [bio, setBio] = useState('');
    const [category, setCategory] = useState('');
    const [brandVibes, setBrandVibes] = useState<string[]>([]);
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [currentLogo, setCurrentLogo] = useState<string | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    useEffect(() => {
        getStoreProfile()
            .then((profile) => {
                setStoreName(profile.store_name);
                setSubdomain(profile.subdomain);
                setBio(profile.bio);
                setCategory(profile.category);
                setBrandVibes(profile.brand_vibes);
                setPhone(profile.phone);
                setEmail(profile.email);
                setAddress(profile.address);
                setCurrentLogo(mediaUrl(profile.logo));
            })
            .catch(() => toast.error('Could not load your store profile'))
            .finally(() => setLoading(false));
    }, []);

    const pickLogo = (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        setLogoFile(file);
        setLogoPreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(file);
        });
    };

    const handleSave = async () => {
        if (!storeName.trim()) {
            toast.error('Store name is required');
            return;
        }
        setSaving(true);
        try {
            const updated = await updateStoreProfile({
                store_name: storeName.trim(),
                bio,
                category,
                brand_vibes: brandVibes,
                phone,
                email,
                address,
                logo: logoFile,
            });
            setCurrentLogo(mediaUrl(updated.logo));
            setLogoFile(null);
            toast.success('Store profile saved');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not save your store profile');
        } finally {
            setSaving(false);
        }
    };

    const fieldStyle = { backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-4xl px-4 md:px-6 py-8">
                    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                Settings
                            </h1>
                            <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                                Your store identity, shown on your storefront and invoices.
                            </p>
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                            style={{ backgroundColor: themeConfig.primary, boxShadow: `0 10px 24px -8px ${themeConfig.primary}70` }}
                        >
                            <span className="material-symbols-outlined text-[20px]">{saving ? 'hourglass_empty' : 'save'}</span>
                            {saving ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>

                    <SettingsTabs />

                    {loading ? (
                        <p className="text-sm" style={{ color: themeConfig.textSecondary }}>Loading store profile…</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
                            <div className="md:col-span-2 rounded-3xl shadow-lg p-5" style={{ backgroundColor: themeConfig.cardBg }}>
                                <p className="text-sm font-bold mb-3" style={{ color: themeConfig.text }}>Store logo</p>
                                <div
                                    className="aspect-square rounded-2xl overflow-hidden flex items-center justify-center"
                                    style={{ backgroundColor: `${themeConfig.border}50` }}
                                >
                                    {logoPreview || currentLogo ? (
                                        <img src={logoPreview ?? currentLogo ?? ''} alt={storeName} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="material-symbols-outlined text-5xl" style={{ color: themeConfig.textSecondary }}>storefront</span>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => pickLogo(e.target.files)}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
                                    style={{ backgroundColor: `${themeConfig.primary}10`, color: themeConfig.primary, border: `2px dashed ${themeConfig.primary}40` }}
                                >
                                    <span className="material-symbols-outlined text-base">photo_camera</span>
                                    {logoFile ? 'Choose a different logo' : 'Replace logo'}
                                </button>
                                {subdomain && (
                                    <div className="mt-5 pt-4 border-t" style={{ borderColor: `${themeConfig.border}60` }}>
                                        <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: themeConfig.textSecondary }}>Storefront</p>
                                        <p className="text-sm font-semibold" style={{ color: themeConfig.text }}>{subdomain}</p>
                                        <p className="text-xs mt-1" style={{ color: themeConfig.textSecondary }}>
                                            Your storefront address can't be changed here — it identifies your shop.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="md:col-span-3 rounded-3xl shadow-lg p-6 flex flex-col gap-5" style={{ backgroundColor: themeConfig.cardBg }}>
                                <div>
                                    <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>Store name</label>
                                    <input
                                        type="text"
                                        value={storeName}
                                        onChange={(e) => setStoreName(e.target.value)}
                                        className="w-full border-transparent rounded-xl text-lg font-semibold py-3 px-4 shadow-sm"
                                        style={fieldStyle}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>About your store</label>
                                    <textarea
                                        value={bio}
                                        onChange={(e) => setBio(e.target.value)}
                                        placeholder="What do you sell, and what makes you special?"
                                        className="w-full min-h-[100px] border-transparent rounded-xl text-base leading-relaxed p-4 shadow-sm resize-none"
                                        style={fieldStyle}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-2 ml-1" style={{ color: themeConfig.text }}>Category</label>
                                    <input
                                        type="text"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        placeholder="e.g. Fashion, Handicrafts"
                                        className="w-full border-transparent rounded-xl text-sm py-3 px-4 shadow-sm"
                                        style={fieldStyle}
                                    />
                                </div>
                                <TagEditor label="Brand vibes" tags={brandVibes} placeholder="Add vibe, press Enter" onChange={setBrandVibes} />

                                <div className="pt-4 border-t" style={{ borderColor: `${themeConfig.border}60` }}>
                                    <p className="text-sm font-bold mb-3" style={{ color: themeConfig.text }}>Contact details</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Phone</label>
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="98XXXXXXXX"
                                                className="w-full border-transparent rounded-xl text-sm py-2.5 px-4 shadow-sm"
                                                style={fieldStyle}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Email</label>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="shop@example.com"
                                                className="w-full border-transparent rounded-xl text-sm py-2.5 px-4 shadow-sm"
                                                style={fieldStyle}
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-bold mb-2 ml-1" style={{ color: themeConfig.textSecondary }}>Address</label>
                                            <input
                                                type="text"
                                                value={address}
                                                onChange={(e) => setAddress(e.target.value)}
                                                placeholder="e.g. Thamel, Kathmandu"
                                                className="w-full border-transparent rounded-xl text-sm py-2.5 px-4 shadow-sm"
                                                style={fieldStyle}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
