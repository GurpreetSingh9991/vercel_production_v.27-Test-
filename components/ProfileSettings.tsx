import React, { useState, useEffect, useCallback } from 'react';
import { ICONS } from '../constants';
import { getSupabaseClient, getSession, updateProfileAvatarInDB, getProfileAvatarFromDB } from '../services/supabase';
import { getTradeCountThisMonth, startStripeCheckout } from '../services/planService';
import { LegalModal } from './Legal';
type LegalDoc = 'privacy' | 'terms';

// ── R2 avatar upload (same Cloudflare worker used for trade images) ────────────
const WORKER_URL = (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_IMAGE_WORKER_URL : '') as string;

async function uploadAvatarToR2(file: File, userId: string, token: string): Promise<string> {
  if (!WORKER_URL) throw new Error('VITE_IMAGE_WORKER_URL not configured');
  // Request presigned URL from worker — use userId as tradeId so it lands in avatars/ folder
  const res = await fetch(`${WORKER_URL}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tradeId: `avatars/${userId}`, fileName: `avatar_${Date.now()}.jpg`, contentType: file.type }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Worker ${res.status}`); }
  const { uploadUrl, publicUrl, useProxy } = await res.json();

  if (useProxy) {
    // Fallback proxy upload
    const up = await fetch(`${WORKER_URL}/upload`, { method: 'PUT', headers: { 'Content-Type': file.type, Authorization: `Bearer ${token}` }, body: file });
    if (!up.ok) throw new Error(`Proxy upload failed: ${up.status}`);
  } else {
    const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!up.ok) throw new Error(`R2 upload failed: ${up.status}`);
  }
  return publicUrl;
}

interface ProfileSettingsProps {
  onClose: () => void;
  plan?: 'free' | 'pro';
}

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ onClose, plan = 'free' }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<number>(0);
  const [openLegal, setOpenLegal] = useState<LegalDoc | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Avatar upload
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [defaultRiskPct, setDefaultRiskPct] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem('tf_default_risk_pct') || '1.0'); } catch { return 1.0; }
  });
  const [defaultCommission, setDefaultCommission] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem('tf_default_commission') || '0'); } catch { return 0; }
  });
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem('tf_max_daily_loss') || '0'); } catch { return 0; }
  });
  const [maxDailyTrades, setMaxDailyTrades] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('tf_max_daily_trades') || '0'); } catch { return 0; }
  });
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword]     = useState('');
  const [newPassword, setNewPassword]             = useState('');
  const [confirmPassword, setConfirmPassword]     = useState('');
  const [passwordLoading, setPasswordLoading]     = useState(false);
  const [passwordSuccess, setPasswordSuccess]     = useState(false);
  const [passwordError, setPasswordError]         = useState<string | null>(null);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  // Whether the user signed up with Google (no password to change in that case)
  const [isGoogleUser, setIsGoogleUser]           = useState(false);
  
  // Developer-only gate: only show dev tools to the account owner.
  // Set VITE_OWNER_EMAIL=your@email.com in Netlify env vars / .env.local
  // Other users will never see this section — it's invisible in the UI.
  const ownerEmail = typeof import.meta !== 'undefined'
    ? (import.meta.env?.VITE_OWNER_EMAIL || '')
    : '';
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  useEffect(() => {
    getSession().then(s => setCurrentUserEmail(s?.user?.email || ''));
  }, []);
  const isOwner = ownerEmail && currentUserEmail && currentUserEmail === ownerEmail;
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    avatarUrl: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      const session = await getSession();
      if (session?.user) {
        setFormData({
          fullName: session.user.user_metadata?.full_name || '',
          email: session.user.email || '',
          phone: session.user.user_metadata?.phone_number || '',
          avatarUrl: session.user.user_metadata?.avatar_url || ''
        });

        // Sync avatar from profiles table (iOS writes here, so this picks up cross-platform changes)
        getProfileAvatarFromDB().then(dbAvatar => {
          if (dbAvatar) setFormData(prev => ({ ...prev, avatarUrl: dbAvatar }));
        });
        
        // Detect Google OAuth users — they have no password to change
        const providers: string[] = session.user.app_metadata?.providers || [];
        const provider: string = session.user.app_metadata?.provider || '';
        const identities = session.user.identities || [];
        const hasGoogleIdentity = identities.some((id: any) => id.provider === 'google');
        setIsGoogleUser(
          hasGoogleIdentity ||
          provider === 'google' ||
          providers.includes('google')
        );

        const count = await getTradeCountThisMonth(session.user.id);
        setUsage(count);
      }
    };
    fetchData();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { error: updateError } = await client.auth.updateUser({
        email: formData.email,
        data: {
          full_name: formData.fullName,
          phone_number: formData.phone,
          avatar_url: formData.avatarUrl
        }
      });

      if (updateError) throw updateError;
      
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordLoading(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    const client = getSupabaseClient();
    if (!client) { setPasswordError('Client unavailable.'); setPasswordLoading(false); return; }
    try {
      // For email/password users: Supabase requires re-authentication if it's a sensitive operation.
      // We call updateUser directly — Supabase handles session validation server-side.
      const { error: updateErr } = await client.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setPasswordSuccess(false); setShowPasswordSection(false); }, 3000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const s = await getSession();
      if (!s?.user?.id) throw new Error('Not logged in');
      const response = await fetch('/.netlify/functions/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: s.user.id }),
      });
      const { url, error } = await response.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Could not open billing portal');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      const s = await getSession();
      if (!s?.user?.id) throw new Error('Not logged in');
      const response = await fetch('/.netlify/functions/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: s.user.id }),
      });
      const { url, error: portalError } = await response.json();
      if (portalError) throw new Error(portalError);
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Could not open cancellation portal. Please contact support@tradeflowjournal.com');
    } finally {
      setIsCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  const handleDownloadProject = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/download-project');
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || "Failed to download project zip");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-md z-[150] flex items-center justify-center p-4 pt-safe pb-safe">
      <div className="apple-glass w-full max-w-xl rounded-[3rem] shadow-2xl border border-white relative ios-shadow animate-in zoom-in-95 fade-in duration-500 my-auto overflow-hidden">
        
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-white/30">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center text-white shadow-lg overflow-hidden border border-white/20">
              <img 
                src={formData.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${formData.fullName}`} 
                className="w-full h-full object-cover" 
                alt="Avatar" 
              />
            </div>
            <div>
              <h2 className="text-lg font-black text-black tracking-tighter uppercase leading-none">Profile Access</h2>
              <p className="text-[8px] font-black text-black opacity-50 uppercase tracking-widest mt-1">Identity & Plan Control</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-black/5 rounded-full transition-colors text-black opacity-40 hover:opacity-100">
            <ICONS.Close className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 md:p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          {/* Subscription Tier Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-4 bg-black rounded-full"></div>
              <h3 className="text-[10px] font-black text-black uppercase tracking-[0.2em]">Service Tier</h3>
            </div>
            
            <div className={`p-6 rounded-[2rem] border transition-all ${plan === 'pro' ? 'bg-black text-white border-black shadow-xl' : 'bg-white/40 border-black/5'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className={`text-xl font-black tracking-tight flex items-center gap-2 ${plan === 'pro' ? 'text-white' : 'text-black'}`}>
                    {plan === 'pro' ? 'Journal Pro' : 'Free Terminal'}
                    {plan === 'pro' && <ICONS.Zap className="w-5 h-5 text-emerald-400" />}
                  </h4>
                  <p className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${plan === 'pro' ? 'text-white/40' : 'text-black/30'}`}>
                    Active Subscription
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${plan === 'pro' ? 'bg-white/10 text-white' : 'bg-black text-white'}`}>
                  {plan.toUpperCase()}
                </div>
              </div>
              
              <div className="space-y-3">
                 <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className={plan === 'pro' ? 'text-white/40' : 'text-black/40'}>Usage Log</span>
                    <span className={plan === 'pro' ? 'text-emerald-400' : 'text-black'}>{usage} / {plan === 'pro' ? '∞' : '15'} Trades</span>
                 </div>
                 <div className="w-full h-2 bg-black/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${plan === 'pro' ? 'bg-emerald-400' : usage >= 12 ? 'bg-rose-500' : 'bg-black'}`} 
                      style={{ width: `${plan === 'pro' ? 100 : (usage / 15) * 100}%` }} 
                    />
                 </div>
                 {plan === 'free' && (
                    <button
                      onClick={async () => { const s = await getSession(); if (s?.user?.id) startStripeCheckout(s.user.id); }}
                      className="w-full mt-2 py-3 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] shadow-lg active:scale-95 transition-all hover:bg-black/80 flex items-center justify-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      Upgrade to Pro — $8.99/mo
                    </button>
                 )}
                 {plan === 'pro' && !showCancelConfirm && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={loading}
                      className="w-full mt-2 py-2.5 bg-white/60 border border-rose-200 text-rose-400 rounded-2xl text-[9px] font-black uppercase tracking-[0.15em] active:scale-95 transition-all hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      Cancel Subscription
                    </button>
                 )}
                 {plan === 'pro' && showCancelConfirm && (
                    <div className="mt-2 bg-rose-50 border border-rose-200 rounded-2xl p-4 animate-in slide-in-from-bottom-2 duration-200">
                      <p className="text-[10px] font-black text-rose-700 mb-1">⚠️ No Refunds — Are you sure?</p>
                      <p className="text-[9px] text-rose-600/80 leading-relaxed mb-3">
                        Your Pro access ends immediately. All subscription fees are <strong>non-refundable</strong> — no exceptions. You will lose access to AI insights, analytics, and multi-account management.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 py-2.5 bg-white border border-black/10 text-black/50 rounded-xl text-[8px] font-black uppercase tracking-widest hover:text-black transition-all"
                        >
                          Keep Pro
                        </button>
                        <button
                          onClick={handleCancelSubscription}
                          disabled={isCancelling}
                          className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {isCancelling ? <><div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"/>Processing...</> : 'Yes, Cancel'}
                        </button>
                      </div>
                    </div>
                 )}
              </div>
            </div>
          </section>

          {/* Developer Tools Section — OWNER ONLY, invisible to all other users */}
          {isOwner && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-4 bg-black rounded-full"></div>
              <h3 className="text-[10px] font-black text-black uppercase tracking-[0.2em]">Developer Tools</h3>
            </div>
            
            <div className="p-6 rounded-[2rem] border bg-slate-50 border-black/5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black tracking-tight text-black">Project Archive</h4>
                <p className="text-[8px] font-bold uppercase tracking-widest text-black/30 mt-1">Export full source code as .ZIP</p>
              </div>
              <button 
                type="button"
                onClick={handleDownloadProject}
                disabled={loading}
                className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                <ICONS.Download className="w-5 h-5" />
              </button>
            </div>
          </section>
          )}

          {/* Identity Section */}
          <form onSubmit={handleUpdate} className="space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-4 bg-black rounded-full"></div>
              <h3 className="text-[10px] font-black text-black uppercase tracking-[0.2em]">User Identification</h3>
            </div>

            <div className="flex flex-col items-center mb-6">
              <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-file-input')?.click()}>
                <div className="w-24 h-24 rounded-[2rem] bg-black/5 border border-black/10 overflow-hidden shadow-inner">
                  <img
                    src={avatarPreview || formData.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${formData.fullName}`}
                    className="w-full h-full object-cover"
                    alt="Avatar"
                  />
                </div>
                {/* Camera overlay */}
                <div className="absolute inset-0 rounded-[2rem] bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {avatarUploading
                    ? <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  }
                </div>
              </div>
              <p className="text-[9px] font-bold text-black/30 uppercase tracking-widest mt-3">Tap to change photo</p>
              {avatarError && <p className="text-[9px] font-bold text-rose-500 mt-1">{avatarError}</p>}
              {/* Hidden file input */}
              <input
                id="avatar-file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Preview immediately
                  const reader = new FileReader();
                  reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
                  reader.readAsDataURL(file);
                  setAvatarFile(file);
                  setAvatarError(null);
                  // Upload right away
                  setAvatarUploading(true);
                  try {
                    const s = await getSession();
                    if (!s?.user) throw new Error('Not logged in');
                    const token = (await getSupabaseClient()?.auth.getSession())?.data.session?.access_token || '';
                    const publicUrl = await uploadAvatarToR2(file, s.user.id, token);
                    // Write to BOTH profiles table (iOS syncs here) AND auth metadata (web session)
                    await updateProfileAvatarInDB(publicUrl);
                    setFormData(prev => ({ ...prev, avatarUrl: publicUrl }));
                    setAvatarPreview(null);
                    setAvatarFile(null);
                  } catch (err: any) {
                    setAvatarError(err.message || 'Upload failed');
                    setAvatarPreview(null);
                  } finally {
                    setAvatarUploading(false);
                  }
                  // Reset input so same file can be re-selected
                  e.target.value = '';
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className="block text-[8px] font-black text-black uppercase tracking-widest ml-2">Full Name</label>
                <input 
                  type="text" 
                  value={formData.fullName}
                  onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Trader Name"
                  className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-[13px] text-black focus:border-black outline-none transition-all font-bold shadow-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[8px] font-black text-black uppercase tracking-widest ml-2">E-mail address</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@flow.com"
                  className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-[13px] text-black focus:border-black outline-none transition-all font-bold shadow-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[8px] font-black text-black uppercase tracking-widest ml-2">Phone Number</label>
                <input 
                  type="tel" 
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+1 (000) 000-0000"
                  className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-[13px] text-black focus:border-black outline-none transition-all font-bold shadow-sm"
                />
              </div>
            </div>
          </form>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 py-3 px-6 rounded-2xl text-center">
              <p className="text-rose-600 text-[10px] font-black uppercase tracking-widest">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 py-3 px-6 rounded-2xl text-center">
              <p className="text-emerald-600 text-[10px] font-black uppercase tracking-widest">Update Successful</p>
            </div>
          )}

          {/* ── Password Change Section ─────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-4 bg-black rounded-full" />
                <h3 className="text-[10px] font-black text-black uppercase tracking-[0.2em]">Password</h3>
              </div>
              {!isGoogleUser && (
                <button
                  type="button"
                  onClick={() => { setShowPasswordSection(s => !s); setPasswordError(null); setPasswordSuccess(false); }}
                  className="text-[9px] font-black uppercase tracking-widest text-black/30 hover:text-black transition-colors"
                >
                  {showPasswordSection ? 'Cancel' : 'Change Password'}
                </button>
              )}
            </div>

            {isGoogleUser ? (
              <div className="p-5 rounded-[1.5rem] bg-black/[0.03] border border-black/5 flex items-center gap-4">
                <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-black/30" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h4.78c-.19 1.06-1.12 3.13-4.78 3.13-3.18 0-5.77-2.64-5.77-5.88s2.59-5.88 5.77-5.88c1.81 0 3.02.77 3.71 1.44l2.58-2.49c-1.66-1.55-3.82-2.49-6.29-2.49-5.26 0-9.52 4.26-9.52 9.52s4.26 9.52 9.52 9.52c5.5 0 9.15-3.87 9.15-9.3 0-.62-.07-1.1-.15-1.57h-9z"/></svg>
                </div>
                <div>
                  <p className="text-[11px] font-black text-black">Signed in with Google</p>
                  <p className="text-[9px] text-black/30 font-bold mt-0.5">Your password is managed by Google — change it at myaccount.google.com</p>
                </div>
              </div>
            ) : !showPasswordSection ? (
              <div className="p-5 rounded-[1.5rem] bg-black/[0.03] border border-black/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center">
                    <svg className="w-4 h-4 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-black">Password</p>
                    <p className="text-[9px] text-black/30 font-bold mt-0.5">Last changed: not tracked</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowPasswordSection(true)}
                  className="px-4 py-2 bg-black text-white rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all hover:bg-black/80">
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="new password (8+ characters)"
                  className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-[13px] text-black focus:border-black outline-none transition-all font-bold shadow-sm"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="confirm new password"
                  className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-[13px] text-black focus:border-black outline-none transition-all font-bold shadow-sm"
                />
                {passwordError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 py-2.5 px-5 rounded-xl">
                    <p className="text-rose-600 text-[9px] font-black uppercase tracking-widest">{passwordError}</p>
                  </div>
                )}
                {passwordSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 py-2.5 px-5 rounded-xl">
                    <p className="text-emerald-600 text-[9px] font-black uppercase tracking-widest">✓ Password updated successfully</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handlePasswordChange}
                  disabled={passwordLoading || !newPassword || !confirmPassword}
                  className="w-full py-3.5 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all disabled:opacity-50"
                >
                  {passwordLoading ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            )}
          </section>

          {/* ── Trading Defaults Section ─────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-4 bg-black rounded-full" />
              <h3 className="text-[10px] font-black text-black uppercase tracking-[0.2em]">Trade Preferences</h3>
            </div>

            <div className="p-6 rounded-[2rem] border bg-white/40 border-black/5 space-y-6">

              {/* Default risk % */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-black text-black">Default Risk per Trade</p>
                    <p className="text-[9px] text-black/30 font-bold mt-0.5">Pre-fills your risk field when logging trades</p>
                  </div>
                  <span className="text-[13px] font-black text-black">{defaultRiskPct.toFixed(1)}%</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[0.5, 1.0, 1.5, 2.0, 2.5].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => { setDefaultRiskPct(pct); localStorage.setItem('tf_default_risk_pct', String(pct)); }}
                      className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                        defaultRiskPct === pct
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-black/40 border-black/10 hover:border-black/30 hover:text-black/70'
                      }`}
                    >
                      {pct.toFixed(1)}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-black/5" />

              {/* Default commission */}
              <div className="space-y-2">
                <p className="text-[11px] font-black text-black">Default Commission ($)</p>
                <p className="text-[9px] text-black/30 font-bold">Auto-deducted from P&L when logging each trade</p>
                <div className="flex items-center gap-2 bg-white border border-black/10 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-black/40">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={defaultCommission || ''}
                    onChange={e => { const v = parseFloat(e.target.value) || 0; setDefaultCommission(v); localStorage.setItem('tf_default_commission', String(v)); }}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-[13px] font-black text-black outline-none"
                  />
                </div>
              </div>

              <div className="h-px bg-black/5" />

              {/* Max daily loss */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-black text-black">Max Daily Loss ($)</p>
                    <p className="text-[9px] text-black/30 font-bold">Warns you when you hit your daily drawdown limit</p>
                  </div>
                  {maxDailyLoss > 0 && (
                    <span className="text-[11px] font-black text-rose-500">${maxDailyLoss.toFixed(0)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 bg-white border border-black/10 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-black/40">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={maxDailyLoss || ''}
                    onChange={e => { const v = parseFloat(e.target.value) || 0; setMaxDailyLoss(v); localStorage.setItem('tf_max_daily_loss', String(v)); }}
                    placeholder="0 = disabled"
                    className="flex-1 bg-transparent text-[13px] font-black text-black outline-none"
                  />
                </div>
              </div>

              <div className="h-px bg-black/5" />

              {/* Max daily trades */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-black text-black">Max Daily Trades</p>
                    <p className="text-[9px] text-black/30 font-bold">Helps prevent overtrading — alerts when reached</p>
                  </div>
                  {maxDailyTrades > 0 && (
                    <span className="text-[11px] font-black text-amber-500">{maxDailyTrades}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 bg-white border border-black/10 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-black/40">#</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={maxDailyTrades || ''}
                    onChange={e => { const v = parseInt(e.target.value) || 0; setMaxDailyTrades(v); localStorage.setItem('tf_max_daily_trades', String(v)); }}
                    placeholder="0 = disabled"
                    className="flex-1 bg-transparent text-[13px] font-black text-black outline-none"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-black/[0.03] rounded-xl border border-black/5">
                <svg className="w-3.5 h-3.5 text-black/30 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p className="text-[9px] font-bold text-black/40 leading-relaxed">These defaults pre-fill your trade form and power the risk alerts on your dashboard.</p>
              </div>
            </div>
          </section>

          {/* ── What's New Section ─────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-4 bg-black rounded-full" />
                <h3 className="text-[10px] font-black text-black uppercase tracking-[0.2em]">What's New</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsNew(s => !s)}
                className="text-[9px] font-black uppercase tracking-widest text-black/30 hover:text-black transition-colors"
              >
                {showWhatsNew ? 'Collapse' : 'Show changelog'}
              </button>
            </div>

            {showWhatsNew && (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                {[
                  {
                    emoji: '⚡',
                    version: 'Latest',
                    title: 'Performance & Chart Overhaul',
                    items: [
                      'Equity curve now shows cumulative P&L from zero — growth is immediately readable',
                      'Dual-color gradient: green above zero, red below, with zero reference line',
                      'Discipline score replaced with inline progress bar',
                      'Streak card now shows growing dot-bar visualization',
                    ],
                  },
                  {
                    emoji: '🏢',
                    version: 'v1.0.28',
                    title: 'Prop Firm Picker',
                    items: [
                      'Account Hub now opens a guided Prop Firm template selector',
                      '11 templates across $25K, $50K, $100K, $150K accounts',
                      'Intraday Trailing, EOD, and Static drawdown types explained',
                      'Auto-fills starting balance from chosen template',
                    ],
                  },
                  {
                    emoji: '⚙️',
                    version: 'v1.0.27',
                    title: 'Trading Defaults & News Impact',
                    items: [
                      'Default risk %, commission, max daily loss & trade limits now in Settings',
                      'News Impact section added to Analytics — compare near-news vs clear market',
                      'All preferences saved locally — persist across sessions',
                    ],
                  },
                  {
                    emoji: '🛡️',
                    version: 'v1.0.26',
                    title: 'Pro subscription fixes',
                    items: [
                      'Fixed Pro users briefly seeing Free UI on launch',
                      'Supabase plan now checked alongside Apple IAP',
                      'Race condition in entitlement check fully resolved',
                    ],
                  },
                ].map(({ emoji, version, title, items }) => (
                  <div key={version} className="p-5 rounded-[1.5rem] bg-white/40 border border-black/5 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-base">{emoji}</span>
                      <div>
                        <p className="text-[11px] font-black text-black">{title}</p>
                        <p className="text-[9px] text-black/30 font-bold mt-0.5">{version}</p>
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <div className="w-1 h-1 rounded-full bg-black/20 mt-1.5 flex-shrink-0" />
                          <p className="text-[10px] font-bold text-black/50 leading-relaxed">{item}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Legal Documents Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-4 bg-black rounded-full"></div>
              <h3 className="text-[10px] font-black text-black uppercase tracking-[0.2em]">Legal</h3>
            </div>
            <div className="space-y-2">
              {([
                { id: 'terms' as LegalDoc, label: 'Terms & Conditions', sub: 'Usage, billing, liability & Apple provisions' },
                { id: 'privacy' as LegalDoc, label: 'Privacy Policy', sub: 'GDPR · CCPA · PIPEDA compliant' },
              ]).map(({ id, label, sub }) => (
                <button
                  key={id}
                  onClick={() => setOpenLegal(id)}
                  className="w-full flex items-center gap-4 bg-white/40 hover:bg-white/70 border border-black/5 rounded-2xl p-4 text-left transition-all group"
                >
                  <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-black/10 transition-all">
                    <svg className="w-4 h-4 text-black/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-black">{label}</p>
                    <p className="text-[9px] text-black/30 font-bold mt-0.5">{sub}</p>
                  </div>
                  <svg className="w-4 h-4 text-black/20 group-hover:text-black/50 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              ))}
            </div>
            <p className="text-[8px] text-black/20 font-bold uppercase tracking-widest text-center">Governed by Ontario, Canada law · v2025.02</p>
          </section>

          {/* Footer Info */}
          <div className="flex items-center justify-between text-[8px] font-black text-black opacity-20 uppercase tracking-[0.3em] pt-4">
            <span>Identity Protocol SEC-7</span>
            <span>Journal Build v1.08</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
          <button onClick={onClose} className="flex-1 py-4 rounded-full text-black opacity-40 font-black text-[10px] uppercase tracking-widest hover:opacity-100 transition-all">Abort</button>
          <button 
            onClick={handleUpdate}
            disabled={loading}
            className="
              flex-1 py-4 rounded-full 
              bg-black text-white
              font-black text-[11px] uppercase tracking-[0.3em]
              shadow-2xl transition-all duration-300 hover:brightness-110 active:scale-95 disabled:opacity-50
            "
          >
            {loading ? 'Synchronizing...' : 'Apply Changes'}
          </button>
        </div>
      </div>

      {/* Legal document modals */}
      {openLegal && <LegalModal doc={openLegal} onClose={() => setOpenLegal(null)} />}
    </div>
  );
};

export default ProfileSettings;