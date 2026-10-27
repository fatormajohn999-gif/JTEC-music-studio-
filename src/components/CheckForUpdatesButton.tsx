import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, Loader2, Check, AlertCircle } from 'lucide-react';
import { NativeUpdateService, getCurrentAppVersion } from '../services/nativeUpdate';

type UpdateCheckStatus = 'idle' | 'checking' | 'up-to-date' | 'error';

interface CheckForUpdatesButtonProps {
  label?: string;
  className?: string;
}

export const CheckForUpdatesButton: React.FC<CheckForUpdatesButtonProps> = ({
  label = 'Check for updates',
  className = '',
}) => {
  const [status, setStatus] = useState<UpdateCheckStatus>('idle');
  const [currentTag, setCurrentTag] = useState<string>('v1.0.1');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getCurrentAppVersion().then((info) => {
      setCurrentTag(info.formattedTag);
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (status === 'checking') return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setStatus('checking');

    try {
      const currentInfo = await getCurrentAppVersion();
      setCurrentTag(currentInfo.formattedTag);

      const result = await NativeUpdateService.checkForUpdate(true);
      if (result && result.hasUpdate) {
        setStatus('idle');
        window.dispatchEvent(
          new CustomEvent('jtec:show-native-update', {
            detail: { versionName: result.versionName },
          })
        );
      } else {
        setStatus('up-to-date');
        timerRef.current = setTimeout(() => {
          setStatus('idle');
        }, 3000);
      }
    } catch (err) {
      console.warn('[CheckForUpdates] Update check failed:', err);
      setStatus('error');
      timerRef.current = setTimeout(() => {
        setStatus('idle');
      }, 3000);
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center pt-1 pb-1 ${className}`}>
      <button
        type="button"
        onClick={handleCheckForUpdates}
        disabled={status === 'checking'}
        className={`group relative inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 select-none cursor-pointer ${
          status === 'checking'
            ? 'bg-slate-800/90 text-cyan-300 border border-cyan-500/40 cursor-wait'
            : status === 'up-to-date'
            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/50'
            : status === 'error'
            ? 'bg-rose-950/60 text-rose-300 border border-rose-500/50'
            : 'bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-slate-200 border border-slate-700/80 hover:border-cyan-500/30 hover:text-white shadow-sm'
        }`}
      >
        {status === 'checking' && (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>Checking...</span>
          </>
        )}

        {status === 'up-to-date' && (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>You&apos;re up to date ({currentTag})</span>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Couldn&apos;t check right now. Check your internet.</span>
          </>
        )}

        {status === 'idle' && (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-180 transition-transform duration-500" />
            <span>{label}</span>
          </>
        )}
      </button>
    </div>
  );
};
