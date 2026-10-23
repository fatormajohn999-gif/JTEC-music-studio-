import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Database, HardDrive, ShieldCheck, Server, Globe } from 'lucide-react';
import { SupabaseService, CLOUD_CATEGORIES, CategoryConnectionDiagnostic, CloudCategoryKey } from '../services/supabase';
import { APP_VERSION } from '../version';

interface ConnectionTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionTestModal: React.FC<ConnectionTestModalProps> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Record<CloudCategoryKey, CategoryConnectionDiagnostic | null>>({
    nasheed: null,
    love_chill: null,
    jtec_main: null,
  });

  const runAllDiagnostics = useCallback(async () => {
    setIsRunning(true);
    const results: Partial<Record<CloudCategoryKey, CategoryConnectionDiagnostic>> = {};

    for (const cat of CLOUD_CATEGORIES) {
      try {
        const diag = await SupabaseService.testCategoryConnection(cat.key);
        results[cat.key] = diag;
      } catch (err) {
        results[cat.key] = {
          categoryKey: cat.key,
          status: 'error',
          success: false,
          errorType: 'unknown',
          message: err instanceof Error ? err.message : 'Diagnostic run failed',
          tableExists: false,
          bucketsExist: false,
          maskedHost: 'Unknown',
          tableName: 'songs',
          bucketName: 'music',
          databaseStatus: 'failed',
          storageStatus: 'failed',
          timestamp: Date.now(),
        };
      }
    }

    setDiagnostics(results as Record<CloudCategoryKey, CategoryConnectionDiagnostic>);
    setIsRunning(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      runAllDiagnostics();
    }
  }, [isOpen, runAllDiagnostics]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-wide">Developer Connection Diagnostics</h3>
              <p className="text-[11px] text-slate-400">Build-time keys & category endpoints</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close diagnostic modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(85vh-140px)] scrollbar-thin">
          {CLOUD_CATEGORIES.map((cat) => {
            const diag = diagnostics[cat.key];
            const isPending = isRunning && !diag;

            return (
              <div
                key={cat.key}
                className="p-4 rounded-xl border border-slate-800 bg-slate-800/40 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.themeColor }}
                    />
                    <span className="text-sm font-semibold text-white">{cat.title}</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                      {cat.key}
                    </span>
                  </div>

                  {isPending ? (
                    <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  ) : diag ? (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${
                        diag.status === 'connected'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : diag.status === 'partial'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : diag.status === 'not_configured'
                          ? 'bg-slate-700/50 text-slate-400 border border-slate-600'
                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {diag.status === 'connected' && <CheckCircle2 className="w-3 h-3" />}
                      {diag.status === 'partial' && <AlertTriangle className="w-3 h-3" />}
                      {diag.status === 'error' && <AlertCircle className="w-3 h-3" />}
                      {diag.status === 'not_configured' && <Server className="w-3 h-3" />}
                      {diag.status.toUpperCase()}
                    </span>
                  ) : null}
                </div>

                {diag && (
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                      <div className="flex items-center space-x-1.5 overflow-hidden">
                        <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-400">Host:</span>
                        <span className="font-mono text-[11px] truncate text-slate-200" title={diag.maskedHost}>
                          {diag.maskedHost}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5 overflow-hidden">
                        <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-400">Table:</span>
                        <span className="font-mono text-[11px] truncate text-slate-200">
                          {diag.tableName} ({diag.databaseStatus})
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5 overflow-hidden col-span-2">
                        <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-400">Storage:</span>
                        <span className="font-mono text-[11px] truncate text-slate-200">
                          {diag.bucketName} ({diag.storageStatus})
                        </span>
                      </div>
                    </div>

                    <p className={`text-[11px] leading-relaxed ${
                      diag.success ? 'text-emerald-400' : 'text-slate-400'
                    }`}>
                      {diag.message}
                    </p>

                    {diag.suggestion && (
                      <p className="text-[10px] text-amber-300/80 italic">
                        Tip: {diag.suggestion}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-900/90 text-xs">
          <span className="text-slate-400 text-[11px]">
            App Version: <span className="text-slate-200 font-mono">{APP_VERSION}</span>
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={runAllDiagnostics}
              disabled={isRunning}
              className="px-3 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 flex items-center space-x-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'Testing...' : 'Test Again'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
