import type { VpnServer } from "./types";

// Static VPN server catalog. Ping/load are plausible static values.
export const VPN_SERVERS: VpnServer[] = [
  { id: "us-nyc", country: "United States", countryCode: "US", city: "New York", flag: "🇺🇸", ping: 38, load: 24, premium: false, servers: 1280 },
  { id: "us-lax", country: "United States", countryCode: "US", city: "Los Angeles", flag: "🇺🇸", ping: 52, load: 31, premium: false, servers: 980 },
  { id: "us-mia", country: "United States", countryCode: "US", city: "Miami", flag: "🇺🇸", ping: 61, load: 18, premium: true, servers: 640 },
  { id: "gb-lon", country: "United Kingdom", countryCode: "GB", city: "London", flag: "🇬🇧", ping: 44, load: 27, premium: false, servers: 1120 },
  { id: "de-fra", country: "Germany", countryCode: "DE", city: "Frankfurt", flag: "🇩🇪", ping: 33, load: 22, premium: false, servers: 1040 },
  { id: "nl-ams", country: "Netherlands", countryCode: "NL", city: "Amsterdam", flag: "🇳🇱", ping: 35, load: 19, premium: false, servers: 760 },
  { id: "fr-par", country: "France", countryCode: "FR", city: "Paris", flag: "🇫🇷", ping: 41, load: 26, premium: false, servers: 540 },
  { id: "ch-zur", country: "Switzerland", countryCode: "CH", city: "Zurich", flag: "🇨🇭", ping: 39, load: 14, premium: true, servers: 320 },
  { id: "se-sto", country: "Sweden", countryCode: "SE", city: "Stockholm", flag: "🇸🇪", ping: 47, load: 12, premium: true, servers: 280 },
  { id: "sg-sin", country: "Singapore", countryCode: "SG", city: "Singapore", flag: "🇸🇬", ping: 58, load: 33, premium: false, servers: 690 },
  { id: "jp-tok", country: "Japan", countryCode: "JP", city: "Tokyo", flag: "🇯🇵", ping: 64, load: 29, premium: false, servers: 820 },
  { id: "hk-hkg", country: "Hong Kong", countryCode: "HK", city: "Hong Kong", flag: "🇭🇰", ping: 67, load: 41, premium: true, servers: 410 },
  { id: "au-syd", country: "Australia", countryCode: "AU", city: "Sydney", flag: "🇦🇺", ping: 88, load: 23, premium: false, servers: 530 },
  { id: "ca-tor", country: "Canada", countryCode: "CA", city: "Toronto", flag: "🇨🇦", ping: 42, load: 20, premium: false, servers: 470 },
  { id: "in-mum", country: "India", countryCode: "IN", city: "Mumbai", flag: "🇮🇳", ping: 71, load: 36, premium: false, servers: 390 },
  { id: "ae-dxb", country: "UAE", countryCode: "AE", city: "Dubai", flag: "🇦🇪", ping: 79, load: 28, premium: true, servers: 260 },
  { id: "br-sao", country: "Brazil", countryCode: "BR", city: "São Paulo", flag: "🇧🇷", ping: 96, load: 34, premium: false, servers: 310 },
  { id: "za-jnb", country: "South Africa", countryCode: "ZA", city: "Johannesburg", flag: "🇿🇦", ping: 112, load: 17, premium: true, servers: 180 },
  { id: "kr-seo", country: "South Korea", countryCode: "KR", city: "Seoul", flag: "🇰🇷", ping: 73, load: 25, premium: false, servers: 440 },
  { id: "es-mad", country: "Spain", countryCode: "ES", city: "Madrid", flag: "🇪🇸", ping: 49, load: 21, premium: false, servers: 360 },
];

// Plausible per-country exit IP prefixes (for display only)
export const IP_PREFIX: Record<string, string> = {
  US: "104.28",
  GB: "185.61",
  DE: "193.176",
  NL: "89.39",
  FR: "51.91",
  CH: "194.50",
  SE: "46.246",
  SG: "103.106",
  JP: "154.11",
  HK: "45.125",
  AU: "103.23",
  CA: "192.99",
  IN: "103.94",
  AE: "91.102",
  BR: "179.51",
  ZA: "102.130",
  KR: "175.45",
  ES: "185.93",
};

export function generateExitIp(countryCode: string): string {
  const prefix = IP_PREFIX[countryCode] ?? "10.8";
  const a = Math.floor(Math.random() * 200) + 20;
  const b = Math.floor(Math.random() * 200) + 5;
  return `${prefix}.${a}.${b}`;
}
