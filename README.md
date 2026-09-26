# SL-tavla

A tiny always-on-top departure board for SL, drawn as an amber LED dot matrix like the
signs on the platforms. No window chrome — just a floating black rectangle.

```
471 Slussen      3 min
409 Slussen      6 min
```

Built with [Tauri 2](https://tauri.app) + Svelte 5. Runs on Windows, macOS and Linux.

## How it works

- **Stops** are looked up by name in SL's Transport API (`/v1/sites`).
- **Which buses go where you're going**: at startup (and hourly) the app asks SL's journey
  planner for direct trips origin → destination at a few points in time, and remembers
  each *line + terminus* it suggests (e.g. `471 → Slussen`).
- **Departures** are polled from the Transport API and filtered to those routes.

No API keys are needed.

## Configuration

The config file is created on first run. Open it from the tray icon → *Öppna inställningar*,
then *Ladda om* to apply.

| Key              | Default           | Meaning                                                    |
|------------------|-------------------|------------------------------------------------------------|
| `origin`         | `Nacka Forum`     | Stop to show departures from (SL name or site id)          |
| `destination`    | `Slussen`         | Only show departures that go directly here                 |
| `lines`          | `[]`              | Optional extra filter, e.g. `["471", "409"]`               |
| `rows`           | `2`               | Number of departures shown                                 |
| `width`          | `480`             | Width in pixels (long stop names scroll if they don't fit)  |
| `dotPitch`       | `3`               | Pixels per LED dot                                         |
| `refreshSeconds` | `30`              | How often departures are fetched                           |
| `testData`       | `false`           | Show fake departures instead of calling SL                 |

Drag the board with the left mouse button; its position is remembered.

## Development

Prerequisites: Node 22+, Rust (via [rustup](https://rustup.rs)) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm install
npm run tauri dev     # run the app
npm run tauri build   # installer for the current OS
```

The UI also runs in a plain browser with `npm run dev`. Configure it via the URL:
`http://localhost:1420/?test&rows=3&pitch=4&origin=Slussen&destination=Ektorps%20centrum`.

Releases for all three platforms are built by GitHub Actions when a `v*` tag is pushed.
