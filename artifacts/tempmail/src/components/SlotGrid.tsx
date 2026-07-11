import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, RefreshCw, Zap, Check, Mail, Loader2 } from 'lucide-react';
import { createInbox, checkInbox, extractVerificationCode, checkBridgeStatus } from '../lib/tempmail';
import { motion, AnimatePresence } from 'framer-motion';

export type Slot = {
  id: number;
  email: string | null;
  token: string | null;
  code: string;
  loadingCode: boolean;
  generating: boolean;
};

interface SlotGridProps {
  slots: Slot[];
  updateSlot: (id: number, updates: Partial<Slot>) => void;
}

export function SlotGrid({ slots, updateSlot }: SlotGridProps) {
  const [provider, setProvider] = useState<'emailnator' | 'temp-mail.org'>('emailnator');

  useEffect(() => {
    checkBridgeStatus().then(isLocal => {
      if (isLocal) setProvider('temp-mail.org');
    });
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {slots.map(slot => (
        <SlotCard key={slot.id} slot={slot} updateSlot={updateSlot} provider={provider} />
      ))}
    </div>
  );
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  });
}

const POLL_INTERVAL_MS = 3000;

function SlotCard({
  slot,
  updateSlot,
  provider,
}: {
  slot: Slot;
  updateSlot: (id: number, updates: Partial<Slot>) => void;
  provider: 'emailnator' | 'temp-mail.org';
}) {
  const [emailCopied, setEmailCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [manualLoading, setManualLoading] = useState(false);

  const inFlightRef = useRef(false);
  const tokenRef = useRef(slot.token);
  const codeRef = useRef(slot.code);

  useEffect(() => { tokenRef.current = slot.token; }, [slot.token]);
  useEffect(() => { codeRef.current = slot.code; }, [slot.code]);

  const doFetch = useCallback(async (token: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const emails = await checkInbox(token);
      setLastChecked(new Date());
      if (emails && emails.length > 0 && tokenRef.current === token) {
        const code = extractVerificationCode(emails);
        if (code) {
          updateSlot(slot.id, { code });
        }
      }
    } catch {
      // silent — polling will retry
    } finally {
      inFlightRef.current = false;
    }
  }, [slot.id, updateSlot]);

  // Auto-poll when token exists and no code yet
  useEffect(() => {
    if (!slot.token || slot.code) { setPolling(false); return; }
    setPolling(true);
    doFetch(slot.token);
    const id = setInterval(() => {
      const token = tokenRef.current;
      const code = codeRef.current;
      if (!token || code) { clearInterval(id); setPolling(false); return; }
      doFetch(token);
    }, POLL_INTERVAL_MS);
    return () => { clearInterval(id); setPolling(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.token]);

  useEffect(() => { if (slot.code) setPolling(false); }, [slot.code]);

  const handleCopyEmail = () => {
    if (!slot.email) return;
    copyToClipboard(slot.email);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const handleCopyCode = () => {
    if (!slot.code) return;
    copyToClipboard(slot.code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  };

  const handleGenerate = async () => {
    if (slot.generating) return;
    updateSlot(slot.id, { generating: true, email: null, token: null, code: '', loadingCode: false });
    setLastChecked(null);
    try {
      const inbox = await createInbox();
      updateSlot(slot.id, { email: inbox.address, token: inbox.token, generating: false });
    } catch (err) {
      console.error('Failed to create inbox:', err);
      updateSlot(slot.id, { generating: false });
    }
  };

  const handleManualRefresh = async () => {
    if (!slot.token || manualLoading) return;
    const tokenAtStart = slot.token;
    setManualLoading(true);
    inFlightRef.current = false;
    try {
      const emails = await checkInbox(tokenAtStart);
      setLastChecked(new Date());
      if (emails && emails.length > 0 && tokenRef.current === tokenAtStart) {
        const code = extractVerificationCode(emails);
        if (code) {
          updateSlot(slot.id, { code });
        }
      }
    } catch {
      // ignore
    } finally {
      inFlightRef.current = false;
      setManualLoading(false);
    }
  };

  const activeDomain = slot.email ? slot.email.split('@')[1] : null;

  return (
    <div className="flex flex-col bg-card border border-card-border p-4 rounded-lg shadow-sm hover:border-border transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Slot {slot.id}
        </span>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
          provider === 'temp-mail.org'
            ? 'text-cyan-400 bg-cyan-950/20 border-cyan-800/20'
            : 'text-amber-600/60 bg-amber-950/20 border-amber-800/20'
        }`}>
          {provider}
        </span>
      </div>

      {/* Email display */}
      <div
        className="relative bg-background border border-border rounded-md p-3 mb-3 cursor-pointer flex items-center justify-between hover:border-primary transition-colors overflow-hidden group/copy"
        onClick={handleCopyEmail}
        title={slot.email || ''}
      >
        <div className="font-mono text-sm text-foreground truncate mr-3 select-all">
          {slot.generating
            ? <span className="text-muted-foreground/60 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Membuat inbox…</span>
            : slot.email
              ? <>
                  <span className="text-foreground">{slot.email.split('@')[0]}</span>
                  <span className="text-muted-foreground">@</span>
                  <span className="text-cyan-400">{activeDomain}</span>
                </>
              : <span className="text-muted-foreground/40">—</span>}
        </div>
        <AnimatePresence mode="wait">
          {emailCopied ? (
            <motion.div key="check" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
              <Check className="w-4 h-4 text-green-500 shrink-0" />
            </motion.div>
          ) : (
            <motion.div key="copy" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
              <Copy className={`w-4 h-4 shrink-0 transition-colors ${slot.email ? 'text-muted-foreground group-hover/copy:text-primary' : 'text-muted-foreground/30'}`} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Generate + Inbox buttons */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={handleGenerate}
          disabled={slot.generating}
          className="flex-1 cursor-pointer bg-amber-600/10 hover:bg-amber-600/20 text-amber-500 border border-amber-600/20 hover:border-amber-600/40 font-semibold text-xs py-2 rounded-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {slot.generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {slot.generating ? 'Creating…' : 'Generate'}
        </button>
        <button
          onClick={handleManualRefresh}
          disabled={!slot.token || manualLoading}
          title="Cek inbox sekarang"
          className="flex-1 cursor-pointer bg-cyan-600 hover:bg-cyan-500 disabled:bg-secondary disabled:text-muted-foreground disabled:border-transparent text-white font-semibold text-xs py-2 rounded-md flex items-center justify-center gap-1.5 transition-all border border-cyan-500/20 disabled:cursor-not-allowed"
        >
          {manualLoading
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            : <Mail className="w-3.5 h-3.5" />}
          {manualLoading ? 'Mengambil…' : 'Inbox'}
        </button>
      </div>

      {/* Auto-poll waiting indicator */}
      <AnimatePresence>
        {polling && !slot.code && (
          <motion.div
            key="polling"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-3 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-cyan-950/20 border border-cyan-800/30">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
              <span className="text-[11px] text-cyan-400 font-mono flex-1">
                Menunggu kode verifikasi…
              </span>
              {lastChecked && (
                <span className="text-[10px] text-cyan-700 font-mono shrink-0">
                  {lastChecked.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verification code display */}
      <AnimatePresence>
        {slot.code && (
          <motion.div
            key="code"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <Check className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-green-400 font-mono font-semibold">
                Code: {slot.code}
              </span>
            </div>
            <div
              onClick={handleCopyCode}
              className="cursor-pointer rounded-lg border-2 border-green-500/60 bg-green-950/30 hover:bg-green-950/50 transition-colors py-4 flex flex-col items-center justify-center gap-1 select-none"
            >
              <span className="font-mono font-bold text-3xl tracking-[0.3em] text-green-400">
                {slot.code}
              </span>
              <span className="text-[10px] text-green-600 font-medium">
                {codeCopied ? 'Tersalin!' : 'Klik untuk salin'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
