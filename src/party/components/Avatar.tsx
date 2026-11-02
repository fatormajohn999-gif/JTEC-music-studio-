import React from 'react';
import { getAvatarColor } from '../backend';

interface AvatarProps {
  url?: string | null;
  name: string;
  size?: number; // size in px, e.g. 24, 36, 40, 48, 96
  className?: string;
  onClick?: () => void;
  title?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  url,
  name,
  size = 40,
  className = '',
  onClick,
  title,
}) => {
  const initial = (name || 'U').trim().slice(0, 1).toUpperCase();
  const bgColor = getAvatarColor(name || 'U');
  const fontSize = Math.max(10, Math.round(size * 0.42));

  return (
    <div
      onClick={onClick}
      title={title || name}
      className={`relative shrink-0 flex items-center justify-center select-none overflow-hidden ${
        onClick ? 'cursor-pointer hover:opacity-95 active:scale-95 transition-transform' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: 9999,
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        backgroundColor: bgColor,
      }}
    >
      <div
        className="w-full h-full flex items-center justify-center text-white font-bold tracking-tight select-none pointer-events-none"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: 1,
          width: '100%',
          height: '100%',
        }}
      >
        {initial}
      </div>

      {url ? (
        <img
          src={url}
          alt={name}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
          }}
          className="pointer-events-none"
        />
      ) : null}
    </div>
  );
};

