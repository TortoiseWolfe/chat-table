# Contract: the overlay stream and the admin API (phase 4)

One `node:http` server serves both, on `HTTP_PORT` (default 8787). `compose.yaml` publishes it as
`127.0.0.1:8787:8787` only, so nothing outside the host machine can reach it by default (FR-027). A
host who wants another machine to see the overlay changes that line themselves.

## Overlay (OBS browser source, 1920x1080)

| Method and path | Response |
| ----------------- | ---------- |
| `GET /overlay` | `text/html`: `src/overlay/public/index.html` (loads `overlay.js`, `overlay.css`) |
| `GET /overlay/overlay.js`, `GET /overlay/overlay.css` | the static files, `cache-control: no-store` |
| `GET /overlay/events` | `text/event-stream` (below) |
| `GET /overlay/assets/<kind>/<key>` | the pack file named by `pack.assets[kind][key]`, `kind` in `map`, `art`, `sounds`; 404 otherwise. Paths are resolved inside the pack folder; any `..` or absolute path is a 404 |

### The event stream

```text
event: snapshot
data: {"view": OverlayView}

event: event
data: {"line": LogLine, "view": OverlayView}

: ping
```

- On connect the server sends one `snapshot` at once (US4 scenario 3: a reload shows the current
  state), then one `event` per log line as it is written, within 1 s (US4).
- A `: ping` comment every 15 s keeps OBS's browser from dropping the connection.
- The browser's `EventSource` reconnects by itself; the server ignores `Last-Event-ID` and sends a
  fresh `snapshot`.

### The view model (`src/overlay/view.ts`, pure)

```ts
export interface OverlayView {
  scene: { id: string; map: string | null };            // map = asset URL or null
  round: number; roundLimit: number;
  window: { endsAt: number; options: { n: number; label: string }[] } | null;  // turn timer
  phase: GameState['phase'];
  tokens: { who: string; name: string; art: string | null; holder: 'bot' | string;   // login when a viewer holds it
            wound: WoundLevel; woundIndex: number; out: boolean }[];             // seats then live NPCs
  initiative: { who: string; name: string; current: boolean }[];
  feed: { seq: number; text: string }[];                // last 8 lines, newest last
  dice: { who: string; skill: string; normal: number[]; special: number[]; cp: number[][];
          dropped: number[]; total: number; target: number | null; success: boolean | null } | null;
  specialDieName: string;
}
export function toView(state: GameState, pack: Pack, recent: LogLine[]): OverlayView
```

`woundIndex` is the level's position in `WOUND_ORDER` (0 = healthy), which the wound bar draws.
`dice` is the latest `roll` (plus its `check`, when one followed). Every element FR-026 names maps to
one field: map `scene.map`, tokens `tokens`, wound bars `tokens[].woundIndex`, initiative and turn
timer `initiative` and `window.endsAt`, action feed `feed`, dice `dice`.

## Admin dock (OBS custom dock)

| Method and path | Body | Effect |
| ----------------- | ------ | -------- |
| `GET /admin` | | `text/html`: `src/admin/public/index.html` |
| `GET /admin/api/state` | | `200 { phase, sceneId, round, seats: [{ index, character, holder }], waitlist: [login] }` |
| `POST /admin/api/start` | | `host start`; `202 {}` |
| `POST /admin/api/pause` | | `host pause`; `202 {}` |
| `POST /admin/api/stop` | | `host stop`; `202 {}` |
| `POST /admin/api/skip` | | `host skip`; `202 {}` |
| `POST /admin/api/kick` | `{ "login": "somelogin" }` | `host kick`; `202 {}`; `400` when `login` is missing |

- Every `/admin/api/*` call needs `Authorization: Bearer <ADMIN_KEY>`, else `401 {}`. A bad method is
  `405`, an unknown path `404`. Bodies are JSON, at most 4 KB (`413` above that).
- `ADMIN_KEY` is 32 random bytes as hex, made at start-up from `Deps.randomBytes`, and new on every
  start. It is never written to the data volume or `events.jsonl`; the runtime prints the dock URL
  once to stdout on start (so it is in `docker compose logs`, on the host machine only):
  `Admin dock: http://127.0.0.1:8787/admin#key=<ADMIN_KEY>`. The page reads the key from
  `location.hash` (a fragment never reaches the server or OBS's logs) and sends it as the header.
- `host` commands go through the same serial queue as chat (FR-017), so a button press and a chat
  command never race.
- `skip` moves the current scene to its `default` choice's target (or, in combat, to `win`), and
  emits `scene-entered` for the new scene.
