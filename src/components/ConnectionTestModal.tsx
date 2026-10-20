import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, Activity, Server, ShieldCheck, Database } from 'lucide-react';
import { SupabaseService, SourceDiagnosticResult, CLOUD_CATEGORIES } from '../services/supabase';
import { APP_VERSION } from '../version';

interface ConnectionTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionTestModal: React.FC<ConnectionTestModalProps> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<SourceDiagnosticResult[]>([]);
  const [lastTestedAt, setLastTestedAt] = useState<number | null>(null);

  const runDiagnostics = async () => {
    setIsRunning(true);
    try {
      const data = await SupabaseService.runAllSourcesDiagnostics();
      setResults(data);
      setLastTestedAt(Date.now());
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg rounded-3xl bg-[#090d20] border border-cyan-500/30 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Supabase Connection Test
              </h3>
              <p className="text-xs text-slate-400">
                Live read test across all catalog sources • <span className="text-cyan-300 font-mono font-bold">App v{APP_VERSION}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close connection test dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security & Public Read Note */}
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/20 text-xs text-cyan-200">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            Reads use the public anonymous key with NO login required. Secret keys are never logged, displayed, or cached.
          </p>
        </div>

        {/* Sources List */}
        <div className="space-y-3">
          {isRunning && results.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Testing connection to all Supabase sources...</p>
            </div>
          ) : (
            results.map((res) => {
              const catMeta = CLOUD_CATEGORIES.find((c) => c.key === res.categoryKey);
              return (
                <div
                  key={res.categoryKey}
                  className="p-4 rounded-2xl bg-slate-900/70 border border-white/5 space-y-2.5 transition hover:border-white/15"
                >
                  {/* Top: Source Name & Read Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: catMeta?.themeColor || '#00f0ff' }}
                      />
                      <span className="text-sm font-bold text-white tracking-wide">
                        {res.sourceName}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5">
                      {res.success ? (
                        <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Success ({res.httpStatus})</span>
                        </span>
                      ) : !res.isConfigured ? (
                        <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span>Not Configured</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 font-bold text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Failed ({res.httpStatus})</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Host Address (Host Only, Never Key) */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Server className="w-3 h-3" />
                      Project Address:
                    </span>
                    <span className="font-mono text-slate-300 select-all font-semibold">
                      {res.projectHost}
                    </span>
                  </div>

                  {/* Error Message if Failed */}
                  {res.errorMessage && (
                    <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/20 text-[11px] text-rose-300 leading-relaxed font-mono">
                      {res.errorMessage}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between gap-3 border-t border-white/10">
          <span className="text-[10px] text-slate-500">
            {lastTestedAt ? `Last tested: ${new Date(lastTestedAt).toLocaleTimeString()}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={runDiagnostics}
              disabled={isRunning}
              className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'Testing...' : 'Re-test Sources'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
