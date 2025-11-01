import statesModel from '@/modules/countries/models/states.model';
import { Elysia } from 'elysia';
import { ip } from 'elysia-ip';
import { LRUCache } from 'lru-cache';

interface GeolocationData {
  country: string;
  countryCode: string;
  state: string;
  stateCode: string;
  city: string;
  zipcode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  stateId?: string;
  countryId?: string;
  clientIp?: string; // Optional for debugging
}

const geolocationCache = new LRUCache<string, GeolocationData>({
  max: 100000,
  ttl: 1000 * 60 * 60 * 24 * 7,
});

function isLocalIp(ip?: string | null) {
  return (
    !ip ||
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.')
  );
}

function normalizeV4Mapped(ip: string) {
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return v4[1];
  if (ip === '::1') return '127.0.0.1';
  return ip.replace(/^\[|\]$/g, '');
}

// Resolve client IP from headers or plugin
function resolveClientIp(request: Request | undefined, pluginIp?: string | null): string | null {
  const h = request?.headers;
  const xff = h?.get('x-forwarded-for')?.split(',')[0]?.trim(); // first IP in list
  const realIp =
    h?.get('x-real-ip') ||
    h?.get('cf-connecting-ip') ||
    h?.get('fastly-client-ip') ||
    h?.get('fly-client-ip');
  const forwarded = h?.get('forwarded'); // e.g. for=203.0.113.195;proto=https;by=...
  const forwardedIp = forwarded?.match(/for="?(\[?[A-Fa-f0-9:.]+\]?)/)?.[1];

  const candidate = xff || realIp || forwardedIp || pluginIp || null;
  return candidate ? normalizeV4Mapped(candidate) : null;
}

async function fetchFromIpgeolocation(ip: string): Promise<GeolocationData | null> {
  const key = process.env.GEOLOCATION_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.ipgeolocation.io/ipgeo?apiKey=${key}&ip=${ip}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.country_name) return null;
  return {
    country: data.country_name,
    countryCode: data.country_code2,
    state: data.state_prov,
    stateCode: data?.state_code?.split('-')?.[1] || '',
    city: data.city,
    zipcode: data.zipcode || '',
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    timezone: data?.time_zone?.name || '',
  };
}

async function fetchFromIpapi(ip: string): Promise<GeolocationData | null> {
  const res = await fetch(`https://ipapi.co/${ip}/json/`, { headers: { 'user-agent': 'rapidoride-backend' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.error) return null;
  return {
    country: data.country_name || '',
    countryCode: data.country || '',
    state: data.region || '',
    stateCode: data.region_code || '',
    city: data.city || '',
    zipcode: data.postal || '',
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    timezone: data.timezone || '',
  };
}

async function fetchFromIpwhois(ip: string): Promise<GeolocationData | null> {
  const res = await fetch(`https://ipwho.is/${ip}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.success) return null;
  const tz = (data.timezone && (data.timezone.id || data.timezone)) || '';
  return {
    country: data.country || '',
    countryCode: data.country_code || '',
    state: data.region || '',
    stateCode: data.region_code || '',
    city: data.city || '',
    zipcode: data.postal || '',
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    timezone: tz,
  };
}

async function resolveGeo(ip: string): Promise<GeolocationData | null> {
  // Try providers in order
  let result = await fetchFromIpgeolocation(ip);
  if (result) return result;

  result = await fetchFromIpapi(ip);
  if (result) return result;

  result = await fetchFromIpwhois(ip);
  if (result) return result;

  return null;
}

export const geolocationPlugin = new Elysia({ name: 'geoLocation' })
  .use(ip())
  .derive({ as: 'scoped' }, async ({ ip, request }) => {
    // Prefer header-provided IP (so Postman can set X-Forwarded-For), fall back to plugin ip
    let clientIp = resolveClientIp(request, typeof ip === 'string' ? ip : null);

    // If running locally or missing IP, try to use explicit header/env fallback
    if (!clientIp || isLocalIp(clientIp)) {
      const headerFallback = request?.headers
        ?.get('x-forwarded-for')
        ?.split(',')[0]
        ?.trim();
      const envFallback = process.env.GEOLOCATION_TEST_IP;

      const picked = headerFallback || envFallback || '134.153.14.198';
      clientIp = picked ? normalizeV4Mapped(picked) : '';
    }

    if (!clientIp) return { userLocation: null };

    // Cache by the effective IP we resolved
    const cached = geolocationCache.get(clientIp);
    if (cached) return { userLocation: cached };

    try {
      let userLocation = await resolveGeo(clientIp);

      // Enrich with state/country ObjectIds if we could resolve
      if (userLocation) {
        const stateData = await statesModel
          .findOne({ countryCode: userLocation.countryCode, stateCode: userLocation.stateCode })
          .select('country name stateCode')
          .lean();

        userLocation = {
          ...userLocation,
          stateId: stateData?._id ? stateData._id.toString() : '',
          countryId: stateData?.country ? stateData.country.toString() : '',
          clientIp
        };
      }

      if (userLocation) geolocationCache.set(clientIp, userLocation);
      return { userLocation: userLocation || null };
    } catch {
      return { userLocation: null };
    }
  });