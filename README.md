# Atlas Agent

Atlas Agent is a desktop application that controls a dedicated, persistent Google Chrome
profile. It will grow into a reusable AI-powered browser automation platform.

**This repository is at Phase 1: the core browser automation shell.** It contains no AI or LLM
integration, no scraping and no site-specific automation beyond a small Wikipedia search demo
that exists only to exercise the infrastructure.

Phase 1 includes:

- Electron + React desktop app (sandboxed renderer, typed IPC)
- Playwright-driven Google Chrome with a dedicated persistent profile
- A localhost-only WebSocket server and a Manifest V3 Chrome extension that connects to it
- SQLite persistence for agent runs, tasks, browser events and checkpoints
- Structured, redacted logging to the UI and to rotating log files
- A deliberately small, deterministic command parser and a task runner

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together, and
[docs/manual-acceptance.md](docs/manual-acceptance.md) for the Phase 1 verification checklist.

---

## Requirements

| Requirement   | Version / notes                                                                      |
| ------------- | ------------------------------------------------------------------------------------ |
| OS            | Windows 10/11 or macOS 12+                                                           |
| Node.js       | **22.13 or newer** (tooling needs ≥ 22.13; the database uses built-in `node:sqlite`) |
| pnpm          | 10.x (`corepack enable` or `npm install -g pnpm`)                                    |
| Google Chrome | Installed normally (stable channel). Playwright does **not** download a browser.     |
| Git           | Any recent version                                                                   |

No C/C++ build tools are needed: the project has no native Node modules.

## Installation

```bash
git clone <repository-url> atlas-agent
cd atlas-agent
pnpm install
```

`pnpm install` downloads the Electron binary. pnpm only allows install scripts for the packages
listed under `onlyBuiltDependencies` in `pnpm-workspace.yaml`.

## Running the application

```bash
pnpm dev      # builds the extension, then starts Electron with hot reload for the UI
pnpm start    # production build + run the built app (electron-vite preview)
```

On start the window shows **Agent: Idle**, **Browser: Not Running**, **Extension: Disconnected**.

1. Click **Launch Agent Browser**. Google Chrome opens with the Atlas profile.
2. Load the extension once (see below). The status becomes **Extension: Connected**.
3. Type a command, for example `Open wikipedia.org and search for Alan Turing`, then click
   **Run Task**.

Chrome shows the infobar _"Chrome is being controlled by automated test software"_ while Atlas
controls it. This is expected and intentionally not hidden.

### Supported commands (Phase 1)

| Command                                            | What happens                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `Open <site>`                                      | Navigates to the site (`go to`, `navigate to` and `visit` also work) |
| `Open wikipedia.org and search for <query>`        | Opens the Wikipedia portal, types the query, presses Enter           |
| `Open <lang>.wikipedia.org and search for <query>` | Same, using that language's `Special:Search` page                    |

Any other command fails with a message listing the supported forms.

## Loading the Chrome extension

Google Chrome 137+ no longer supports loading extensions from the command line, so the extension
is installed once, by hand, **inside the Agent Browser**. Because the profile is persistent, it
stays installed across restarts.

1. Build it: `pnpm extension:build` (`pnpm dev` does this for you). The output is `extension/dist`.
2. Start Atlas and click **Launch Agent Browser**.
3. In that Chrome window, open `chrome://extensions`.
4. Turn on **Developer mode** (top-right).
5. Click **Load unpacked** and select the `extension/dist` folder of this repository.
6. The Atlas desktop window changes to **Extension: Connected** within a few seconds.

After rebuilding the extension, click the reload icon on its card in `chrome://extensions`.

The manifest contains a public `key`, so the extension ID is always
`hhkcbmdmobniaagpjgcfnihickadngij`. By default the desktop agent only accepts connections from
that ID. Other extensions, in any Chrome profile, are refused.

The extension requests only the `tabs` permission (to read the active tab's URL and title) and
the `alarms` permission (to retry the connection after the service worker is suspended). It has no
host permissions and no content scripts, and never reads page content.

## Where data is stored

Everything lives under Electron's `userData` directory (`app.getPath('userData')`):

| OS      | `userData`                                                             |
| ------- | ---------------------------------------------------------------------- |
| Windows | `%APPDATA%\Atlas Agent` (`C:\Users\<you>\AppData\Roaming\Atlas Agent`) |
| macOS   | `~/Library/Application Support/Atlas Agent`                            |

| What                     | Path                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| Dedicated Chrome profile | `<userData>/browser-profile`                                                      |
| SQLite database          | `<userData>/data/atlas.db` (+ `-wal`/`-shm` while running)                        |
| Log files                | `<userData>/logs/atlas.log`, rotated as `atlas.1.log` … `atlas.4.log` (5 MB each) |

- **Browser profile.** Atlas never uses your everyday Chrome profile and never deletes the Atlas
  profile. Sites you sign into in the Agent Browser stay signed in across Atlas restarts, until the
  site's own session expires. Chrome's normal OS-backed cookie encryption stays enabled. On macOS
  this can mean a one-time Keychain prompt for "Chrome Safe Storage". You can keep your normal
  Chrome open, but only one Chrome instance can use the Atlas profile at a time.
- **Database.** Migrations run automatically at start-up. Runs or tasks left unfinished by a crash
  are marked `ABORTED` or `FAILED` on the next start. Print recent tasks and events with:

  ```bash
  pnpm db:inspect                 # default location for this OS
  pnpm db:inspect path/to/atlas.db
  ```

- **Logs.** Logs are JSON lines. Passwords, cookies, tokens, `Authorization` headers and sensitive
  query parameters are redacted before anything is written. Text typed into pages is never logged,
  only its length.

## Configuration

All settings are optional environment variables.

| Variable                      | Default                 | Purpose                                                                                           |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `ATLAS_AGENT_PORT`            | `47821`                 | WebSocket port (always bound to `127.0.0.1`). **Set the same value when building the extension.** |
| `ATLAS_LOG_LEVEL`             | `debug` (dev) / `info`  | `debug`, `info`, `warn`, `error`                                                                  |
| `ATLAS_CHROME_EXECUTABLE`     | installed Google Chrome | Full path to a Chrome executable in a non-standard location                                       |
| `ATLAS_ALLOWED_EXTENSION_IDS` | the Atlas extension ID  | Comma-separated extension IDs allowed to connect, or `*` for any extension                        |
| `ATLAS_USER_DATA_DIR`         | Electron `userData`     | Use a different data root (tests, portable setups)                                                |

## Testing

```bash
pnpm test               # unit tests (fast, no browser, no network)
pnpm test:integration   # builds everything, then runs real-Chrome / Electron integration tests
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

`pnpm test:integration` opens real Chrome windows. It covers:

- **BrowserController:** launch, open a local test page, read the title, fill and submit a form,
  profile persistence across restarts, and detection of Chrome being closed externally.
- **Extension ↔ agent server:** the built extension is installed into real Chrome and checked for
  auto-connect, tab metadata, page changes, the popup, and reconnection after the server restarts.
- **Electron app:** the built app is driven through its UI for statuses, launch, a task, activity
  log, SQLite records, graceful shutdown, and profile reuse after an Atlas restart.

To install the extension in branded Chrome, the tests use the DevTools protocol
(`Extensions.loadUnpacked` with `--enable-unsafe-extension-debugging`). That flag exists **only in
test code**; the application never uses it.

| Variable                     | Effect                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| `ATLAS_SKIP_BROWSER_TESTS=1` | Skip every test that needs Chrome/Electron                       |
| `CI=true`                    | Browser tests are skipped unless `ATLAS_RUN_BROWSER_TESTS=1`     |
| `ATLAS_RUN_NETWORK_TESTS=1`  | Also run the real Wikipedia demo through the UI (needs internet) |
| `ATLAS_HEADLESS=1`           | Run the BrowserController suite headless                         |

Browser tests also skip themselves when Google Chrome is not installed.

## Scripts

| Script                         | Description                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| `pnpm dev`                     | Build extension, start the desktop app in dev mode                          |
| `pnpm start`                   | Build everything and run the production build                               |
| `pnpm build`                   | Build the extension (`extension/dist`) and desktop app (`apps/desktop/out`) |
| `pnpm extension:build`         | Build only the extension                                                    |
| `pnpm extension:watch`         | Rebuild the extension on change                                             |
| `pnpm test` / `test:watch`     | Unit tests                                                                  |
| `pnpm test:integration`        | Integration tests (see above)                                               |
| `pnpm typecheck`               | Strict TypeScript across all packages                                       |
| `pnpm lint` / `lint:fix`       | ESLint (type-aware)                                                         |
| `pnpm format` / `format:check` | Prettier                                                                    |
| `pnpm db:inspect`              | Print recent runs, tasks and events from SQLite                             |

## Repository layout

```
apps/desktop/          Electron app: main process, preload bridge, React renderer, shared IPC contract
packages/agent-protocol  Shared message schemas (zod) and state names
packages/logger          Structured logger, redaction, file/memory/console transports
packages/browser-core    BrowserController interface, actions, executor; Playwright implementation
packages/agent-server    Localhost WebSocket server for the extension
packages/database        node:sqlite driver, migrations, repositories
packages/command-parser  Phase-1 deterministic command parser
packages/agent-core      State machines, BrowserSession, TaskRunner, AgentService
extension/               Chrome MV3 extension (service worker + popup)
tests/integration/       Real-browser and Electron integration tests
docs/                    Architecture and manual acceptance checklist
scripts/                 Developer utilities
```

## Phase 1 limitations

- **No intelligence.** The command parser is deterministic and intentionally tiny: `open <site>`,
  plus search on Wikipedia only. It is not the future planner.
- **Manual extension install.** Branded Chrome dropped `--load-extension`, so the extension is
  loaded once through `chrome://extensions`.
- **The extension port is fixed at build time.** If you change `ATLAS_AGENT_PORT`, rebuild the
  extension with the same variable set.
- **One task at a time.** Cancellation happens between actions, for example at shutdown, not in
  the middle of a navigation.
- **One working tab.** Atlas acts in the tab it last used, or the most recently opened one. It does
  not manage multiple tabs or windows.
- **No packaging yet.** There are no installers, code signing or auto-update. Run from source with
  `pnpm dev` or `pnpm start`.
- **`node:sqlite` is marked experimental** in Node 22/24 and prints an `ExperimentalWarning`. It sits
  behind a small driver interface so it can be swapped out.
- **No data retention.** Browser events (including URLs of pages visited in the Agent Browser, with
  sensitive query parameters redacted) accumulate in the local database. Log files rotate; the
  database does not.
- **Demo selectors can go stale.** The Wikipedia demo depends on Wikipedia's current markup.
- **Verified on Windows 11 with Chrome 153.** macOS is supported by design (no OS-specific code,
  `node:path` and Electron path APIs throughout) but has not yet been run end to end.

## Troubleshooting

| Symptom                                       | Fix                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Google Chrome was not found`                 | Install Chrome, or set `ATLAS_CHROME_EXECUTABLE` to its full path.                                                                                                 |
| `The Atlas browser profile is already in use` | Close the Chrome window using the Atlas profile, or the other Atlas instance, and retry.                                                                           |
| `Atlas Agent must run inside Electron…`       | Your shell exports `ELECTRON_RUN_AS_NODE` (some editors do). Unset it.                                                                                             |
| Extension stays **Disconnected**              | Make sure it is loaded in the **Agent Browser**, built for the same `ATLAS_AGENT_PORT`, and check `<userData>/logs/atlas.log` for "Rejected WebSocket connection". |
| `Port 47821 on 127.0.0.1 is already in use`   | Another Atlas instance or program uses the port. Pick another port with `ATLAS_AGENT_PORT` and rebuild the extension.                                              |
