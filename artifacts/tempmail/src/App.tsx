import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, RefreshCw, Trash2, Shield, Zap, ClipboardList, KeyRound, Loader2 } from 'lucide-react';
import { SlotGrid, type Slot } from './components/SlotGrid';
import { createInboxBatch, type InboxResponse } from './lib/tempmail';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';

const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-background text-foreground font-mono">
    <div className="text-center space-y-4">
      <h1 className="text-4xl text-primary">404</h1>
      <p className="text-muted-foreground">Not Found</p>
    </div>
  </div>
);

const TIPS = [
  "Klik alamat email mana saja untuk menyalinnya seketika.",
  "Semua email menggunakan domain yorki.site dengan inbox real-time.",
  "Biarkan tab ini terbuka saat menunggu email konfirmasi.",
  "Inbox bersifat sementara — simpan info penting di tempat lain.",
  "Gunakan slot berbeda untuk daftar di beberapa layanan sekaligus."
];

function Home() {
  const [slots, setSlots] = useState<Slot[]>(() => {
    return Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      email: null,
      token: null,
      code: '',
      loadingCode: false,
      generating: false,
    }));
  });

  const [tipIndex, setTipIndex] = useState(0);
  const [emailsCopied, setEmailsCopied] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);

  const doCopy = useCallback((text: string) => {
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
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex(i => (i + 1) % TIPS.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const updateSlot = (id: number, updates: Partial<Slot>) => {
    setSlots(current => current.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const generateAll = async () => {
    if (generatingAll) return;
    setGeneratingAll(true);
    setSlots(current => current.map(s => ({ ...s, email: null, token: null, code: '', loadingCode: false, generating: true })));
    await createInboxBatch(10, (index, inbox) => {
      const slotId = index + 1;
      setSlots(current => current.map(s => s.id === slotId ? { ...s, email: inbox.address, token: inbox.token, generating: false } : s));
    }, 150);
    setGeneratingAll(false);
  };

  const resetAll = () => {
    setSlots(current => current.map(s => ({
      ...s,
      email: null,
      token: null,
      code: '',
      loadingCode: false,
      generating: false,
    })));
  };

  const copyAllEmails = () => {
    const emails = slots.map(s => s.email || '-').join('\n');
    doCopy(emails);
    setEmailsCopied(true);
    setTimeout(() => setEmailsCopied(false), 2000);
  };

  const copyAllCodes = () => {
    const codes = slots.filter(s => s.code).map(s => s.code).join('\n');
    doCopy(codes);
    setCodesCopied(true);
    setTimeout(() => setCodesCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg border border-primary/20">
                <Terminal className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">TopNod Email</h1>
                <p className="text-xs font-medium text-muted-foreground">by Yorki</p>
              </div>
            </div>

            <div className="flex-1 max-w-xl mx-auto hidden lg:flex items-center">
              <div className="w-full bg-background border border-border rounded-full px-4 py-2 flex items-center gap-3 shadow-inner">
                <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground font-mono truncate">
                  {TIPS[tipIndex]}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={resetAll}
                className="flex cursor-pointer items-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 rounded-lg text-sm font-semibold transition-all"
              >
                <Trash2 className="w-4 h-4" /> Reset All
              </button>
              <button 
                onClick={generateAll}
                disabled={generatingAll}
                className="flex cursor-pointer items-center gap-2 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 disabled:opacity-50 text-green-500 border border-green-500/20 rounded-lg text-sm font-semibold transition-all disabled:cursor-not-allowed"
              >
                {generatingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {generatingAll ? 'Generating…' : 'Generate All'}
              </button>
            </div>
          </div>
          
          <div className="py-2 flex items-center justify-center border-t border-border/50 lg:hidden text-xs text-muted-foreground font-mono truncate">
            <Shield className="w-3.5 h-3.5 mr-2 inline-block" />
            {TIPS[tipIndex]}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
            <Zap className="w-5 h-5 text-amber-500" /> Active Burner Slots
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={copyAllEmails}
              className="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold transition-all"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              {emailsCopied ? 'Tersalin!' : 'Salin Semua Email'}
            </button>
            <button
              onClick={copyAllCodes}
              className="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-semibold transition-all"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {codesCopied ? 'Tersalin!' : 'Salin Semua Kode'}
            </button>
          </div>
        </div>

        <SlotGrid slots={slots} updateSlot={updateSlot} />
      </main>

      <footer className="border-t border-border bg-card mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground font-medium">
            &copy; {new Date().getFullYear()} TopNod Email by Yorki. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/60 text-center md:text-right max-w-md">
            Disclaimer: Use temporary emails responsibly. Many services block known burner domains. Never use these for important accounts as inboxes are public and temporary.
          </p>
        </div>
      </footer>
    </div>
  );
}

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
