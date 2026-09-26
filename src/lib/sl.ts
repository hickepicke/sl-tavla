// Clients for SL's open APIs (no key needed):
//  - Transport API: stop lookup and realtime departures
//  - Journey planner: which lines go directly from origin to destination

const TRANSPORT = 'https://transport.integration.sl.se/v1';
const JOURNEY = 'https://journeyplanner.integration.sl.se/v2';

export interface Site {
  id: number;
  /** Global id as a string; the numbers exceed Number.MAX_SAFE_INTEGER. */
  gid: string;
  name: string;
}

export interface Departure {
  line: string;
  destination: string;
  /** Expected (or scheduled) departure time. */
  time: Date;
  /** SL's own display text, e.g. "Nu", "3 min", "11:34". */
  display: string;
  realtime: boolean;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

let sites: Promise<Site[]> | null = null;

function getSites(): Promise<Site[]> {
  sites ??= getText(`${TRANSPORT}/sites?expand=false`)
    .then((text) => JSON.parse(text.replace(/"gid"\s*:\s*(\d+)/g, '"gid":"$1"')) as Site[])
    .catch((e) => {
      sites = null;
      throw e;
    });
  return sites;
}

const norm = (s: string) => s.toLocaleLowerCase('sv').trim();

export async function resolveSite(query: string | number): Promise<Site> {
  const all = await getSites();
  const q = String(query).trim();
  if (/^\d+$/.test(q)) {
    const site = all.find((s) => s.id === Number(q));
    if (site) return site;
  }
  const n = norm(q);
  const site =
    all.find((s) => norm(s.name) === n) ??
    all.find((s) => norm(s.name).startsWith(n)) ??
    all.find((s) => norm(s.name).includes(n));
  if (!site) throw new Error(`Hittar inte ${q}`);
  return site;
}

/** Key identifying a line heading in a particular direction. */
export const routeKey = (line: string, destination: string) => `${line}|${norm(destination)}`;

interface Trip {
  journeys?: {
    legs: { transportation?: { disassembledName?: string; destination?: { name?: string } } }[];
  }[];
}

/**
 * Asks the journey planner for direct trips at a few points in time and
 * collects the line + terminus combinations it suggests.
 */
export async function discoverRoutes(origin: Site, destination: Site): Promise<Set<string>> {
  const found = new Set<string>();
  const now = Date.now();
  const offsets = [0, 20, 40, 60, 90];
  const results = await Promise.allSettled(
    offsets.map(async (min) => {
      const t = new Date(now + min * 60_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const params = new URLSearchParams({
        type_origin: 'any',
        name_origin: origin.gid,
        type_destination: 'any',
        name_destination: destination.gid,
        calc_number_of_trips: '3',
        max_changes: '0',
        itd_date: `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`,
        itd_time: `${pad(t.getHours())}${pad(t.getMinutes())}`,
      });
      return JSON.parse(await getText(`${JOURNEY}/trips?${params}`)) as Trip;
    }),
  );
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const j of r.value.journeys ?? []) {
      const rides = j.legs.map((l) => l.transportation).filter((t) => t?.disassembledName);
      if (rides.length !== 1) continue;
      const t = rides[0]!;
      if (t.destination?.name) found.add(routeKey(t.disassembledName!, t.destination.name));
    }
  }
  if (found.size === 0 && results.every((r) => r.status === 'rejected')) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  return found;
}

interface RawDeparture {
  destination: string;
  display: string;
  scheduled: string;
  expected?: string;
  state: string;
  line: { designation: string };
}

export async function fetchDepartures(site: Site): Promise<Departure[]> {
  const text = await getText(`${TRANSPORT}/sites/${site.id}/departures?forecast=120`);
  const data = JSON.parse(text) as { departures: RawDeparture[] };
  return data.departures.map((d) => ({
    line: d.line.designation,
    destination: d.destination,
    time: new Date(d.expected ?? d.scheduled),
    display: d.display,
    realtime: d.state === 'EXPECTED' && !!d.expected,
  }));
}

/** Formats time until departure the way SL's platform signs do. */
export function countdown(d: Departure, now: Date): string {
  const min = Math.floor((d.time.getTime() - now.getTime()) / 60_000);
  // SL shows a clock time for departures without realtime prediction and those far off.
  if (!d.realtime || min > 60) {
    return d.time.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }
  return min <= 0 ? 'Nu' : `${min} min`;
}

export const TEST_DEPARTURES = (now: Date): Departure[] =>
  [
    ['471', 'Slussen', 3],
    ['409', 'Slussen', 6],
    ['471', 'Slussen', 11],
    ['409', 'Slussen', 15],
    ['414', 'Slussen', 21],
  ].map(([line, destination, min]) => ({
    line: line as string,
    destination: destination as string,
    time: new Date(now.getTime() + (min as number) * 60_000 + 30_000),
    display: `${min} min`,
    realtime: true,
  }));
