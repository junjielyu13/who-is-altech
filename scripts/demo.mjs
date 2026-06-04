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

try {
// ---- Round 1 (first photo) ----
await host.page.click('#startBtn')
log('host started — 3-2-1 countdown for everyone')
await sleep(4500) // let the 3-2-1 intro finish and round 1 begin
log('round 1 — tiles revealing, countdown running')
await guess(phones[0], 'junjie')   // Ana — early, correct
log('Ana locked in (early)')
await sleep(3000)
await guess(phones[1], '君杰')      // Bo — alias, correct
log('Bo locked in (alias)')
await sleep(2500)
await guess(phones[2], 'no lo sé')  // Cris — wrong
log('Cris locked in (wrong)')
await sleep(2000)
await host.page.click('#skipBtn')   // end round → result + rank animation
log('round 1 ended — result screen + leaderboard')
await sleep(5000)

// ---- Round 2 (second photo) ----
await host.page.click('#nextBtn')
log('round 2 started')
await sleep(3000)
await guess(phones[2], 'jaquero')   // Cris — early, correct (climbs the ranking)
log('Cris locked in (early)')
await sleep(3000)
await guess(phones[0], 'jaquero')   // Ana — later, correct
log('Ana locked in (later)')
await sleep(2000)
await guess(phones[1], '???')       // Bo — wrong
await sleep(1500)
await host.page.click('#skipBtn')
log('round 2 ended — watch ranks slide')
await sleep(5000)

// ---- Game over ----
await host.page.click('#nextBtn')
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
