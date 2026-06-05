// scripts/demo.mjs — open the host big-screen + 3 phone windows and play a full game,
// so you can watch the page changes live. Requires the server running (npm start) and a
// quiz configured. Run: node scripts/demo.mjs
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3000'
const SLOW = Number(process.env.SLOWMO || 250)
const log = (...a) => console.log('[demo]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openWindow(x, y, w, h, url) {
  const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW,
    args: [`--window-position=${x},${y}`, `--window-size=${w},${h}`],
  })
  const page = await browser.newPage({ viewport: null })
  await page.goto(url)
  return { browser, page }
}

async function guess(phone, text) {
  await phone.page.fill('#guess', text)
  await phone.page.click('#submitBtn')
}

// Host across the top, three phones in a row below.
const host = await openWindow(0, 0, 1500, 560, BASE + '/host')
log('host screen open')

const defs = [
  { x: 0, nick: 'Ana' },
  { x: 504, nick: 'Bo' },
  { x: 1008, nick: 'Cris' },
]
const phones = []
for (const d of defs) {
  const p = await openWindow(d.x, 575, 500, 400, BASE + '/play')
  await p.page.fill('#nickname', d.nick)
  await p.page.click('#joinBtn')
  phones.push(p)
  await sleep(500)
}
log('3 players joined — watch the lobby')
await sleep(3000)

// the answer is the current photo's file name (sans extension)
async function currentAnswer() {
  const src = await host.page.getAttribute('#photo', 'src')
  return decodeURIComponent(src.split('/').pop()).replace(/\.[^.]+$/, '')
}

try {
// ---- Round 1 (random photo) ----
await host.page.click('#startBtn')
log('host started — 3-2-1 countdown for everyone')
await sleep(4500) // let the 3-2-1 intro finish and round 1 begin
log('round 1 — tiles revealing, 20s countdown (watch the bar on the phones too)')

// ---- Pause demo: freeze mid-reveal, hold so you can see it, then resume ----
await sleep(2000) // let a couple of tiles show first
log('host hits PAUSE → tiles + countdown ring + phone bars freeze, phones can\'t submit')
await host.page.click('#pauseBtn')
await sleep(4500) // hold on the frozen "⏸ En pausa" overlay
log('host hits RESUME → everything picks up right where it left off')
await host.page.click('#pauseBtn')
await sleep(1500)

const ans1 = await currentAnswer()
await guess(phones[0], ans1)        // Ana — early, correct
log('Ana locked in (early)')
await sleep(3000)
await guess(phones[1], ans1)        // Bo — correct
log('Bo locked in')
await sleep(2500)
await guess(phones[2], 'no lo sé')  // Cris — wrong → all answered, round ends automatically
log('Cris locked in (wrong) — everyone answered → round ends on its own')
log('round 1 result — medals + growing score bars; auto-advances in 5s')
await sleep(6000)

// ---- Round 2 (auto-started after the 5s) ----
log('round 2 started automatically')
await sleep(3000)
const ans2 = await currentAnswer()
await guess(phones[2], ans2)        // Cris — early, correct (climbs the ranking)
log('Cris locked in (early)')
await sleep(3000)
await guess(phones[0], ans2)        // Ana — later, correct
log('Ana locked in (later)')
await sleep(2000)
await guess(phones[1], '???')       // Bo — wrong → all answered, round ends
log('Bo wrong — everyone answered → round ends; watch the ranks slide')
await sleep(6000)

// ---- Game over (auto-advanced) ----
log('game over — final ranking')
await sleep(5000)

// ---- Restart ----
await host.page.click('#restartBtn')
log('restarted — scores reset, back to lobby')
await sleep(3000)
} catch (e) {
  log('demo stopped early (a window was closed):', e.message)
}

log('demo complete — windows stay open. Tell me to stop (or close them yourself).')
await sleep(15 * 60 * 1000) // keep windows open for inspection
