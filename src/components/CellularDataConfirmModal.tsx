import React from 'react';
import { Wifi, Download } from 'lucide-react';

interface CellularDataConfirmModalProps {
  isOpen: boolean;
  formattedSize: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CellularDataConfirmModal: React.FC<CellularDataConfirmModalProps> = ({
  isOpen,
  formattedSize,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-sm bg-gradient-to-b from-[#0e1530] to-[#070b1a] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl shadow-cyan-950/60 flex flex-col items-center text-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-4">
          <Wifi className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-white mb-2">
          Download on mobile data?
        </h3>

        <p className="text-xs text-slate-300 leading-relaxed mb-6">
          You are currently connected to mobile data. This update is{' '}
          <span className="font-bold text-cyan-300">{formattedSize || 'around 10 MB'}</span>. Cellular carrier data charges may apply.
        </p>

        <div className="w-full space-y-2.5">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-lg shadow-cyan-500/25 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Download anyway</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-white/5 active:scale-95 transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
