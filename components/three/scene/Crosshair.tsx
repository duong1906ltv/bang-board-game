"use client";

// The green scope players tap to pick a card or a target. Its own file because both
// Cards and Players draw one, and putting it in either would make them import each
// other in a circle.

export function Crosshair({ size, color, fill, stroke }: { size: number; color: string; fill: string; stroke: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx="50" cy="50" r="34" fill={fill} stroke={color} strokeWidth={stroke} />
      <line x1="50" y1="8" x2="50" y2="28" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      <line x1="50" y1="72" x2="50" y2="92" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      <line x1="8" y1="50" x2="28" y2="50" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      <line x1="72" y1="50" x2="92" y2="50" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx="50" cy="50" r="6" fill={color} />
    </svg>
  );
}
