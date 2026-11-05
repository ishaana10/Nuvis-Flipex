import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export interface DeveloperPasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  disallowUserInfo: boolean;
  disallowCommon: boolean;
  disallowReuse: boolean;
  hashAlgorithm: string;
}

const DEFAULT_POLICY: DeveloperPasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  disallowUserInfo: true,
  disallowCommon: true,
  disallowReuse: true,
  hashAlgorithm: 'Argon2id (Memory-Hard KDF)',
};

const COMMON_WEAK_PATTERNS = [
  'password',
  '12345678',
  'qwertyui',
  'admin123',
  'welcome1',
  'letmein1',
  'changeme',
  'flipbook',
  'nuvis123',
  'iloveyou',
];

export function ChangePasswordForm({
  onSuccess,
  onCancel,
  compact = false,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [policy, setPolicy] = useState<DeveloperPasswordPolicy>(DEFAULT_POLICY);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [generatedCopied, setGeneratedCopied] = useState(false);

  useEffect(() => {
    api<DeveloperPasswordPolicy>('/me/password-policy')
      .then((p) => {
        if (p && typeof p.minLength === 'number') {
          setPolicy(p);
        }
      })
      .catch(() => {});
  }, []);

  // Evaluate each developer requirement in real time
  const checks = useMemo(() => {
    const pw = newPassword;
    const lowerPw = pw.toLowerCase();

    const lengthOk = pw.length >= policy.minLength;
    const upperOk = !policy.requireUppercase || /[A-Z]/.test(pw);
    const lowerOk = !policy.requireLowercase || /[a-z]/.test(pw);
    const numberOk = !policy.requireNumber || /[0-9]/.test(pw);
    const specialOk = !policy.requireSpecial || /[^a-zA-Z0-9]/.test(pw);

    let noUserInfoOk = true;
    if (policy.disallowUserInfo && pw.length > 0) {
      if (user?.email) {
        const local = user.email.split('@')[0]?.toLowerCase() || '';
        if (local.length >= 3 && lowerPw.includes(local)) {
          noUserInfoOk = false;
        }
      }
      if (user?.name) {
        const parts = user.name.toLowerCase().trim().split(/\s+/);
        for (const part of parts) {
          if (part.length >= 3 && lowerPw.includes(part)) {
            noUserInfoOk = false;
          }
        }
      }
    }

    let noCommonOk = true;
    if (policy.disallowCommon && pw.length > 0) {
      for (const w of COMMON_WEAK_PATTERNS) {
        if (lowerPw.includes(w)) {
          noCommonOk = false;
          break;
        }
      }
    }

    const notReusedOk =
      !policy.disallowReuse ||
      pw.length === 0 ||
      currentPassword.length === 0 ||
      pw !== currentPassword;

    const confirmMatchOk = confirmPassword.length > 0 && pw === confirmPassword;

    const rules = [
      {
        id: 'length',
        label: `At least ${policy.minLength} characters (${pw.length}/${policy.minLength})`,
        passed: lengthOk,
        enabled: true,
      },
      {
        id: 'upper',
        label: 'Contains an uppercase letter (A–Z)',
        passed: upperOk,
        enabled: policy.requireUppercase,
      },
      {
        id: 'lower',
        label: 'Contains a lowercase letter (a–z)',
        passed: lowerOk,
        enabled: policy.requireLowercase,
      },
      {
        id: 'number',
        label: 'Contains a number (0–9)',
        passed: numberOk,
        enabled: policy.requireNumber,
      },
      {
        id: 'special',
        label: 'Contains a special symbol (!@#$%^&*)',
        passed: specialOk,
        enabled: policy.requireSpecial,
      },
      {
        id: 'userinfo',
        label: 'Does not contain your name or email username',
        passed: pw.length > 0 && noUserInfoOk,
        enabled: policy.disallowUserInfo,
      },
      {
        id: 'common',
        label: 'Not a commonly compromised dictionary pattern',
        passed: pw.length > 0 && noCommonOk,
        enabled: policy.disallowCommon,
      },
      {
        id: 'reuse',
        label: 'Different from your current password',
        passed: pw.length > 0 && notReusedOk,
        enabled: policy.disallowReuse,
      },
    ].filter((r) => r.enabled);

    const allPolicyPassed =
      lengthOk &&
      upperOk &&
      lowerOk &&
      numberOk &&
      specialOk &&
      noUserInfoOk &&
      noCommonOk &&
      notReusedOk;

    // Strength score 0..5
    let score = 0;
    if (pw.length >= policy.minLength) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw) && noCommonOk && noUserInfoOk) score++;

    const strengthLabels = ['Too Short', 'Weak', 'Fair', 'Good', 'Strong', 'Enterprise Argon2id Ready'];
    const strengthColors = ['#94a3b8', '#ef4444', '#f59e0b', '#eab308', '#0284c7', '#10b981'];

    return {
      rules,
      allPolicyPassed,
      confirmMatchOk,
      score: pw.length === 0 ? 0 : Math.max(1, score),
      strengthLabel: pw.length === 0 ? 'Enter new password' : strengthLabels[score],
      strengthColor: pw.length === 0 ? '#94a3b8' : strengthColors[score],
    };
  }, [newPassword, confirmPassword, currentPassword, policy, user]);

  const handleGenerateStrongPassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const nums = '23456789';
    const syms = '!@#$%^&*_-+=';
    const all = upper + lower + nums + syms;

    const targetLen = Math.max(16, policy.minLength + 4);
    const chars: string[] = [
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      nums[Math.floor(Math.random() * nums.length)],
      syms[Math.floor(Math.random() * syms.length)],
    ];

    const randomValues = new Uint32Array(targetLen);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(randomValues);
      for (let i = chars.length; i < targetLen; i++) {
        chars.push(all[randomValues[i] % all.length]);
      }
    } else {
      for (let i = chars.length; i < targetLen; i++) {
        chars.push(all[Math.floor(Math.random() * all.length)]);
      }
    }

    // Shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    const generated = chars.join('');
    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowNew(true);
    setErrorMsg('');
    setFieldErrors({});
    navigator.clipboard?.writeText(generated).catch(() => {});
    setGeneratedCopied(true);
    setTimeout(() => setGeneratedCopied(false), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFieldErrors({});
    setSuccessMsg('');

    if (!currentPassword) {
      setFieldErrors({ currentPassword: 'Current password is required' });
      return;
    }
    if (!checks.allPolicyPassed) {
      setErrorMsg('Please satisfy all developer password security requirements listed below.');
      return;
    }
    if (!checks.confirmMatchOk) {
      setFieldErrors({ confirmPassword: 'Confirmation password does not match new password' });
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>('/me/password', 'PUT', {
        currentPassword,
        newPassword,
        confirmPassword,
        revokeOtherSessions,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMsg(res.message || 'Password updated with Argon2id security.');
      if (onSuccess) {
        setTimeout(() => onSuccess(), 900);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
        setFieldErrors(err.fields || {});
      } else {
        setErrorMsg('Failed to update password. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="pw-security-form" onSubmit={handleSubmit}>
      {/* Security Badge Header */}
      <div className="pw-policy-banner">
        <div className="pw-policy-badge-row">
          <span className="pw-kdf-badge">🔒 {policy.hashAlgorithm}</span>
          <button
            type="button"
            className="pw-gen-btn"
            onClick={handleGenerateStrongPassword}
            title="Generate a 16-character cryptographic password that satisfies all developer rules"
          >
            {generatedCopied ? '✓ Generated & Copied to Clipboard!' : '⚡ Generate Strong Password'}
          </button>
        </div>
        {!compact && (
          <p className="pw-policy-hint">
            Enforced by Developer Security Policy · Passwords are salted and hashed with memory-hard Argon2id.
          </p>
        )}
      </div>

      {errorMsg && <div className="pw-alert pw-alert-err">⚠️ {errorMsg}</div>}
      {successMsg && <div className="pw-alert pw-alert-ok">✅ {successMsg}</div>}

      {/* 1. Current Password */}
      <div className="pw-field-group">
        <label className="pw-label">Current Password</label>
        <div className="pw-input-wrap">
          <input
            type={showCurrent ? 'text' : 'password'}
            className={`boardui-input pw-input ${fieldErrors.currentPassword ? 'input-err' : ''}`}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter your current account password"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="pw-eye-btn"
            onClick={() => setShowCurrent((s) => !s)}
            tabIndex={-1}
            title={showCurrent ? 'Hide password' : 'Show password'}
          >
            {showCurrent ? '🙈' : '👁️'}
          </button>
        </div>
        {fieldErrors.currentPassword && (
          <small className="err">{fieldErrors.currentPassword}</small>
        )}
      </div>

      {/* 2. New Password */}
      <div className="pw-field-group">
        <div className="flex items-center justify-between">
          <label className="pw-label">New Password</label>
          <span className="pw-strength-text" style={{ color: checks.strengthColor }}>
            {checks.strengthLabel}
          </span>
        </div>
        <div className="pw-input-wrap">
          <input
            type={showNew ? 'text' : 'password'}
            className={`boardui-input pw-input ${fieldErrors.newPassword ? 'input-err' : ''}`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`At least ${policy.minLength} characters with mixed case, number & symbol`}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            className="pw-eye-btn"
            onClick={() => setShowNew((s) => !s)}
            tabIndex={-1}
            title={showNew ? 'Hide password' : 'Show password'}
          >
            {showNew ? '🙈' : '👁️'}
          </button>
        </div>

        {/* 5-Segment Entropy & Strength Bar */}
        <div className="pw-meter-grid">
          {[1, 2, 3, 4, 5].map((level) => (
            <div
              key={level}
              className="pw-meter-seg"
              style={{
                background:
                  checks.score >= level ? checks.strengthColor : 'var(--border-color)',
              }}
            />
          ))}
        </div>
        {fieldErrors.newPassword && <small className="err">{fieldErrors.newPassword}</small>}
      </div>

      {/* 3. Confirm New Password */}
      <div className="pw-field-group">
        <div className="flex items-center justify-between">
          <label className="pw-label">Confirm New Password</label>
          {confirmPassword.length > 0 && (
            <span
              className="text-xs font-semibold"
              style={{ color: checks.confirmMatchOk ? '#10b981' : '#ef4444' }}
            >
              {checks.confirmMatchOk ? '✓ Passwords Match' : '✕ Does Not Match'}
            </span>
          )}
        </div>
        <div className="pw-input-wrap">
          <input
            type={showConfirm ? 'text' : 'password'}
            className={`boardui-input pw-input ${fieldErrors.confirmPassword ? 'input-err' : ''}`}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            className="pw-eye-btn"
            onClick={() => setShowConfirm((s) => !s)}
            tabIndex={-1}
            title={showConfirm ? 'Hide password' : 'Show password'}
          >
            {showConfirm ? '🙈' : '👁️'}
          </button>
        </div>
        {fieldErrors.confirmPassword && (
          <small className="err">{fieldErrors.confirmPassword}</small>
        )}
      </div>

      {/* Developer Password Requirements Live Checklist */}
      <div className="pw-checklist-box">
        <div className="pw-checklist-title">
          🛡️ Developer Password Security Requirements
        </div>
        <div className="pw-checklist-grid">
          {checks.rules.map((r) => (
            <div
              key={r.id}
              className={`pw-check-item ${r.passed ? 'passed' : newPassword.length > 0 ? 'pending' : ''}`}
            >
              <span className="pw-check-icon">{r.passed ? '✓' : '○'}</span>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Session Security Option */}
      <label className="pw-session-revoke-label">
        <input
          type="checkbox"
          checked={revokeOtherSessions}
          onChange={(e) => setRevokeOtherSessions(e.target.checked)}
        />
        <span>Sign out of all other active devices & browser sessions after changing password</span>
      </label>

      {/* Submit Actions */}
      <div className="pw-actions-row">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="btn-primary"
          disabled={busy || !checks.allPolicyPassed || !checks.confirmMatchOk || !currentPassword}
        >
          {busy ? 'Encrypting & Updating Password…' : '🔑 Update Password'}
        </button>
      </div>
    </form>
  );
}

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        className="card pw-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pw-modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: '18px' }}>🔑 Change Account Password</h2>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
              Update your credentials following workspace developer security requirements
            </p>
          </div>
          <button
            type="button"
            className="pw-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <ChangePasswordForm onSuccess={onClose} onCancel={onClose} compact />
      </div>
    </div>
  );
}
