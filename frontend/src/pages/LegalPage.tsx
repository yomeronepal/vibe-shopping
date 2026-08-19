import { Link } from 'react-router-dom';

export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-800">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between">
                    <Link to="/" className="font-bold text-lg tracking-tight text-slate-900">BizAlly</Link>
                    <nav className="flex gap-4 text-sm text-slate-500">
                        <Link to="/privacy" className="hover:text-slate-900">Privacy</Link>
                        <Link to="/data-deletion" className="hover:text-slate-900">Data deletion</Link>
                    </nav>
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-5 py-10">
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">Last updated: {updated}</p>
                <div className="mt-8 space-y-8">{children}</div>
            </main>
            <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
                © 2026 BizAlly. All rights reserved.
            </footer>
        </div>
    );
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
    return (
        <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">{heading}</h2>
            <div className="space-y-3 text-[15px] leading-relaxed text-slate-600">{children}</div>
        </section>
    );
}

export function LegalList({ items }: { items: string[] }) {
    return (
        <ul className="list-disc pl-5 space-y-1.5">
            {items.map((item) => (
                <li key={item}>{item}</li>
            ))}
        </ul>
    );
}
