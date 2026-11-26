import React, { useEffect, useState } from 'react';
import { AvatarEmblem, PlayerProfile } from '../types/arcade';

interface PlayerAvatarProps {
  profile: PlayerProfile;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const CustomEmblemSvg: React.FC<{ emblem: AvatarEmblem; className?: string }> = ({
  emblem,
  className = '',
}) => {
  switch (emblem) {
    case 'rocket':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.5C15.5 5 17 9 17 13.5L12 18L7 13.5C7 9 8.5 5 12 2.5Z" fill="#ffffff" />
          <circle cx="12" cy="10" r="2" fill="currentColor" />
          <path d="M7 12.5L4 15.5L7 16.5" fill="#ffe17c" />
          <path d="M17 12.5L20 15.5L17 16.5" fill="#ffe17c" />
          <path d="M10 18.5L12 21.5L14 18.5" />
        </svg>
      );
    case 'crown':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 18L2.5 8L8 12L12 5.5L16 12L21.5 8L20.5 18H3.5Z" fill="#ffffff" />
          <line x1="4" y1="20.5" x2="20" y2="20.5" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.8L4.5 6V11.8C4.5 16.4 7.7 19.9 12 21.5C16.3 19.9 19.5 16.4 19.5 11.8V6L12 2.8Z" fill="#ffffff" />
          <path d="M9.2 12.2L11.2 14.2L15.2 10" />
        </svg>
      );
    case 'star':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <polygon
            points="12,3 14.8,8.7 21,9.6 16.5,14 17.6,20.2 12,17.2 6.4,20.2 7.5,14 3,9.6 9.2,8.7"
            fill="#ffffff"
          />
        </svg>
      );
    case 'swords':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 4L14.5 4.5L5.5 13.5L8.5 16.5L17.5 7.5L19 4Z" fill="#ffffff" />
          <path d="M5 4L9.5 4.5L18.5 13.5L15.5 16.5L6.5 7.5L5 4Z" fill="#ffffff" />
          <line x1="4" y1="18" x2="7.5" y2="14.5" />
          <line x1="20" y1="18" x2="16.5" y2="14.5" />
        </svg>
      );
    case 'arcade':
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="12" rx="4" fill="#ffffff" />
          <line x1="8" y1="11" x2="8" y2="15" />
          <line x1="6" y1="13" x2="10" y2="13" />
          <circle cx="15" cy="11.8" r="1.1" fill="currentColor" />
          <circle cx="17.5" cy="14" r="1.1" fill="currentColor" />
        </svg>
      );
  }
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  profile,
  size = 'md',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [profile.photoUrl]);

  const dims =
    size === 'xs'
      ? 'w-6 h-6 rounded-md'
      : size === 'sm'
        ? 'w-8 h-8 rounded-lg'
        : size === 'lg'
          ? 'w-14 h-14 rounded-xl'
          : 'w-10 h-10 rounded-lg';

  const iconDims =
    size === 'xs'
      ? 'w-3.5 h-3.5'
      : size === 'sm'
        ? 'w-4 h-4'
        : size === 'lg'
          ? 'w-7 h-7'
          : 'w-5 h-5';

  const bgHex =
    profile.accentColor || (profile.id === 'p1' ? '#ffe17c' : '#b7c6c2');

  const showPhoto = Boolean(profile.photoUrl && profile.photoUrl.trim().length > 0 && !imgError);

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 border-2 border-black text-black ${dims} ${className}`}
      style={{ backgroundColor: bgHex }}
      aria-hidden="true"
    >
      {showPhoto ? (
        <img
          src={profile.photoUrl}
          alt={profile.name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <CustomEmblemSvg emblem={profile.emblem || 'arcade'} className={iconDims} />
      )}
    </div>
  );
};
