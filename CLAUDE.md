# CLAUDE.md

Guidance for working in this repo. Read the [README](./README.md) for the product overview.

## What this is

"Who Is She" — a Kahoot-style party game. One big screen reveals a photo tile by tile; players join
from phones and guess the name; earlier correct guesses score more. Node.js (ES modules) + Express +
Socket.IO server, plain HTML/CSS/JS front end (no build step, no framework). Bilingual (Spanish
default, Chinese), switchable per device.

## ⚠️ Testing workflow — do this for EVERY feature

**After implementing or changing any feature, you must run the tests, and add/extend tests for what
you changed.** A feature is not "done" until both suites pass.

```bash
npm test          # node:test: unit (scoring, matching, game, i18n) + socket integration
npm run test:e2e  # Playwright headless: full game, 1 host + 3 players, asserts the real UI
```

Rules:
- **New game logic** (scoring, matching, state machine) → add/extend a `node:test` suite in `test/`.
  These are pure modules — test them directly, TDD style (write the failing test first).
- **New or changed UI/realtime behavior** (a new view, button, socket event, animation, what the
  phone shows when) → add an assertion to `scripts/e2e.mjs`. This is the safety net for the parts unit
  tests can't reach. The e2e drives 1 host + 3 phones through a whole game and checks the DOM.
- Both suites must be **green before you claim the work is complete or commit.** Don't describe
  behavior as working until you've run the test that proves it.
- The e2e and socket tests spawn their own server with an isolated `UPLOADS_DIR`, so they never touch
  the real `uploads/`. Keep it that way — never point a test at the real photo folder.

To eyeball a change in real browsers (not just assert it), `npm run demo` opens the big screen + three
phones and plays through live.

## Architecture

- **Pure logic, separately testable** — `server/scoring.js`, `server/matching.js`, `server/game.js`
  (the `GameState` machine) have no I/O. Keep them pure; that's why they're easy to unit-test.
- **The quiz is the `uploads/` folder.** `server/quizFromUploads.js` scans it and turns each image
  file into a question whose answer is the file name without its extension (`junjie.jpeg` → "junjie"),
  ordered by file name, with a default 4×4 grid / 3 s interval. There is no `quiz.json`. `/admin`
  uploads (preserving the original file name) and a DELETE endpoint are just convenience on top of the
  folder — you can also drop/remove files directly.
- **I/O lives in** `server/index.js` (Express routes, uploads, QR, Socket.IO wiring) and
  `server/quizFromUploads.js`. A single in-memory `GameState` serves one game.
- **Front end** — three independent pages under `public/`, each a classic `<script>` (not modules):
  `admin` (config), `host` (big screen), `play` (phone). They share `i18n.js` and `shared.css`.

### Socket protocol (client ↔ server)

Client → server: `player:join {nickname, clientId}`, `player:submit {guess}`, `host:start`,
`host:skip`, `host:next`, `host:restart`, `host:pause`, `host:resume`, `host:hello`.

Server → clients: `player:joined`, `player:result`, `lobby:update {players}`,
`game:countdown {from}`,
`round:start {index,total,photoUrl,nextPhotoUrl,grid,revealOrder,intervalMs}` (`nextPhotoUrl` lets the
big screen preload the next photo so tiles reveal with no load flash),
`round:reveal {revealedCount}`, `round:answered {answeredCount, nickname}`,
`round:end {answer, results, leaderboard}`, `game:pause {phase}`, `game:resume {phase}`,
`game:over {leaderboard}`, `game:reset`,
`state:full {phase, players, round, paused}` (host reconnect restore), `host:error {code}`.
Every `leaderboard`/`players` entry carries `{id, nickname, totalScore, connected}` — the host dims
`connected: false` rows.

Key behaviors to preserve when editing:
- **Players are keyed by a stable `clientId`** (persisted in the phone's localStorage), NOT the socket
  id — so a reconnecting phone keeps its identity and score. Don't revert this to `socket.id`.
- **Scores/correctness are hidden on the phone until the round closes.** At submit the phone only
  locks in and shows a "sent, watch the screen" status; correctness + points are revealed on
  `round:end` (and on the big-screen leaderboard). Don't leak the result at submit time.
- **3-2-1 countdown** is server-timed: `host:start` broadcasts `game:countdown`, waits 3s, then starts
  the round, so all clients begin together.
- **A round is ~20s** (16 tiles × 1250ms `DEFAULT_INTERVAL`) and ends early **as soon as every
  *connected* player has answered** (`game.everyoneAnswered()` → `finishRound`). The answer is
  revealed on the **big screen** (`#answer`), not the phones.
- **Photo order is randomized per game** — `host:start` calls `game.shuffleQuestions()` once (not in
  `buildQuiz`, which stays deterministic, so order is stable for the whole game).
- **The result screen auto-advances after 5s** (host-side timer → `host:next`); the Next button still
  works and cancels the timer.
- **Pause is server-authoritative.** The host's Pause button (shown during a round and the result
  screen) toggles `host:pause`/`host:resume`. While paused, `paused` is set in `server/index.js` (an
  I/O-layer flag — `GameState` stays pure): the reveal loop is stopped and `player:submit` is ignored.
  Clients freeze on `game:pause` (big-screen countdown ring, each phone's timer bar, phones disable
  the guess box) and resume from where they left off on `game:resume` — not from the start. Resuming
  REVEALING restarts the reveal interval at the same `revealedCount`; the result screen's 5s
  auto-advance freezes/continues. Any phase transition (`finishRound`, `host:next`, restart, new round)
  clears `paused`.
- **Localize via codes, not strings.** Server sends error/status *codes* (e.g. `empty_quiz`); the
  client translates with `t()`. Every UI string is a key in `i18n.js` — add new keys to **both** `es`
  and `zh` (they must stay at parity).

## Conventions

- ES modules everywhere; no transpiler/bundler. Match the existing terse, comment-light style.
- Render user-supplied text (nicknames, answers) with `textContent`/DOM nodes, never string-built
  `innerHTML` — this is a trusted-LAN tool but the XSS-safe pattern is already established; keep it.
- `uploads/` is git-ignored (per-event photos). Don't commit images.
- Commit only when asked. Branch work lives on `feat/who-is-she-game`.

## Run / restart notes

- `npm start` serves on `PORT` (default 3000). Static files are read per request, so front-end edits
  show up on a **page refresh** — no restart needed. Restart only after editing `server/*.js`.
- Game state is in memory; restarting the server clears players and returns to the lobby (the photos
  in `uploads/` persist on disk, so the quiz is unchanged).
