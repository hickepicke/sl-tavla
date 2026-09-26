<script lang="ts">
  import { onMount } from 'svelte';
  import { GLYPH_HEIGHT, measure } from './lib/font';
  import { FrameBuffer, LedPainter } from './lib/led';
  import { isTauri, loadConfig, type Config } from './lib/config';
  import {
    countdown,
    discoverRoutes,
    fetchDepartures,
    resolveSite,
    routeKey,
    TEST_DEPARTURES,
    type Departure,
    type Site,
  } from './lib/sl';

  const MARGIN_X = 2;
  const MARGIN_TOP = 2;
  const MARGIN_BOTTOM = 1;
  const ROW_GAP = 2;
  const ROUTE_REFRESH_MS = 60 * 60_000;

  let canvas: HTMLCanvasElement;

  let departures: Departure[] = [];
  /** Shown instead of departures while loading or when something is wrong. */
  let status: string | null = 'Hämtar…';

  function visible(cfg: Config, routes: Set<string>, all: Departure[], now: Date): Departure[] {
    return all
      .filter((d) => routes.has(routeKey(d.line, d.destination)))
      .filter((d) => cfg.lines.length === 0 || cfg.lines.includes(d.line))
      .filter((d) => d.time.getTime() > now.getTime() - 30_000)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  function render(fb: FrameBuffer, rows: number, t: number) {
    fb.clear();
    const now = new Date();
    const rowY = (r: number) => MARGIN_TOP + r * (GLYPH_HEIGHT + ROW_GAP);
    const right = fb.cols - MARGIN_X;

    if (status) {
      fb.marquee(status, MARGIN_X, right, rowY(0), t);
      return;
    }

    const shown = departures.slice(0, rows).map((d) => ({ ...d, when: countdown(d, now) }));
    // Size the columns so every row lines up, like the real signs.
    const lineW = Math.max(measure('888'), ...shown.map((d) => measure(d.line)));
    const timeW = Math.max(measure('9 min'), ...shown.map((d) => measure(d.when)));
    const destX = MARGIN_X + lineW + 5;
    const destEnd = right - timeW - 4;

    shown.forEach((d, r) => {
      const y = rowY(r);
      fb.text(d.line, MARGIN_X, y);
      fb.marquee(d.destination, destX, destEnd, y, t);
      fb.text(d.when, right - measure(d.when), y);
    });
  }

  onMount(() => {
    let stopped = false;
    const timers: number[] = [];

    (async () => {
      const cfg = await loadConfig();
      const cols = Math.floor(cfg.width / cfg.dotPitch);
      const rows = MARGIN_TOP + cfg.rows * GLYPH_HEIGHT + (cfg.rows - 1) * ROW_GAP + MARGIN_BOTTOM;

      if (isTauri) {
        const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
        const { listen } = await import('@tauri-apps/api/event');
        await getCurrentWindow().setSize(new LogicalSize(cols * cfg.dotPitch, rows * cfg.dotPitch));
        await listen('reload-config', () => location.reload());
      }

      // Paint loop: rasterise at ~20 fps but only touch the canvas when a dot changed.
      const painter = new LedPainter(canvas, cols, rows, cfg.dotPitch);
      const fb = new FrameBuffer(cols, rows);
      const prev = new FrameBuffer(cols, rows);
      let first = true;
      const start = performance.now();
      timers.push(
        window.setInterval(() => {
          render(fb, cfg.rows, (performance.now() - start) / 1000);
          if (first || !fb.equals(prev)) {
            painter.paint(fb);
            prev.copyFrom(fb);
            first = false;
          }
        }, 50),
      );

      if (cfg.testData) {
        const all = TEST_DEPARTURES(new Date());
        departures = all;
        status = null;
        return;
      }

      let origin: Site;
      let destination: Site;
      let routes = new Set<string>();
      let routesAt = 0;

      async function refresh() {
        try {
          if (!origin || !destination) {
            [origin, destination] = await Promise.all([resolveSite(cfg.origin), resolveSite(cfg.destination)]);
          }
          if (Date.now() - routesAt > ROUTE_REFRESH_MS) {
            // Accumulate: a line that ran earlier today is still a valid route.
            for (const k of await discoverRoutes(origin, destination)) routes.add(k);
            routesAt = Date.now();
          }
          const now = new Date();
          departures = visible(cfg, routes, await fetchDepartures(origin), now);
          status = departures.length ? null : `Inga avgångar ${origin.name} - ${destination.name}`;
        } catch (e) {
          // Keep showing stale departures on transient errors; only complain if we have nothing.
          if (departures.length === 0) status = `Fel: ${e instanceof Error ? e.message : e}`;
          console.error(e);
        }
      }

      await refresh();
      if (!stopped) timers.push(window.setInterval(refresh, cfg.refreshSeconds * 1000));
    })();

    return () => {
      stopped = true;
      timers.forEach(clearInterval);
    };
  });

  async function drag(e: MouseEvent) {
    if (!isTauri || e.button !== 0) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  }
</script>

<canvas bind:this={canvas} onmousedown={drag}></canvas>

<style>
  canvas {
    display: block;
    cursor: default;
  }
</style>
