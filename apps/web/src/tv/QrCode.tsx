import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: { dark: '#0b0620', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className="grid place-items-center rounded-2xl bg-white p-3"
      // Sized in rem so it scales with the TV screen (see useTvScale).
      style={{ width: `${(size + 24) / 16}rem`, height: `${(size + 24) / 16}rem` }}
    >
      {dataUrl && (
        <img
          src={dataUrl}
          style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
          alt={`QR code to join: ${value}`}
          data-testid="join-qr"
        />
      )}
    </div>
  );
}
