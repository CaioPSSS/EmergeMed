import React from 'react';

interface EmergeMedLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function EmergeMedLogo({ size = 32, className, style }: EmergeMedLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
      aria-label="EmergeMed Logo"
      role="img"
    >
      <rect width="64" height="64" rx="14" fill="#0B1220" />
      <rect x="26" y="10" width="12" height="44" rx="3" fill="#10B981" />
      <rect x="10" y="26" width="44" height="12" rx="3" fill="#10B981" />
      <polyline
        points="6,33 21,33 27,20 34,47 39,33 58,33"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default EmergeMedLogo;
