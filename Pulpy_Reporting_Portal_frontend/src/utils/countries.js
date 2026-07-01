import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(enLocale);

function buildCountryList() {
  const namesByCode = countries.getNames('en', { select: 'official' });

  const list = Object.entries(namesByCode)
    .map(([code, name]) => ({ code, name }))
    .filter(({ code }) => typeof code === 'string' && code.length === 2)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Backward-compat alias: this app historically used "UK"
  // (ISO is "GB", but existing offers may store "UK").
  list.unshift({ code: 'UK', name: 'United Kingdom' });

  // Preserve the existing UX escape-hatch
  list.push({ code: 'CUSTOM', name: 'Custom' });

  // De-duplicate (in case a locale includes "UK" in future)
  const seen = new Set();
  return list.filter(({ code }) => (seen.has(code) ? false : (seen.add(code), true)));
}

export const OFFER_COUNTRIES = buildCountryList();

/** Short list for advertiser / publisher forms (subset + custom). */
export const ADVERTISER_COUNTRY_OPTIONS = [
    { code: 'US', name: 'United States' },
    { code: 'UK', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'IN', name: 'India' },
    { code: 'AU', name: 'Australia' },
    { code: 'JP', name: 'Japan' },
    { code: 'BR', name: 'Brazil' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'CN', name: 'China' },
    { code: 'RU', name: 'Russia' },
    { code: 'IT', name: 'Italy' },
    { code: 'ES', name: 'Spain' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'SE', name: 'Sweden' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'SG', name: 'Singapore' },
    { code: 'MX', name: 'Mexico' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'CUSTOM', name: 'Custom' },
];

