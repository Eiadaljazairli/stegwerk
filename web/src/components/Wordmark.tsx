import { type CSSProperties } from 'react';

export const Wordmark = ({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  <span
    className={className === undefined ? 'wordmark' : `wordmark ${className}`}
    style={{ fontSize: `${String(size)}px` } as CSSProperties}
  >
    Stegwerk
  </span>
);
