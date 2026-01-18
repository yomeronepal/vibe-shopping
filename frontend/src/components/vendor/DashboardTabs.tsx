import { useState } from 'react';
import { Package, Share2, Scan } from 'lucide-react';
import VendorProductList from './VendorProductList';
import SocialMediaSettings from './SocialMediaSettings';
import VendorPOSCheckout from './VendorPOSCheckout';

interface DashboardTabsProps {
    onCreateNew: () => void;
}

export default function DashboardTabs({ onCreateNew }: DashboardTabsProps) {
    const [activeTab, setActiveTab] = useState<'products' | 'social' | 'pos'>('products');

    const tabs = [
        { id: 'products' as const, label: 'Products', icon: Package },
        { id: 'social' as const, label: 'Social Media', icon: Share2 },
        { id: 'pos' as const, label: 'Point of Sale', icon: Scan },
    ];

    return (
        <div>
            {/* Tab Navigation */}
            <div className="flex gap-2 mb-6 border-b-2" style={{ borderColor: 'var(--vibe-border)' }}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className="flex items-center gap-2 px-6 py-3 font-semibold transition-all relative"
                        style={{
                            color: activeTab === tab.id ? 'var(--vibe-accent)' : 'var(--vibe-fg)',
                            opacity: activeTab === tab.id ? 1 : 0.6,
                        }}
                    >
                        <tab.icon className="w-5 h-5" />
                        <span>{tab.label}</span>
                        {activeTab === tab.id && (
                            <div
                                className="absolute bottom-0 left-0 right-0 h-0.5"
                                style={{ backgroundColor: 'var(--vibe-accent)' }}
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div>
                {activeTab === 'products' && <VendorProductList onCreateNew={onCreateNew} />}
                {activeTab === 'social' && <SocialMediaSettings />}
                {activeTab === 'pos' && <VendorPOSCheckout />}
            </div>
        </div>
    );
}
