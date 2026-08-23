import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';

interface CustomerAvatarProps {
  customerId: number;
  name: string | null;
  hasPhoto: boolean;
  size?: 'sm' | 'lg';
}

const photoCache = new Map<number, string | null>();

export function CustomerAvatar({
  customerId,
  name,
  hasPhoto,
  size = 'sm',
}: CustomerAvatarProps): JSX.Element {
  const { t } = useTranslation('customers');
  const { sessionId } = useAuth();
  const [photoUrl, setPhotoUrl] = useState<string | null>(() =>
    hasPhoto ? (photoCache.get(customerId) ?? null) : null,
  );

  useEffect(() => {
    if (!hasPhoto || !sessionId) {
      setPhotoUrl(null);
      return;
    }

    const cached = photoCache.get(customerId);
    if (cached !== undefined) {
      setPhotoUrl(cached);
      return;
    }

    let cancelled = false;

    void window.api.customers.getPhoto({ sessionId, id: customerId }).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok || !result.data) {
        photoCache.set(customerId, null);
        setPhotoUrl(null);
        return;
      }

      const url = `data:${result.data.mimeType};base64,${result.data.dataBase64}`;
      photoCache.set(customerId, url);
      setPhotoUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [customerId, hasPhoto, sessionId]);

  const initials = getInitials(name);
  const className = size === 'lg' ? 'customer-avatar customer-avatar-lg' : 'customer-avatar';

  if (photoUrl) {
    return <img className={className} src={photoUrl} alt={name ?? t('noName')} />;
  }

  return (
    <span className={`${className} customer-avatar-fallback`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function invalidateCustomerPhotoCache(customerId: number): void {
  photoCache.delete(customerId);
}

function getInitials(name: string | null): string {
  if (!name) {
    return '?';
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) : undefined;
  return `${first ?? '?'}${second ?? ''}`.toUpperCase();
}
