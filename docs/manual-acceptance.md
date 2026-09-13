# Manual acceptance checklists

Run these on each target OS (Windows, macOS) before calling a phase done. Record the OS, Chrome
version and date in the sign-off tables. The Phase 2 checklist is
[further down](#phase-2-search-planning).

# Phase 1: core browser automation shell

Most of this flow is also automated: `pnpm test:integration` covers A, B, C, E and F, plus an
offline D. `ATLAS_RUN_NETWORK_TESTS=1 pnpm test:integration` adds the real Wikipedia D. The manual
pass checks that a human sees the same thing in a real session.

## Preparation

- [ ] Google Chrome is installed.
- [ ] `node --version` is 22.13 or newer.
- [ ] `pnpm install` has completed.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` all pass.
- [ ] Optional: to start from a clean slate, quit Atlas and delete `<userData>` (see README, "Where
      data is stored"). **Skip this when repeating the checklist, as test E relies on existing
      data.**

## TEST A: start Atlas Agent

1. Run `pnpm dev` (or `pnpm start`).

Expected:

- [ ] The desktop window titled **Atlas Agent** opens.
- [ ] Agent Status shows **Idle**.
- [ ] Browser Status shows **Not Running**.
- [ ] Extension Status shows **Disconnected**.
- [ ] The Activity panel shows `Agent started` and `Local agent server listening on 127.0.0.1:47821`.
- [ ] **Run Task** is disabled.

## TEST B: launch the Agent Browser

1. Click **Launch Agent Browser**.

Expected:

- [ ] A Google Chrome window opens, with the infobar "Chrome is being controlled by automated test
      software".
- [ ] It is **not** your normal profile: none of your usual bookmarks, extensions or sign-ins.
- [ ] `chrome://version` in that window shows **Profile Path** ending in
      `Atlas Agent\browser-profile\Default` (Windows) or `Atlas Agent/browser-profile/Default` (macOS).
- [ ] The desktop shows Browser Status **Running**.
- [ ] The Activity panel shows `Launching Chrome with the dedicated Atlas profile`, `Chrome launched`
      and `Browser launched`.

## TEST C: the extension connects

1. First time only: in the Agent Browser, open `chrome://extensions`, enable **Developer mode**,
   click **Load unpacked**, and choose `<repo>/extension/dist`.
2. Check that the card shows ID `hhkcbmdmobniaagpjgcfnihickadngij`.

Expected:

- [ ] Within a few seconds the desktop shows Extension Status **Connected**, and the Activity panel
      shows `Extension connected`.
- [ ] Clicking the Atlas toolbar icon (pin it via the puzzle icon) opens a popup with
      **Desktop Agent: Connected**, the current page title and its URL.
- [ ] The extension card lists only "Read your browsing history" (from `tabs`). No site access is
      requested.

## TEST D: run the Wikipedia task

1. In the desktop window, enter `Open wikipedia.org and search for Alan Turing`.
2. Click **Run Task**.

Expected:

- [ ] Agent Status shows **Running** while the task runs, then **Idle**.
- [ ] Chrome navigates to wikipedia.org, types "Alan Turing" into the search box and submits.
- [ ] Chrome ends on the **Alan Turing** Wikipedia article (or search results listing it).
- [ ] The Activity panel shows, in order:
      `Task received: Open wikipedia.org and search for Alan Turing` → `Opening wikipedia.org` →
      `Searching for Alan Turing` → `Submitting search` → `Task completed: Alan Turing - Wikipedia`.
- [ ] A green notice shows `Task completed: …`.
- [ ] The extension popup's **Last Task** shows `COMPLETED: Open wikipedia.org and search for Alan Turing`.
- [ ] `pnpm db:inspect` shows the task with status `COMPLETED`, `started_at` and `completed_at` set,
      `ACTION_STARTED`/`ACTION_COMPLETED` events whose last URL is the Alan Turing article, and
      `Checkpoints stored` > 0.

Negative check:

- [ ] Running `Order a pizza` shows a red notice listing the supported commands, Agent Status
      **Error**, and `pnpm db:inspect` shows that task as `FAILED` with the message.

## TEST E: profile reuse across restarts

1. In the Agent Browser, sign in to any site you use that keeps you signed in (or open a site and
   change a preference that it remembers).
2. Quit Atlas: close the window on Windows, or press Cmd+Q on macOS. Chrome closes too.
3. Check that `<userData>/logs/atlas.log` ends with `Agent stopped`, and `pnpm db:inspect` shows the
   latest agent run as `STOPPED`.
4. Start Atlas again and click **Launch Agent Browser**.

Expected:

- [ ] Browser Status shows **Running**.
- [ ] The Atlas extension is still installed and reconnects: **Extension: Connected**.
- [ ] Revisiting the site from step 1 shows you are **still signed in** (unless that site's session
      has expired), or the preference is kept.
- [ ] `chrome://version` shows the same Profile Path as in TEST B.

## TEST F: extension reconnects after Atlas restarts

Quitting Atlas also closes the Agent Browser. To have the extension running while Atlas is down,
open Chrome yourself on the Atlas profile:

1. Quit Atlas.
2. Start Chrome manually with the Atlas profile:
   - Windows (PowerShell):
     `& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:APPDATA\Atlas Agent\browser-profile"`
   - macOS:
     `open -na "Google Chrome" --args --user-data-dir="$HOME/Library/Application Support/Atlas Agent/browser-profile"`
3. Open the Atlas extension popup.
4. Start Atlas (`pnpm dev`). Do **not** click Launch Agent Browser; the profile is already open.
5. Quit Atlas again, wait a few seconds, then start it once more.

Expected:

- [ ] At step 3 the popup shows **Desktop Agent: Disconnected** (or **Connecting…**).
- [ ] After step 4 the desktop shows **Extension: Connected** within about 15 seconds, and the popup
      shows **Connected**, without reloading the extension.
- [ ] After step 5 the extension disconnects while Atlas is down and connects again by itself.
- [ ] Clicking **Launch Agent Browser** now fails with "The Atlas browser profile is already in
      use…". This is expected; close the manual Chrome window to continue.

## Shutdown and safety spot checks

- [ ] While Chrome is open, closing the Chrome window by hand turns Browser Status to **Disconnected**;
      **Launch Agent Browser** starts it again.
- [ ] `<userData>/logs/atlas.log` contains no cookie values, passwords or tokens. Search it for
      `cookie`, `password` and `token`: any matches must be `[REDACTED]`.
- [ ] Opening `http://127.0.0.1:47821` in a normal browser tab does not connect. The log shows
      `Rejected WebSocket connection from disallowed origin` (or the request simply fails).

## Sign-off

| OS / version | Chrome version | Tester | Date | A   | B   | C   | D   | E   | F   |
| ------------ | -------------- | ------ | ---- | --- | --- | --- | --- | --- | --- |
|              |                |        |      |     |     |     |     |     |     |

# Phase 2: search planning

Phase 2 plans and stores search work only. **No step below should open, search or scrape any
website.** `pnpm test:integration` automates this flow (the Electron "Phase 2" test and
`search-planning.int.test.ts`); the manual pass checks it in a real session.

## P2-1: Phase 1 still works

1. Run `pnpm dev`.

Expected:

- [ ] The window opens on the **Agent** tab with **Idle**, **Not Running** and **Disconnected**.
- [ ] Phase-1 tests A–F above still pass (at least: launch the Agent Browser and run
      `Open wikipedia.org and search for Alan Turing`).

## P2-2: create and plan the test campaign

1. Open the **Search Campaigns** tab.
2. Click **Create Test Campaign**.
3. Click **Generate Search Plan**.

Expected:

- [ ] After step 2, the campaign list shows **Transcript Search Test** (status **Draft**). Its details
      show countries **Canada, United Kingdom, USA**, education levels **Diploma, Bachelor's
      Degree, Master's Degree**, source **Scribd** and **10 transcript keywords**.
- [ ] After step 3, the status becomes **Planned** and a green notice reads "Search plan generated:
      … unique queries, … new jobs."
- [ ] The summary shows non-zero **Institutions**, **Unique Queries** and **Search Jobs**
      (with the fixture data: 3 countries, 14 institutions, 217 queries, 217 jobs). **Duplicates
      Removed** is shown (0 for this campaign).
- [ ] **Progress** shows every job as **Pending**, with 0 running, completed and failed.
- [ ] The country table lists **Canada**, **United Kingdom** and **USA** with job counts that add up
      to the total.
- [ ] Chrome is not launched, and the Activity log shows "Search plan generated for …" with no
      browser actions.

## P2-3: inspect the generated jobs

1. Scroll to **Search jobs** and click **Show more jobs** until the button disappears.

Expected:

- [ ] Jobs are ordered by priority (highest first); every job is **Pending** with source **Scribd**.
- [ ] The list includes queries like:
  - `Canada academic transcript`
  - `Canada diploma transcript`
  - `"University of Toronto" transcript`
  - `"University of Toronto" bachelor transcript`
  - `"University of Toronto" statement of results`
- [ ] No query appears twice.
- [ ] `pnpm db:inspect` shows the campaign with equal `queries`, `jobs`, `pending` and
      `distinct_hashes` values.

## P2-4: persistence across restarts

1. Close Atlas.
2. Start it again (`pnpm dev`) and open **Search Campaigns**.

Expected:

- [ ] **Transcript Search Test** is listed as **Planned**.
- [ ] Its summary, progress and job list match what was shown before the restart.

## P2-5: regenerate without duplicates

1. With the campaign selected, click **Generate Search Plan** again.

Expected:

- [ ] The notice reads "… 0 new jobs." and the summary line says the last run added 0 new queries
      and 0 new jobs.
- [ ] **Unique Queries** and **Search Jobs** are unchanged.
- [ ] `pnpm db:inspect` still shows `queries = jobs = distinct_hashes`.

## Phase 2 sign-off

| OS / version | Tester | Date | P2-1 | P2-2 | P2-3 | P2-4 | P2-5 |
| ------------ | ------ | ---- | ---- | ---- | ---- | ---- | ---- |
|              |        |      |      |      |      |      |      |
