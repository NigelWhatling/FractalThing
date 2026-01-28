import { useEffect, useMemo, useState } from 'react';

export type GeoStatus = 'pending' | 'ready';

export type GeoInfo = {
  status: GeoStatus;
  country: string | null;
  isEu: boolean;
};

const GEO_CACHE_KEY = 'fractal:geo';
const GEO_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const EU_EEA_UK_COUNTRIES = new Set([
  // EU
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  // EEA (non-EU)
  'IS',
  'LI',
  'NO',
  // UK
  'GB',
  'UK',
]);

export const isEuEeaUkCountry = (country: string | null | undefined) => {
  if (!country) return false;
  const code = country.trim().toUpperCase();
  if (code.length !== 2) return false;
  return EU_EEA_UK_COUNTRIES.has(code);
};

const normaliseCountry = (value: unknown) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length !== 2) return null;
  return trimmed.toUpperCase();
};

const getDevOverride = (): GeoInfo | null => {
  const forced = import.meta.env.VITE_FORCE_EU;
  if (forced && /^(1|true|yes)$/i.test(forced)) {
    const overrideCountry =
      normaliseCountry(import.meta.env.VITE_EU_COUNTRY) ?? 'DE';
    return { status: 'ready', country: overrideCountry, isEu: true };
  }

  const overrideCountry = normaliseCountry(import.meta.env.VITE_EU_COUNTRY);
  if (overrideCountry) {
    return {
      status: 'ready',
      country: overrideCountry,
      isEu: isEuEeaUkCountry(overrideCountry),
    };
  }

  return null;
};

const readCachedGeo = (): Omit<GeoInfo, 'status'> | null => {
  if (!('localStorage' in globalThis)) return null;
  try {
    const raw = globalThis.localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      at?: number;
      country?: string | null;
      isEu?: boolean;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > GEO_CACHE_TTL_MS) return null;
    const country = normaliseCountry(parsed.country) ?? null;
    const isEu = Boolean(parsed.isEu);
    return { country, isEu };
  } catch {
    return null;
  }
};

const writeCachedGeo = (value: Omit<GeoInfo, 'status'>) => {
  if (!('localStorage' in globalThis)) return;
  try {
    globalThis.localStorage.setItem(
      GEO_CACHE_KEY,
      JSON.stringify({
        at: Date.now(),
        country: value.country,
        isEu: value.isEu,
      }),
    );
  } catch {
    // ignore
  }
};

let geoRequest: Promise<Omit<GeoInfo, 'status'>> | null = null;

const fetchGeo = async (): Promise<Omit<GeoInfo, 'status'>> => {
  const response = await fetch('/.netlify/functions/geo', {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Geo request failed');
  }
  const payload = (await response.json()) as {
    country?: unknown;
    isEu?: unknown;
  };
  const country = normaliseCountry(payload?.country) ?? null;
  const isEu =
    typeof payload?.isEu === 'boolean'
      ? payload.isEu
      : country
        ? isEuEeaUkCountry(country)
        : false;
  const result = { country, isEu };
  writeCachedGeo(result);
  return result;
};

export const useGeo = (enabled = true): GeoInfo => {
  const override = useMemo(() => getDevOverride(), []);
  const cached = useMemo(() => readCachedGeo(), []);
  const initial = useMemo<GeoInfo>(() => {
    if (!enabled) return { status: 'ready', country: null, isEu: false };
    if (override) return override;
    if (cached) return { status: 'ready', ...cached };
    return { status: 'pending', country: null, isEu: false };
  }, [cached, enabled, override]);

  const [geo, setGeo] = useState<GeoInfo>(initial);

  useEffect(() => {
    if (!enabled) return;
    if (override) return;
    if (geo.status !== 'pending') return;
    let cancelled = false;

    geoRequest ??= fetchGeo();
    geoRequest
      .then((result) => {
        geoRequest = null;
        if (cancelled) return;
        setGeo({ status: 'ready', ...result });
      })
      .catch(() => {
        geoRequest = null;
        if (cancelled) return;
        setGeo({ status: 'ready', country: null, isEu: false });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, geo.status, override]);

  return geo;
};
