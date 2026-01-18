import React from 'react';
import { X, Printer, Download, Copy } from 'lucide-react';
import Button from '../common/Button';
import toast from 'react-hot-toast';
import { type Product } from '../../api/vendor';

interface ProductQRModalProps {
    product: Product;
    open: boolean;
    onClose: () => void;
}

export default function ProductQRModal({ product, open, onClose }: ProductQRModalProps) {
    if (!open) return null;

    const handlePrint = () => {
        const printContent = document.getElementById('printable-qr');
        if (printContent) {
            const win = window.open('', '', 'height=600,width=800');
            if (win) {
                win.document.write('<html><head><title>Print QR Code</title>');
                win.document.write('</head><body style="display:flex;justify-content:center;align-items:center;height:100vh;">');
                win.document.write(printContent.innerHTML);
                win.document.write('</body></html>');
                win.document.close();
                win.print();
            }
        }
    };

    const handleDownload = async () => {
        if (!product.qr_code) return;
        try {
            const response = await fetch(product.qr_code);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `QR-${product.product_code || product.id}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Download failed', error);
            toast.error('Failed to download QR code');
        }
    };

    const copyCode = () => {
        if (product.product_code) {
            navigator.clipboard.writeText(product.product_code);
            toast.success('Product code copied!');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border"
                style={{ borderColor: 'var(--vibe-border)' }}>

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b" style={{ borderColor: 'var(--vibe-border)' }}>
                    <h3 className="font-bold text-lg" style={{ color: 'var(--vibe-fg)' }}>Product QR Code</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                        <X className="w-5 h-5" style={{ color: 'var(--vibe-fg)' }} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col items-center text-center">
                    <div id="printable-qr" className="bg-white p-4 rounded-xl border-2 mb-4" style={{ borderColor: 'var(--vibe-border)' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center', color: 'black' }}>{product.name}</h2>
                        {product.qr_code ? (
                            <img
                                src={product.qr_code}
                                alt="Product QR"
                                className="w-48 h-48 object-contain"
                                style={{ display: 'block', margin: '0 auto' }}
                            />
                        ) : (
                            <div className="w-48 h-48 bg-gray-100 flex items-center justify-center text-gray-400">
                                No QR Code
                            </div>
                        )}
                        <p style={{ fontSize: '14px', marginTop: '8px', textAlign: 'center', color: 'black', fontFamily: 'monospace' }}>
                            {product.product_code || 'No Code'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 mb-6">
                        <span className="font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded border" style={{ color: 'var(--vibe-fg)', borderColor: 'var(--vibe-border)' }}>
                            {product.product_code || 'No Code'}
                        </span>
                        <button onClick={copyCode} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Copy Code">
                            <Copy className="w-4 h-4" style={{ color: 'var(--vibe-accent)' }} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={handlePrint}
                            className="flex items-center justify-center gap-2"
                        >
                            <Printer className="w-4 h-4" />
                            Print
                        </Button>
                        <Button
                            onClick={handleDownload}
                            className="flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Download
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
