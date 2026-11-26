import React from 'react';

interface ArcadeLogoProps {
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
}

export const ArcadeLogo: React.FC<ArcadeLogoProps> = ({ size = 'md', inverted = false }) => {
  const dims =
    size === 'sm'
      ? 'h-9 w-9'
      : size === 'lg'
        ? 'h-12 w-12'
        : 'h-10 w-10';

  const bodyFill = inverted ? '#ffffff' : '#ffe17c';
  const antennaFill = inverted ? '#171e19' : '#ffe17c';

  return (
    <span
      className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-lg border-2 border-black ${
        inverted ? 'bg-[#ffe17c]' : 'bg-[#171e19]'
      }`}
    >
      {/* Goofy Twin-Joystick Arcade Bot Mascot SVG */}
      <svg viewBox="0 0 44 44" className="h-full w-full p-0.5" aria-hidden="true">
        {/* Twin Goofy Joystick Antennas */}
        <line
          x1="15"
          y1="13"
          x2="11.5"
          y2="5.5"
          stroke={antennaFill}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="11" cy="5.2" r="2.6" fill="#ff5f57" stroke="#000000" strokeWidth="1.5" />

        <line
          x1="29"
          y1="13"
          x2="32.5"
          y2="5.5"
          stroke={antennaFill}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="33" cy="5.2" r="2.6" fill="#b7c6c2" stroke="#000000" strokeWidth="1.5" />

        {/* Controller Side Grips / Ears */}
        <rect x="2.5" y="18" width="6" height="12" rx="3" fill="#b7c6c2" stroke="#000000" strokeWidth="1.8" />
        <rect x="35.5" y="18" width="6" height="12" rx="3" fill="#b7c6c2" stroke="#000000" strokeWidth="1.8" />

        {/* Rounded Arcade Screen Face */}
        <rect
          x="6.5"
          y="12"
          width="31"
          height="25"
          rx="7"
          fill={bodyFill}
          stroke="#000000"
          strokeWidth="2.2"
        />

        {/* Big Asymmetric Googly Eyes */}
        <circle cx="16.5" cy="22" r="5" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
        <circle cx="28" cy="21" r="5.6" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
        <circle cx="18" cy="22.8" r="2.1" fill="#000000" />
        <circle cx="26.3" cy="20.2" r="2.3" fill="#000000" />
        <circle cx="17.3" cy="21.4" r="0.8" fill="#ffffff" />
        <circle cx="25.6" cy="18.9" r="0.8" fill="#ffffff" />

        {/* Cheeky Grin + Tongue */}
        <path
          d="M14.5 29.5 Q22 34.5 29.5 29.5"
          fill="none"
          stroke="#000000"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M22.5 31.2 C22.5 35.3, 27.3 35.3, 27.3 30.6"
          fill="#ff5f57"
          stroke="#000000"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  );
};
