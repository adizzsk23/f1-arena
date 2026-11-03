import { useEffect, useState } from 'react';
import type { BrandAssets } from '@gx/render';
import { loadTrimmedLogo } from '@gx/render';
import inovxLogoUrl from '../../../assets/brand/inovx-logo.png';
import spektrumLogoUrl from '../../../assets/brand/spektrum-logo.png';

/** Owner-supplied logos (assets/brand/, see assets/CREDITS.md). */
export const BRAND: BrandAssets = { inovxLogoUrl, spektrumLogoUrl };

/** Logo cropped to its visible content (margins / white background removed) as a data URL. */
export function useTrimmedLogo(url: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadTrimmedLogo(url)
      .then((c) => alive && setSrc(c.toDataURL('image/png')))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url]);
  return src;
}

/** INOVX logo on a light chip + Spektrum logo, with text fallbacks while loading. */
export function BrandLockup({ height = 28, dark = true }: { height?: number; dark?: boolean }) {
  const inovx = useTrimmedLogo(BRAND.inovxLogoUrl);
  const spek = useTrimmedLogo(BRAND.spektrumLogoUrl);
  return (
    <div className="flex items-center gap-3">
      <div className="rounded bg-[#f4f6fb] px-2 py-1" style={{ height: height + 8 }}>
        {inovx ? (
          <img src={inovx} alt="INOVX" style={{ height }} className="block" />
        ) : (
          <span className="font-black tracking-widest text-[#0b1020]">INOVX</span>
        )}
      </div>
      <span className={dark ? 'text-white/40' : 'text-black/40'}>×</span>
      {spek ? (
        <img src={spek} alt="Spektrum" style={{ height }} className="block" />
      ) : (
        <span className="font-black tracking-widest text-[#a3d93b]">SPEKTRUM</span>
      )}
    </div>
  );
}
