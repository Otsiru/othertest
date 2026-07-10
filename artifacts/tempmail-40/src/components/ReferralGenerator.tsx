import React, { useState } from 'react';
import { Copy, Check, RefreshCw, Tag, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

export function ReferralGenerator() {
  const [template, setTemplate] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  const generate = () => {
    const t = template.trim();
    if (!t) return;
    setCodes(Array.from({ length: 20 }, () => t));
  };

  const copyOne = (code: string, index: number) => {
    copyToClipboard(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const copyAll = () => {
    if (!codes.length) return;
    copyToClipboard(codes.join('\n'));
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  return (
    <div className="bg-card border border-card-border rounded-lg p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-violet-500/10 p-1.5 rounded-md border border-violet-500/20">
          <Tag className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white leading-tight">Referral Code Generator</h3>
          <p className="text-xs text-muted-foreground">Duplikasi 20× kode referral yang sama persis</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={template}
          onChange={e => setTemplate(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder="Tempel kode referral, contoh: TRPH4_NF0AZ8133"
          className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-violet-500 transition-colors"
        />
        <button
          onClick={generate}
          disabled={!template.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-secondary disabled:text-muted-foreground text-white font-semibold text-sm rounded-md transition-all disabled:cursor-not-allowed shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
          Generate 20×
        </button>
      </div>

      <AnimatePresence>
        {codes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {codes.map((code, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-background border border-border rounded-md px-3 py-2 hover:border-violet-500/50 transition-colors group cursor-pointer"
                  onClick={() => copyOne(code, i)}
                >
                  <span className="font-mono text-sm text-violet-300 truncate mr-2 select-all">{code}</span>
                  <span className="shrink-0 text-muted-foreground group-hover:text-white transition-colors">
                    {copiedIndex === i
                      ? <Check className="w-4 h-4 text-green-500" />
                      : <Copy className="w-4 h-4" />}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={copyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-semibold transition-all"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                {allCopied ? 'Tersalin!' : 'Salin Semua Kode Referral'}
              </button>
              <button
                onClick={generate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-background hover:bg-violet-500/10 text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/20 rounded-lg text-xs font-semibold transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Generate Ulang
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
