import defaults from '../../src-tauri/default-config.json';

export interface Config {
  /** Station name as SL spells it (e.g. "Ektorps centrum"), or an SL site id. */
  origin: string | number;
  /** Where you're going; only departures that reach this station directly are shown. */
  destination: string | number;
  /** Optional manual line filter (e.g. ["471", "409"]); skips route discovery when set. */
  lines: string[];
  rows: number;
  width: number;
  dotPitch: number;
  refreshSeconds: number;
  testData: boolean;
}

export const DEFAULT_CONFIG: Config = defaults;

export const isTauri = '__TAURI_INTERNALS__' in window;

export async function loadConfig(): Promise<Config> {
  let raw: Partial<Config> = {};
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    raw = JSON.parse(await invoke<string>('load_config'));
  } else {
    // In a plain browser, allow overrides via the URL: ?test&origin=Slussen&rows=3
    const q = new URLSearchParams(location.search);
    if (q.has('test')) raw.testData = true;
    if (q.get('origin')) raw.origin = q.get('origin')!;
    if (q.get('destination')) raw.destination = q.get('destination')!;
    if (q.get('lines')) raw.lines = q.get('lines')!.split(',');
    if (q.get('rows')) raw.rows = Number(q.get('rows'));
    if (q.get('width')) raw.width = Number(q.get('width'));
    if (q.get('pitch')) raw.dotPitch = Number(q.get('pitch'));
  }
  return { ...DEFAULT_CONFIG, ...raw };
}
