import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode } from 'lucide-react';

interface QrCodeDisplayProps {
  value: string;
  size?: number;
}

export const QrCodeDisplay: React.FC<QrCodeDisplayProps> = ({ value, size = 176 }) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setError(false);

    if (!value) {
      setDataUrl('');
      return;
    }

    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      color: {
        dark: '#090D16',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (error || !dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-2xl bg-[#0F131E] border border-white/10 flex flex-col items-center justify-center gap-2 text-slate-400"
      >
        <QrCode className="w-8 h-8 text-cyan-400/60" />
        <span className="text-[11px]">QR unavailable</span>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-2xl bg-white shadow-xl shadow-cyan-500/10 inline-flex items-center justify-center">
      <img
        src={dataUrl}
        alt="Party Invite QR Code"
        style={{ width: size, height: size }}
        className="rounded-lg block"
      />
    </div>
  );
};
