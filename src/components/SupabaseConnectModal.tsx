import React, { useState } from 'react';
import { X, Database, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, HardDrive, Key, RefreshCw } from 'lucide-react';
import { SupabaseService, SUPABASE_SQL_SETUP } from '../services/supabase';

interface SupabaseConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export const SupabaseConnectModal: React.FC<SupabaseConnectModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const currentConfig = SupabaseService.getConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    tableExists: boolean;
    bucketsExist: boolean;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSql, setShowSql] = useState(false);

  if (!isOpen) return null;

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    const result = await SupabaseService.testConnection(url, anonKey);
    setIsTesting(false);
    setTestResult(result);

    if (result.success) {
      SupabaseService.saveConfig(url, anonKey);
      onConnected();
    }
  };

  const handleDisconnect = () => {
    SupabaseService.clearConfig();
    setUrl('');
    setAnonKey('');
    setTestResult(null);
    onConnected();
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SETUP);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#090d20] border border-cyan-500/30 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Connect Supabase Cloud
              </h2>
              <p className="text-xs text-slate-400">
                Persistent cloud storage for audio files & metadata
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Status Banner */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                currentConfig.isConfigured ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="font-semibold text-slate-200">
              {currentConfig.isConfigured ? 'Supabase Project Active' : 'Local Cloud Simulation Mode'}
            </span>
          </div>
          {currentConfig.isConfigured && (
            <button
              onClick={handleDisconnect}
              className="text-xs text-rose-400 hover:text-rose-300 font-medium underline"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleTestAndSave} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              Project URL
            </label>
            <input
              type="url"
              required
              placeholder="https://your-project.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-purple-400" />
              Public Anon API Key
            </label>
            <input
              type="password"
              required
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono text-[11px] transition"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Found in Supabase Dashboard $\rightarrow$ Settings $\rightarrow$ API $\rightarrow$ Project API keys (anon / public). Never use your service_role key.
            </p>
          </div>

          {/* Test Status Result */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-medium">{testResult.message}</p>
                {testResult.success && !testResult.tableExists && (
                  <p className="text-[11px] text-amber-300 font-normal">
                    Note: Remember to run the SQL schema below to create the songs table.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isTesting || !url.trim() || !anonKey.trim()}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-cyan-500/20 cursor-pointer active:scale-95"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                'Save & Connect'
              )}
            </button>
          </div>
        </form>

        {/* 1-Click SQL Setup Helper */}
        <div className="pt-2 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowSql(!showSql)}
              className="text-xs font-bold text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5"
            >
              <span>{showSql ? '▼ Hide' : '▶ Show'} Supabase SQL Setup Script</span>
            </button>
            <button
              type="button"
              onClick={handleCopySql}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-slate-300 flex items-center gap-1 transition"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy SQL
                </>
              )}
            </button>
          </div>

          {showSql && (
            <div className="p-3 rounded-xl bg-black/60 border border-white/10 space-y-2 text-[11px]">
              <p className="text-slate-400">
                Run this script in your{' '}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                >
                  Supabase SQL Editor <ExternalLink className="w-3 h-3" />
                </a>{' '}
                to create the <code className="text-white">songs</code> table and storage policies:
              </p>
              <pre className="p-2.5 rounded-lg bg-slate-950 text-cyan-300 font-mono text-[10px] max-h-36 overflow-y-auto custom-scrollbar select-all">
                {SUPABASE_SQL_SETUP}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
