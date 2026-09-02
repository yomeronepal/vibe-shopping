import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import SettingsTabs from '../components/vendor/SettingsTabs';
import {
    createStaff,
    listTeam,
    resetTeamPassword,
    updateTeamMember,
    type TeamMember,
} from '../api/vendor';

const ROLE_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
    owner: { bg: '#ede9fe', fg: '#6d28d9', label: 'Owner' },
    manager: { bg: '#dbeafe', fg: '#1d4ed8', label: 'Manager' },
    staff: { bg: '#f3f4f6', fg: '#4b5563', label: 'Staff' },
};

function CredentialsModal({ member, onClose }: { member: TeamMember; onClose: () => void }) {
    const { config: themeConfig } = useShopTheme();
    const copyAll = () => {
        navigator.clipboard.writeText(
            `BizAlly login for ${member.name}\nUsername: ${member.username}\nPassword: ${member.password}\nLogin: ${window.location.origin}/vendor/login`,
        );
        toast.success('Credentials copied — share them on WhatsApp or Viber');
    };
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative w-full max-w-md rounded-[28px] shadow-2xl border p-6"
                role="dialog"
                aria-modal="true"
                style={{ backgroundColor: themeConfig.cardBg, borderColor: `${themeConfig.border}50` }}
            >
                <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined" style={{ color: '#16a34a' }}>check_circle</span>
                    <h3 className="text-lg font-extrabold" style={{ color: themeConfig.text }}>
                        {member.name} can now log in
                    </h3>
                </div>
                <p className="text-xs mb-4" style={{ color: themeConfig.textSecondary }}>
                    Share these once — the password is only shown now. They can use it on the normal login page.
                </p>
                <div className="rounded-xl p-4 font-mono text-sm space-y-2" style={{ backgroundColor: `${themeConfig.surface}90`, color: themeConfig.text }}>
                    <p><span className="font-bold">Username:</span> {member.username}</p>
                    <p><span className="font-bold">Password:</span> {member.password}</p>
                </div>
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={copyAll}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white text-sm"
                        style={{ backgroundColor: themeConfig.primary }}
                    >
                        <span className="material-symbols-outlined text-[18px]">content_copy</span>
                        Copy credentials
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-3 rounded-xl font-bold text-sm border"
                        style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function VendorTeamPage() {
    const { config: themeConfig } = useShopTheme();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [myRole, setMyRole] = useState('staff');
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('staff');
    const [creating, setCreating] = useState(false);
    const [credentials, setCredentials] = useState<TeamMember | null>(null);

    const isOwner = myRole === 'owner';

    const load = () => {
        listTeam()
            .then((data) => {
                setMembers(data.members);
                setMyRole(data.your_role);
            })
            .catch(() => toast.error('Could not load the team'))
            .finally(() => setLoading(false));
    };

    useEffect(() => load(), []);

    const handleCreate = async () => {
        if (newName.trim().length < 2) {
            toast.error('Enter the staff member\'s name');
            return;
        }
        setCreating(true);
        try {
            const member = await createStaff(newName.trim(), newEmail.trim(), newRole);
            setMembers((prev) => [...prev, member]);
            setCredentials(member);
            setAddOpen(false);
            setNewName('');
            setNewEmail('');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not create the account');
        } finally {
            setCreating(false);
        }
    };

    const handleToggleActive = async (member: TeamMember) => {
        try {
            const updated = await updateTeamMember(member.id, { is_active: !member.is_active });
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            toast.success(updated.is_active ? `${updated.name} can log in again` : `${updated.name}'s access removed`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not update the member');
        }
    };

    const handleRoleChange = async (member: TeamMember, role: string) => {
        try {
            const updated = await updateTeamMember(member.id, { role });
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            toast.success(`${updated.name} is now ${ROLE_STYLES[role]?.label ?? role}`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not change the role');
        }
    };

    const handleResetPassword = async (member: TeamMember) => {
        try {
            const updated = await resetTeamPassword(member.id);
            setCredentials(updated);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not reset the password');
        }
    };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-8">
                    <h1 className="text-3xl font-extrabold tracking-tight mb-6" style={{ color: themeConfig.text }}>
                        Settings
                    </h1>
                    <SettingsTabs />
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p style={{ color: themeConfig.textSecondary }}>
                            {isOwner
                                ? 'Give your staff their own logins — they can handle the inbox, orders, and products.'
                                : 'People with access to this store. Only the owner can make changes here.'}
                        </p>
                        {isOwner && (
                            <button
                                onClick={() => setAddOpen(true)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white shadow-md"
                                style={{ backgroundColor: themeConfig.primary }}
                            >
                                <span className="material-symbols-outlined text-[18px]">person_add</span>
                                Add staff member
                            </button>
                        )}
                    </div>

                    <div className="mt-6 space-y-3">
                        {loading && (
                            <div className="h-20 rounded-2xl animate-pulse" style={{ backgroundColor: `${themeConfig.border}40` }} />
                        )}
                        {members.map((member) => {
                            const palette = ROLE_STYLES[member.role] ?? ROLE_STYLES.staff;
                            return (
                                <div
                                    key={member.id}
                                    className="rounded-2xl border p-4 flex items-center gap-4 flex-wrap"
                                    style={{
                                        backgroundColor: `${themeConfig.surface}90`,
                                        borderColor: `${themeConfig.border}60`,
                                        opacity: member.is_active ? 1 : 0.6,
                                    }}
                                >
                                    <div
                                        className="size-11 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                                        style={{ backgroundColor: member.is_active ? themeConfig.primary : themeConfig.border }}
                                    >
                                        {(member.name || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold" style={{ color: themeConfig.text }}>{member.name}</span>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: palette.bg, color: palette.fg }}>
                                                {palette.label}
                                            </span>
                                            {!member.is_active && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                                                    Access removed
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs mt-0.5" style={{ color: themeConfig.textSecondary }}>
                                            @{member.username}
                                            {member.last_login && ` · last active ${new Date(member.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                                        </p>
                                    </div>
                                    {isOwner && member.role !== 'owner' && (
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                            <select
                                                value={member.role}
                                                onChange={(e) => handleRoleChange(member, e.target.value)}
                                                className="rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none"
                                                style={{ backgroundColor: themeConfig.surface, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                            >
                                                <option value="staff">Staff</option>
                                                <option value="manager">Manager</option>
                                            </select>
                                            <button
                                                onClick={() => handleResetPassword(member)}
                                                title="Give them a new password"
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold border"
                                                style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.text }}
                                            >
                                                Reset password
                                            </button>
                                            <button
                                                onClick={() => handleToggleActive(member)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                                                style={member.is_active
                                                    ? { backgroundColor: '#fee2e2', color: '#b91c1c' }
                                                    : { backgroundColor: '#dcfce7', color: '#15803d' }}
                                            >
                                                {member.is_active ? 'Remove access' : 'Restore access'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {addOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
                    <div
                        className="relative w-full max-w-md rounded-[28px] shadow-2xl border p-6"
                        role="dialog"
                        aria-modal="true"
                        style={{ backgroundColor: themeConfig.cardBg, borderColor: `${themeConfig.border}50` }}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-lg font-extrabold" style={{ color: themeConfig.text }}>Add staff member</h3>
                            <button onClick={() => setAddOpen(false)} aria-label="Close" className="material-symbols-outlined z-10" style={{ color: themeConfig.textSecondary }}>close</button>
                        </div>
                        <p className="text-xs mb-4" style={{ color: themeConfig.textSecondary }}>
                            We create their login and show you the password once — share it with them directly.
                        </p>
                        <label className="block text-xs font-bold mb-1.5" style={{ color: themeConfig.textSecondary }}>Full name</label>
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="e.g. Sita Shrestha"
                            className="w-full rounded-xl text-sm py-2.5 px-3 mb-4 focus:outline-none"
                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                        />
                        <label className="block text-xs font-bold mb-1.5" style={{ color: themeConfig.textSecondary }}>Email (optional)</label>
                        <input
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="sita@example.com"
                            className="w-full rounded-xl text-sm py-2.5 px-3 mb-4 focus:outline-none"
                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                        />
                        <label className="block text-xs font-bold mb-1.5" style={{ color: themeConfig.textSecondary }}>Role</label>
                        <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            className="w-full rounded-xl text-sm py-2.5 px-3 mb-2 focus:outline-none"
                            style={{ backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text }}
                        >
                            <option value="staff">Staff — inbox, orders, products</option>
                            <option value="manager">Manager — same for now, more later</option>
                        </select>
                        <p className="text-[11px] mb-4" style={{ color: themeConfig.textSecondary }}>
                            Staff cannot change store settings, connect accounts, manage the team, or run boosts.
                        </p>
                        <button
                            onClick={handleCreate}
                            disabled={creating}
                            className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                            style={{ backgroundColor: themeConfig.primary }}
                        >
                            {creating ? 'Creating…' : 'Create login'}
                        </button>
                    </div>
                </div>
            )}
            {credentials && (
                <CredentialsModal member={credentials} onClose={() => setCredentials(null)} />
            )}
        </VendorShell>
    );
}
