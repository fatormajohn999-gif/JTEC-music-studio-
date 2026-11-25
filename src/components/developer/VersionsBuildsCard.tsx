import React from 'react';
import { Layers, Unlock, CheckCircle2, AlertCircle, Ban, ShieldCheck } from 'lucide-react';

export type VersionRowStatus = 'Latest' | 'Blocked' | 'Allowed' | 'Web • always allowed';

export interface VersionTableRow {
  key: string;
  isWeb: boolean;
  build: number | null;
  version: string;
  count: number;
  percentage: number;
  status: VersionRowStatus;
}

interface VersionsBuildsCardProps {
  versionsTable: VersionTableRow[];
  latestBuild: number;
  latestVersionName: string;
  currentAppVersion: string;
  blockActionMessage: { type: 'success' | 'error'; text: string } | null;
  onOpenUnblockAll: () => void;
  onRequestBlockVersion: (target: { build: number; version: string }) => void;
}

function getStatusDisplay(row: VersionTableRow): {
  label: string;
  badgeClass: string;
  barClass: string;
} {
  if (row.isWeb) {
    return {
      label: 'Web · Always Allowed',
      badgeClass: 'bg-cyan-500/12 border-cyan-500/35 text-cyan-300',
      barClass: 'bg-cyan-400',
    };
  }
  switch (row.status) {
    case 'Latest':
      return {
        label: 'Latest',
        badgeClass: 'bg-sky-500/15 border-sky-400/40 text-sky-200',
        barClass: 'bg-sky-400',
      };
    case 'Blocked':
      return {
        label: 'Blocked',
        badgeClass: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
        barClass: 'bg-rose-500',
      };
    case 'Allowed':
    default:
      return {
        label: 'Allowed',
        badgeClass: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300',
        barClass: 'bg-emerald-400',
      };
  }
}

export const VersionsBuildsCard: React.FC<VersionsBuildsCardProps> = ({
  versionsTable,
  latestBuild,
  latestVersionName,
  currentAppVersion,
  blockActionMessage,
  onOpenUnblockAll,
  onRequestBlockVersion,
}) => {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-950 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Versions &amp; Builds
            </h4>
            <p className="text-xs text-slate-400 truncate">
              Latest Android release:{' '}
              <span className="font-mono tabular-nums text-cyan-300 font-semibold">
                Build {latestBuild} · {latestVersionName || `v${currentAppVersion}`}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenUnblockAll}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-semibold text-slate-100 border border-slate-700/80 flex items-center justify-center gap-2 transition cursor-pointer shrink-0 self-start sm:self-auto whitespace-nowrap"
        >
          <Unlock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Unblock All</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {blockActionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start sm:items-center gap-2.5 border ${
            blockActionMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/35 text-emerald-200'
              : 'bg-rose-950/50 border-rose-500/35 text-rose-200'
          }`}
        >
          {blockActionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <span className="leading-relaxed">{blockActionMessage.text}</span>
        </div>
      )}

      {versionsTable.length === 0 ? (
        <div className="py-8 px-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
          No version or build records found in <code className="font-mono text-cyan-300">app_installs</code> yet.
        </div>
      ) : (
        <>
          {/* Desktop / Tablet Data Table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/90 text-[11px] font-semibold text-slate-400">
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Build</th>
                  <th className="py-3 px-4 text-right">Devices</th>
                  <th className="py-3 px-4 text-right">Share</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {versionsTable.map((row) => {
                  const isLatest = row.status === 'Latest';
                  const isWebRow = row.isWeb;
                  const style = getStatusDisplay(row);

                  return (
                    <tr key={row.key} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-white whitespace-nowrap">
                        {row.version}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-cyan-300 whitespace-nowrap">
                        {isWebRow ? 'Web' : `Build ${row.build}`}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {row.count.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2.5">
                          <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${style.barClass}`}
                              style={{ width: `${Math.min(100, Math.max(row.percentage, row.count > 0 ? 3 : 0))}%` }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-slate-200 w-12 text-right">
                            {row.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${style.badgeClass}`}
                        >
                          {isLatest && <ShieldCheck className="w-3 h-3 shrink-0" />}
                          {row.status === 'Blocked' && <Ban className="w-3 h-3 shrink-0" />}
                          <span>{style.label}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isWebRow ? (
                          <span className="text-[11px] text-slate-500">Not blockable</span>
                        ) : !isLatest && row.build !== null ? (
                          <button
                            type="button"
                            onClick={() => onRequestBlockVersion({ build: row.build!, version: row.version })}
                            className="min-h-[34px] px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 hover:text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                          >
                            Block &le; Build {row.build}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Current release</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards (< md) */}
          <div className="md:hidden space-y-3">
            {versionsTable.map((row) => {
              const isLatest = row.status === 'Latest';
              const isWebRow = row.isWeb;
              const style = getStatusDisplay(row);

              return (
                <div
                  key={row.key}
                  className="p-4 rounded-xl bg-slate-950/75 border border-slate-800 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{row.version}</p>
                      <p className="text-xs font-mono tabular-nums text-cyan-300 mt-0.5">
                        {isWebRow ? 'Web platform' : `Build ${row.build}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border shrink-0 whitespace-nowrap ${style.badgeClass}`}
                    >
                      {isLatest && <ShieldCheck className="w-3 h-3 shrink-0" />}
                      {row.status === 'Blocked' && <Ban className="w-3 h-3 shrink-0" />}
                      <span>{style.label}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-800/80 text-xs">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Build</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-100">
                        {isWebRow ? 'Web' : row.build}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Devices</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-100">
                        {row.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block">Share</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-100">
                        {row.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${style.barClass}`}
                      style={{ width: `${Math.min(100, Math.max(row.percentage, row.count > 0 ? 3 : 0))}%` }}
                    />
                  </div>

                  <div className="pt-1">
                    {isWebRow ? (
                      <p className="text-[11px] text-slate-400">
                        Web clients remain always allowed.
                      </p>
                    ) : !isLatest && row.build !== null ? (
                      <button
                        type="button"
                        onClick={() => onRequestBlockVersion({ build: row.build!, version: row.version })}
                        className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 hover:text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Ban className="w-3.5 h-3.5 shrink-0" />
                        <span>Block this version and older (Build {row.build})</span>
                      </button>
                    ) : (
                      <p className="text-[11px] text-slate-400">
                        Current latest Android release (cannot be blocked).
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};
