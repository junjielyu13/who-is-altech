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

    check('phone shows the round timer bar', await phones[0].isVisible('#timebar'))

    // ---- Pause mid-round: host freezes the game, phones can't submit, then resume ----
    check('host shows the Pause button during a round', await host.isVisible('#pauseBtn'))
    await host.click('#pauseBtn')
    await sleep(300)
    check('paused overlay appears on the big screen', await host.isVisible('#pauseOverlay'))
    check('phone shows a paused status', (await phones[0].textContent('#status')).trim().length > 0)
    check('phone submit is blocked while paused', await phones[0].isDisabled('#submitBtn'))
    await host.click('#pauseBtn') // resume
    await sleep(300)
    check('paused overlay hidden after resume', await host.isHidden('#pauseOverlay'))
    check('phone submit re-enabled after resume', !(await phones[0].isDisabled('#submitBtn')))

    // ---- Round 1: Ana answers via ENTER (lowercased → also exercises fuzzy match) ----
    const ans1 = await currentAnswer(host)
    await phones[0].fill('#guess', ans1.toLowerCase())
    await phones[0].press('#guess', 'Enter')
    await phones[0].waitForSelector('#submitBtn[disabled]', { timeout: 4000 })
    check('Enter key submits the guess on the phone', await phones[0].isDisabled('#submitBtn'))
    // the phone must NOT reveal correctness/score at submit time — only after the round
    check('phone does not reveal score at submit time', !(await phones[0].textContent('#status')).includes('+'))
    check('phone does not show success styling at submit time', !(await phones[0].locator('#status.ok').count()))
    await phones[1].fill('#guess', ans1); await phones[1].click('#submitBtn')
    await phones[2].fill('#guess', 'no idea'); await phones[2].click('#submitBtn')

    // every connected player has answered → the round ends on its own, no host:skip needed
    await host.waitForSelector('#result:not(.hidden)', { timeout: 4000 })
    check('round auto-ends once every connected player has answered', await host.isVisible('#result'))
    check('big screen shows the answer', (await host.textContent('#answer')).includes(ans1))
    check('the per-player "+score" list was removed', (await host.locator('#roundResults').count()) === 0)
    check('leaderboard is populated', (await host.locator('#leaderboard li').count()) === 3)
    check('leaderboard shows a medal/rank badge', (await host.textContent('#leaderboard li:first-child .rank')).trim().length > 0)
    // the leader's score bar must actually render with width (catches inline-span / 0-width bugs).
    // wait out the ~1s grow animation before measuring the rendered width.
    await sleep(1300)
    const barW = (await host.locator('#leaderboard li:first-child .bar').boundingBox())?.width || 0
    check('leader score bar renders with a visible fill', barW > 0)
    check('Next button shows the auto-advance countdown', /\d/.test(await host.textContent('#nextCount')))
    // the "what everyone wrote" wall tallies answers (no names): the two correct guesses (same answer,
    // different casing) merge into one ×2 bubble; Cris's wrong "no idea" is the other → 2 bubbles
    check('guess wall aggregates identical answers into one bubble', (await host.locator('#guessList .bubble').count()) === 2)
    check('a correct answer bubble is highlighted', (await host.locator('#guessList .bubble.correct').count()) >= 1)
    check('the wall shows what players actually typed', (await host.textContent('#guessList')).includes('no idea'))
    check('the wall no longer shows who wrote each answer', !/Ana|Bo|Cris/.test(await host.textContent('#guessList')))
    check('duplicate answers show a ×N count badge', (await host.locator('#guessList .count').count()) >= 1)
    // now the phone reveals its own outcome + updated total
    await phones[0].waitForSelector('#status.ok', { timeout: 4000 })
    check('phone reveals success + score after the round closes', (await phones[0].textContent('#status')).includes('+'))
    check('phone total score updates after the round', (await phones[0].textContent('#score')) !== '0')

    // ---- Result screen auto-advances after ~5s → round 2 starts on its own ----
    await host.waitForSelector('#game:not(.hidden)', { timeout: 8000 })
    check('result screen auto-advances to the next round', await host.isVisible('#game'))
    await phones[1].waitForSelector('#playView:not(.hidden)', { timeout: 4000 })

    // ---- Round 2: Cris drops out; only Ana answers, so the host ends it manually with Skip ----
    await phones[2].context().close()
    await sleep(700)
    const ans2 = await currentAnswer(host)
    await phones[0].fill('#guess', ans2); await phones[0].click('#submitBtn') // Bo stays silent
    await sleep(400)
    await host.click('#skipBtn')
    await host.waitForSelector('#result:not(.hidden)', { timeout: 4000 })
    check('host Skip ends the round when not everyone has answered', await host.isVisible('#result'))
    check('disconnected player is greyed out on the leaderboard', (await host.locator('#leaderboard li.off').count()) === 1)

    // manual "Siguiente" still works (cancels the auto-timer); only 2 photos → game over
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
