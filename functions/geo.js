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

const getHeader = (headers, name) => {
  if (!headers) return undefined;
  const direct = headers[name];
  if (typeof direct === 'string') return direct;
  const lower = headers[name.toLowerCase()];
  if (typeof lower === 'string') return lower;
  return undefined;
};

const normalizeCountry = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length !== 2) return null;
  return trimmed.toUpperCase();
};

exports.handler = async (event, context) => {
  // Netlify may provide geo info via context.geo or via headers, depending on runtime.
  const contextCountry =
    context?.geo?.country?.code ||
    context?.geo?.country_code ||
    context?.geo?.country ||
    context?.geo?.countryCode ||
    null;

  const headerCountry =
    getHeader(event?.headers, 'x-country') ||
    getHeader(event?.headers, 'x-nf-country') ||
    getHeader(event?.headers, 'x-nf-geo-country') ||
    getHeader(event?.headers, 'cf-ipcountry') ||
    getHeader(event?.headers, 'x-vercel-ip-country') ||
    null;

  const country = normalizeCountry(contextCountry || headerCountry);
  const isEu = country ? EU_EEA_UK_COUNTRIES.has(country) : false;

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify({ country, isEu }),
  };
};
