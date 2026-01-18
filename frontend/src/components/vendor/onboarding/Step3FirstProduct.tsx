import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';

interface Step3FirstProductProps {
    onNext: (productFile: File) => void;
    onBack: () => void;
}

const Step3FirstProduct: React.FC<Step3FirstProductProps> = ({ onNext, onBack }) => {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const selectedFile = e.dataTransfer.files[0];
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (file) {
            onNext(file);
        } else {
            toast.error("Please upload an image first.");
        }
    };

    return (
        <div className="animate-fadeIn">
            <h2 className="text-2xl font-semibold text-white mb-2">First Product Drop</h2>
            <p className="text-slate-400 mb-6">Upload an image and let our AI Magic handle the details.</p>

            <form onSubmit={handleSubmit}>
                <div
                    className="border-2 border-dashed border-slate-600 rounded-xl p-8 mb-8 text-center hover:border-indigo-500 transition-colors cursor-pointer bg-slate-800/30"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileChange}
                    />

                    {preview ? (
                        <div className="relative group">
                            <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg shadow-md" />
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                <span className="text-white font-medium">Change Image</span>
                            </div>
                        </div>
                    ) : (
                        <div className="py-8">
                            <div className="text-4xl mb-4">📸</div>
                            <p className="text-white font-medium">Click to upload or drag & drop</p>
                            <p className="text-slate-500 text-sm mt-2">JPG, PNG, WEBP up to 5MB</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="w-1/3 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-4 rounded-xl border border-slate-700 transition-colors"
                    >
                        Back
                    </button>
                    <button
                        type="submit"
                        disabled={!file}
                        className={`w-2/3 font-bold py-4 rounded-xl shadow-lg transform transition-all 
              ${file
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98]'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }
            `}
                    >
                        {file ? "Magic Generate ✨" : "Upload to Continue"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Step3FirstProduct;
