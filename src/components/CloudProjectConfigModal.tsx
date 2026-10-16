import React, { useState } from 'react';
import { 
  X, Database, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, 
  FolderLock, RefreshCw, Key, Shield, Radio, Sparkles
} from 'lucide-react';
import { 
  SupabaseService, 
  CloudCategoryKey, 
  CLOUD_CATEGORIES, 
  CategoryProjectConfig, 
  CategoryConnectionDiagnostic,
  SUPABASE_SQL_SETUP 
} from '../services/supabase';

interface CloudProjectConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: (categoryKey: CloudCategoryKey) => void;
  initialCategory?: CloudCategoryKey;
}

export const CloudProjectConfigModal: React.FC<CloudProjectConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
  initialCategory = 'nasheed',
}) => {
  const [activeTab, setActiveTab] = useState<CloudCategoryKey>(initialCategory);

  // Per-category form states
  const [configs, setConfigs] = useState<Record<CloudCategoryKey, CategoryProjectConfig>>({
    nasheed: SupabaseService.getCategoryConfig('nasheed'),
    love_chill: SupabaseService.getCategoryConfig('love_chill'),
    jtec_main: SupabaseService.getCategoryConfig('jtec_main'),
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<CategoryConnectionDiagnostic | null>(null);

  const [copiedSql, setCopiedSql] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const currentCategoryMeta = CLOUD_CATEGORIES.find((c) => c.key === activeTab)!;
  const currentForm = configs[activeTab];

  const handleFieldChange = (field: keyof CategoryProjectConfig, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: value,
      },
    }));
    setTestResult(null);
    setSaveSuccess(false);
  };

  const handleTestConnection = async () => {
    if (!currentForm.url.trim() || !currentForm.anonKey.trim()) {
      setTestResult({
        categoryKey: activeTab,
        status: 'not_configured',
        success: false,
        errorType: 'configuration',
        message: 'Project URL and Public Anon Key are required to test connection.',
        tableExists: false,
        bucketsExist: false,
        maskedHost: 'Not Configured',
        tableName: currentForm.tableName || 'songs',
        bucketName: currentForm.bucket || 'music',
        databaseStatus: 'not_checked',
        storageStatus: 'not_checked',
        suggestion: 'Provide your Supabase URL and public anon key or verify GitHub Secrets.',
        timestamp: Date.now(),
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const result = await SupabaseService.testCategoryConnection(activeTab, {
      url: currentForm.url,
      anonKey: currentForm.anonKey,
      bucket: currentForm.bucket || 'music',
      tableName: currentForm.tableName || 'songs',
    });

    setIsTesting(false);
    setTestResult(result);
  };

  const handleSave = () => {
    if (!currentForm.url.trim() || !currentForm.anonKey.trim()) return;

    SupabaseService.saveCategoryConfig(activeTab, {
      url: currentForm.url,
      anonKey: currentForm.anonKey,
      bucket: currentForm.bucket || 'music',
      tableName: currentForm.tableName || 'songs',
    });

    setConfigs((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        isConfigured: true,
      },
    }));

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
    onConfigSaved(activeTab);
  };

  const handleDisconnect = () => {
    SupabaseService.clearCategoryConfig(activeTab);
    setConfigs((prev) => ({
      ...prev,
      [activeTab]: {
        url: '',
        anonKey: '',
        bucket: 'music',
        tableName: 'songs',
        isConfigured: false,
      },
    }));
    setTestResult(null);
    onConfigSaved(activeTab);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SETUP);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-3xl bg-[#080d1a] border border-cyan-500/30 p-6 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Configure Cloud Projects
              </h2>
              <p className="text-xs text-slate-400">
                Independent Supabase vaults for each music category
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-white/5">
          {CLOUD_CATEGORIES.map((cat) => {
            const isSelected = activeTab === cat.key;
            const isConfigured = configs[cat.key]?.isConfigured;

            return (
              <button
                key={cat.key}
                onClick={() => {
                  setActiveTab(cat.key);
                  setTestResult(null);
                  setSaveSuccess(false);
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 text-white shadow-md border border-white/15'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isConfigured ? cat.themeColor : '#64748b' }}
                  />
                  <span className="truncate">{cat.title}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-normal">
                  {isConfigured ? 'Connected' : 'Not setup'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Category Description */}
        <div
          className="p-3.5 rounded-2xl border text-xs leading-relaxed space-y-1"
          style={{
            borderColor: `${currentCategoryMeta.themeColor}33`,
            backgroundColor: `${currentCategoryMeta.themeColor}0d`,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-white tracking-wide flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentCategoryMeta.themeColor }}
              />
              {currentCategoryMeta.title} Vault
            </span>
            <span className="text-[11px] text-slate-400">
              {currentCategoryMeta.subtitle}
            </span>
          </div>
          <p className="text-slate-300 text-[11px]">
            {currentCategoryMeta.description}
          </p>
        </div>

        {/* Configuration Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Supabase Project URL
            </label>
            <input
              type="url"
              placeholder="https://xyzcompany.supabase.co"
              value={currentForm.url}
              onChange={(e) => handleFieldChange('url', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 transition font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Supabase Public Anon Key
            </label>
            <textarea
              rows={2}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={currentForm.anonKey}
              onChange={(e) => handleFieldChange('anonKey', e.target.value)}
              className="w-full px-4 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 transition font-mono resize-none"
            />
            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-400 inline" />
              Client safe: Use only your public "anon" key. Never enter your service_role secret.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Storage Bucket
              </label>
              <input
                type="text"
                placeholder="music"
                value={currentForm.bucket || 'music'}
                onChange={(e) => handleFieldChange('bucket', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 transition font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Database Table
              </label>
              <input
                type="text"
                placeholder="songs"
                value={currentForm.tableName || 'songs'}
                onChange={(e) => handleFieldChange('tableName', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 transition font-mono"
              />
            </div>
          </div>
        </div>

        {/* Live Test Diagnostic Result */}
        {testResult && (
          <div
            className={`p-4 rounded-2xl border text-xs space-y-2.5 transition animate-in fade-in ${
              testResult.status === 'connected'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : testResult.status === 'partial'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : testResult.status === 'not_configured'
                ? 'bg-slate-800/80 border-white/10 text-slate-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`}
          >
            {/* Header: Status Chip + Host */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {testResult.status === 'connected' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : testResult.status === 'partial' ? (
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="font-bold tracking-wide">
                  {testResult.status === 'connected'
                    ? 'Connection Successful'
                    : testResult.status === 'partial'
                    ? 'Partial Connection (Action Required)'
                    : testResult.status === 'not_configured'
                    ? 'Configuration Required'
                    : testResult.errorType === 'authentication'
                    ? 'Authentication Failure'
                    : testResult.errorType === 'permissions'
                    ? 'Permissions Denied (RLS)'
                    : testResult.errorType === 'database'
                    ? 'Database Failure'
                    : testResult.errorType === 'bucket'
                    ? 'Storage Bucket Missing'
                    : testResult.errorType === 'network'
                    ? 'Network / Host Unreachable'
                    : 'Connection Error'}
                </span>
              </div>

              {testResult.errorType && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                    testResult.status === 'partial'
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : testResult.status === 'connected'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {testResult.errorType}
                </span>
              )}
            </div>

            {/* Main Safe Message */}
            <p className="text-xs leading-relaxed opacity-90 font-medium">
              {testResult.message}
            </p>

            {/* Diagnostic Breakdown */}
            <div className="pt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between bg-black/20 px-2.5 py-1.5 rounded-lg border border-white/5">
                <span className="text-slate-400">Database ({testResult.tableName}):</span>
                <span className="font-semibold">
                  {testResult.databaseStatus === 'ready' ? (
                    <span className="text-emerald-400">✓ Ready</span>
                  ) : testResult.databaseStatus === 'missing_table' ? (
                    <span className="text-amber-400">✗ Missing Table</span>
                  ) : testResult.databaseStatus === 'permission_denied' ? (
                    <span className="text-rose-400">✗ RLS Denied</span>
                  ) : testResult.databaseStatus === 'paused' ? (
                    <span className="text-amber-400">✗ Project Paused</span>
                  ) : testResult.databaseStatus === 'failed' ? (
                    <span className="text-rose-400">✗ Failed</span>
                  ) : (
                    <span className="text-slate-500">Not checked</span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between bg-black/20 px-2.5 py-1.5 rounded-lg border border-white/5">
                <span className="text-slate-400">Storage ({testResult.bucketName}):</span>
                <span className="font-semibold">
                  {testResult.storageStatus === 'ready' ? (
                    <span className="text-emerald-400">✓ Ready</span>
                  ) : testResult.storageStatus === 'missing_bucket' ? (
                    <span className="text-amber-400">✗ Bucket Missing</span>
                  ) : testResult.storageStatus === 'permission_denied' ? (
                    <span className="text-rose-400">✗ Access Denied</span>
                  ) : testResult.storageStatus === 'failed' ? (
                    <span className="text-rose-400">✗ Failed</span>
                  ) : (
                    <span className="text-slate-500">Not checked</span>
                  )}
                </span>
              </div>
            </div>

            {/* Host Reference (Masked) */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
              <span>Host: <code className="text-slate-300 font-mono">{testResult.maskedHost}</code></span>
              <span>Tested: {new Date(testResult.timestamp).toLocaleTimeString()}</span>
            </div>

            {/* Actionable Suggestion */}
            {testResult.suggestion && (
              <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-[11px] text-slate-300 flex items-start gap-2">
                <span className="font-bold text-cyan-400 shrink-0">Tip:</span>
                <span>{testResult.suggestion}</span>
              </div>
            )}
          </div>
        )}

        {saveSuccess && (
          <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span>Settings saved for {currentCategoryMeta.title}!</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !currentForm.url || !currentForm.anonKey}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {isTesting ? (
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            ) : (
              <Radio className="w-4 h-4 text-cyan-400" />
            )}
            <span>Test Connection</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!currentForm.url || !currentForm.anonKey}
            className="w-full sm:flex-1 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black text-xs font-bold shadow-lg shadow-cyan-500/20 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Save {currentCategoryMeta.title} Setup</span>
          </button>

          {currentForm.isConfigured && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        {/* Helper SQL toggle */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
          <button
            onClick={() => setShowSql(!showSql)}
            className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
          >
            {showSql ? 'Hide SQL setup script' : 'Need SQL schema setup for Supabase?'}
          </button>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-white transition"
          >
            <span>Supabase Dashboard</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {showSql && (
          <div className="p-3 rounded-2xl bg-slate-950 border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-300 font-semibold">
                SQL Schema (Run in Supabase SQL Editor):
              </span>
              <button
                onClick={handleCopySql}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                {copiedSql ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="text-[10px] text-slate-400 font-mono max-h-36 overflow-y-auto p-2 bg-slate-900 rounded-lg whitespace-pre-wrap">
              {SUPABASE_SQL_SETUP}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
