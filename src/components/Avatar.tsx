import React, { useEffect, useState } from 'react';
import { localAvatar } from '../utils/localAvatar';

interface AvatarProps {
  /** The stored avatar (data URI or URL). Missing/blank ⇒ generated initials. */
  src?: string | null;
  /** Used for the alt text AND to build the initials fallback. */
  name: string;
  className?: string;
}

/**
 * The one place a person's picture is rendered.
 *
 * A missing `avatarUrl` — or one that fails to load (an old external
 * `ui-avatars.com` link, a stale URL on a machine with no internet) — used to
 * leave the browser's broken-image icon with the person's name beside it.
 * Here it always resolves to the offline initials avatar instead.
 */
export const Avatar: React.FC<AvatarProps> = ({ src, name, className = 'w-full h-full' }) => {
  const fallback = localAvatar(name || 'User');
  const initial = src && src.trim() ? src : fallback;
  const [resolved, setResolved] = useState(initial);

  // A different person (or a freshly uploaded picture) must drop the old failure.
  useEffect(() => { setResolved(initial); }, [initial]);

  return (
    <img
      src={resolved}
      alt={name}
      className={`block aspect-square shrink-0 object-cover ${className}`}
      referrerPolicy="no-referrer"
      onError={() => { if (resolved !== fallback) setResolved(fallback); }}
    />
  );
};

export default Avatar;
