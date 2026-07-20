import React, { useState } from 'react';
import { Lock, Loader2, CheckCircle, ShieldCheck } from 'lucide-react';
import { dataService } from '../services/store';

const MIN_LENGTH = 8; // must match the server's zod rule in server/src/auth/routes.ts

interface Props {
  // Forced mode: the user signed in with an admin-issued temporary password, so
  // the current password is not asked for (the server skips that check while
  // must_reset is set) and there is no cancel path.
  forced?: boolean;
  onSuccess?: () => void;
}

export const ChangePasswordForm: React.FC<Props> = ({ forced = false, onSuccess }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }
    if (!forced && newPassword === currentPassword) {
      setError('New password must be different from your current one.');
      return;
    }

    setSaving(true);
    const result = await dataService.changePassword(newPassword, forced ? undefined : currentPassword);
    setSaving(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setDone(true);
    onSuccess?.();
  };

  const inputClass =
    'w-full pl-10 pr-4 py-3 rounded-none border border-slate-300 bg-white focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 outline-none transition-all text-slate-900 placeholder:text-slate-600';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {done && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-none flex items-start gap-3">
          <CheckCircle size={20} className="mt-0.5 flex-shrink-0 text-emerald-500" />
          <div className="text-sm">
            <p className="font-bold">Password Updated</p>
            <p className="text-slate-700 mt-1">Use your new password the next time you sign in.</p>
          </div>
        </div>
      )}

      {!forced && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Current Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            required
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Must be at least {MIN_LENGTH} characters.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm New Password</label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            required
          />
        </div>
      </div>

      {error && (
        <div className="bg-slate-50 border border-slate-100 text-slate-600 p-3 rounded-none text-sm flex items-center gap-2 font-medium">
          <ShieldCheck size={16} /> {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 rounded-none transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {saving ? <Loader2 className="animate-spin" size={20} /> : 'Update Password'}
      </button>
    </form>
  );
};
