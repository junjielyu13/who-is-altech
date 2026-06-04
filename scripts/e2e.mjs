// scripts/e2e.mjs — headless end-to-end test of the whole game with 1 host + 3 players.
// Spawns its own server on an isolated port + temp uploads dir (never touches your real uploads/),
// drives a full game through Playwright, asserts the UI behaves, and exits non-zero on failure.
// Run: npm run test:e2e
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const PORT = process.env.E2E_PORT || '3994'
const BASE = `http://localhost:${PORT}`
const UPLOADS_DIR = path.join(os.tmpdir(), `wis-e2e-uploads-${process.pid}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗ FAILED:', name) }
}

// the answer is the current photo's file name without extension (questions are name-based now)
async function currentAnswer(host) {
  const src = await host.getAttribute('#photo', 'src')
  return decodeURIComponent(src.split('/').pop()).replace(/\.[^.]+$/, '')
}

async function main() {
  // file name = answer; two photos. Content can be empty — the flow doesn't need real pixels.
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.writeFile(path.join(UPLOADS_DIR, 'Junjie.jpg'), '')
  await fs.writeFile(path.join(UPLOADS_DIR, 'Jaquero.png'), '')
  const server = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, UPLOADS_DIR } })
  await sleep(900)
  const browser = await chromium.launch({ headless: true })
  try {
    const host = await (await browser.newContext()).newPage()
    await host.goto(BASE + '/host')

    // each player gets its own context so localStorage (clientId) is isolated → distinct players
    const phones = []
    for (const nick of ['Ana', 'Bo', 'Cris']) {
      const p = await (await browser.newContext()).newPage()
      await p.goto(BASE + '/play')
      await p.fill('#nickname', nick)
      await p.click('#joinBtn')
      await p.waitForSelector('#waitView:not(.hidden)', { timeout: 5000 })
      phones.push(p)
    }

    await sleep(400)
    check('phone shows the waiting room (sala de espera) after joining', await phones[0].isVisible('#waitView'))
    check('host lobby lists 3 players', (await host.locator('#players span').count()) === 3)
    check('waiting room lists 3 players', (await phones[2].locator('#waitPlayers span').count()) === 3)

    // host starts → synchronized 3-2-1 countdown
    await host.click('#startBtn')
    await sleep(800)
    check('countdown overlay shows on the host', await host.isVisible('#countdown'))
    check('countdown overlay shows on a phone', await phones[0].isVisible('#countdown'))

    // round 1 begins after the countdown
    await host.waitForSelector('#game:not(.hidden)', { timeout: 6000 })
    await phones[0].waitForSelector('#playView:not(.hidden)', { timeout: 6000 })
    check('host shows the game view', await host.isVisible('#game'))
    check('host shows the round countdown timer', await host.isVisible('#timer'))
    check('phone shows the guess box', await phones[0].isVisible('#guess'))

    // guesses: Ana (correct, lowercased to also exercise fuzzy match), Bo (correct), Cris (wrong)
    const ans1 = await currentAnswer(host)
    await phones[0].fill('#guess', ans1.toLowerCase()); await phones[0].click('#submitBtn')
    await phones[0].waitForSelector('#submitBtn[disabled]', { timeout: 4000 })
    // the phone must NOT reveal correctness/score at submit time — only after the round
    check('phone does not reveal score at submit time', !(await phones[0].textContent('#status')).includes('+'))
    check('phone does not show success styling at submit time', !(await phones[0].locator('#status.ok').count()))
    await phones[1].fill('#guess', ans1); await phones[1].click('#submitBtn')
    await phones[2].fill('#guess', 'no idea'); await phones[2].click('#submitBtn')
    await sleep(500)
    check('host shows a ✓ chip for each of the 3 who answered', (await host.locator('#answeredList .chip').count()) === 3)

    // end round → result screen + leaderboard
    await host.click('#skipBtn')
    await host.waitForSelector('#result:not(.hidden)', { timeout: 4000 })
    check('result screen shows the answer', (await host.textContent('#answer')).includes(ans1))
    check('round results list the correct guessers', (await host.locator('#roundResults li').count()) === 2)
    check('leaderboard is populated', (await host.locator('#leaderboard li').count()) === 3)
    // now the phone reveals its own outcome + updated total
    await phones[0].waitForSelector('#status.ok', { timeout: 4000 })
    check('phone reveals success + score after the round closes', (await phones[0].textContent('#status')).includes('+'))
    check('phone total score updates after the round', (await phones[0].textContent('#score')) !== '0')

    // round 2 then game over
    await host.click('#nextBtn')
    await host.waitForSelector('#game:not(.hidden)', { timeout: 4000 })
    await phones[2].waitForSelector('#playView:not(.hidden)', { timeout: 4000 })
    const ans2 = await currentAnswer(host)
    await phones[2].fill('#guess', ans2); await phones[2].click('#submitBtn')
    await sleep(400)
    await host.click('#skipBtn')
    await host.waitForSelector('#result:not(.hidden)', { timeout: 4000 })
    await host.click('#nextBtn')
    await host.waitForSelector('#over:not(.hidden)', { timeout: 4000 })
    check('game over shows the final ranking', (await host.locator('#finalBoard li').count()) === 3)
    check('game over shows the restart button', await host.isVisible('#restartBtn'))

    // restart → back to lobby + scores reset
    await host.click('#restartBtn')
    await host.waitForSelector('#lobby:not(.hidden)', { timeout: 4000 })
    await phones[0].waitForSelector('#waitView:not(.hidden)', { timeout: 4000 })
    check('host returns to the lobby after restart', await host.isVisible('#lobby'))
    check('phone returns to the waiting room after restart', await phones[0].isVisible('#waitView'))
    check('phone score is reset to 0 after restart', (await phones[0].textContent('#score')) === '0')
  } finally {
    await browser.close()
    server.kill()
    await fs.rm(UPLOADS_DIR, { recursive: true, force: true })
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
