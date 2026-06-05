// public/host.js
const socket = io()
const $ = (id) => document.getElementById(id)
const show = (id) => { for (const s of ['lobby','game','result','over']) $(s).classList.toggle('hidden', s !== id) }
const { t, applyI18n, mountLangSwitch } = I18N

let revealOrder = []
let prog = { i: 0, n: 0, a: 0 }      // current round progress, for re-render on lang change
let cdInterval = null                // countdown timer handle
let cdEnd = 0                        // wall-clock time the countdown ends (for pause/resume)
let nextTimer = null                 // auto-advance timer on the result screen
let nextN = 0                        // remaining seconds on the result auto-advance (frozen on pause)
let paused = false                   // host pressed Pause: timers frozen, overlay shown
let cdFrozenMs = null                // round time left when paused, to resume the ring from

// Kahoot-style countdown: counts down `totalMs` to 0, ring depletes, turns red + pulses in the last 5s.
function startCountdown(totalMs) {
  stopCountdown()
  const timer = $('timer')
  cdEnd = performance.now() + totalMs
  const tick = () => {
    const remain = Math.max(0, cdEnd - performance.now())
    const pct = totalMs > 0 ? (remain / totalMs) * 100 : 0
    const urgent = remain > 0 && remain <= 5000
    $('timerNum').textContent = Math.ceil(remain / 1000)
    timer.style.setProperty('--pct', pct + '%')
    timer.style.setProperty('--c', urgent ? '#ef476f' : '#06d6a0')
    timer.classList.toggle('urgent', urgent)
    if (remain <= 0) stopCountdown()
  }
  tick()
  cdInterval = setInterval(tick, 100)
}
function stopCountdown() {
  if (cdInterval) { clearInterval(cdInterval); cdInterval = null }
  $('timer').classList.remove('urgent')
}

// Synchronized 3-2-1 intro overlay shown on host:start before the first round.
let introTimers = []
function hideIntro() {
  introTimers.forEach(clearTimeout); introTimers = []
  $('countdown').classList.add('hidden')
}
function runIntro(from) {
  hideIntro()
  const num = $('countdownNum')
  $('countdown').classList.remove('hidden')
  for (let n = from; n >= 1; n--) {
    introTimers.push(setTimeout(() => {
      num.textContent = n
      num.classList.remove('tick'); void num.offsetWidth; num.classList.add('tick')
    }, (from - n) * 1000))
  }
  introTimers.push(setTimeout(hideIntro, from * 1000 + 1500))
}

// Result screen auto-advances after a 5s countdown shown on the Siguiente button (5→1).
// Clicking the button (or any navigation) cancels the timer via clearAutoNext().
function scheduleAutoNext() {
  clearAutoNext()
  nextN = 5
  $('nextCount').textContent = nextN
  runNextTimer()
}
// Ticks nextN down to 0 and advances. Split out so pause can stop the ticking while keeping
// nextN (and the badge) frozen, and resume can pick it up from the same number.
function runNextTimer() {
  clearNextTimer()
  nextTimer = setInterval(() => {
    nextN -= 1
    if (nextN <= 0) { clearAutoNext(); socket.emit('host:next'); return }
    $('nextCount').textContent = nextN
  }, 1000)
}
function clearNextTimer() {
  if (nextTimer) { clearInterval(nextTimer); nextTimer = null }
}
function clearAutoNext() {
  clearNextTimer()
  nextN = 0
  $('nextCount').textContent = ''
}
// Preload a photo so the next round's tiles reveal instantly, with no load flash.
function preload(url) { if (url) { const img = new Image(); img.src = url } }

// ---- Pause / Resume ----
// The Pause button shows only mid-game (a round or the result screen); hidden in lobby/over.
function showPauseBtn(on) { $('pauseBtn').classList.toggle('hidden', !on) }
function setPauseUi() {
  $('pauseBtn').textContent = t(paused ? 'btn_resume' : 'btn_pause')
  $('pauseBtn').classList.toggle('paused', paused)
  $('pauseOverlay').classList.toggle('hidden', !paused)
}
// Freeze the live timers in place: capture the round ring's remaining time, stop the auto-advance
// ticking (keeping its badge frozen). Resume restarts whichever applies to the current phase.
function pauseTimers() {
  if (cdInterval) { cdFrozenMs = Math.max(0, cdEnd - performance.now()); stopCountdown() }
  clearNextTimer()
}
function resumeTimers(phase) {
  if (phase === 'REVEALING' && cdFrozenMs != null) { startCountdown(cdFrozenMs); cdFrozenMs = null }
  if (phase === 'ROUND_RESULT' && nextN > 0) runNextTimer()
}
function clearPause() { paused = false; cdFrozenMs = null; $('pauseOverlay').classList.add('hidden') }

// 加载二维码
fetch('/api/qrcode').then((r) => r.json()).then(({ url, dataUrl }) => {
  $('qr').innerHTML = `<img src="${dataUrl}" alt="qr" />`
  $('joinUrl').textContent = url
})

socket.emit('host:hello')

function renderPlayers(players) {
  const c = $('players'); c.innerHTML = ''
  for (const p of players) {
    const s = document.createElement('span'); s.textContent = p.nickname
    if (p.connected === false) s.classList.add('off')
    c.appendChild(s)
  }
}

// Animate a number from its last value up to `to` (ease-out cubic), so scores tick up on reveal.
function countUp(el, to) {
  const from = Number(el.dataset.v || 0)
  el.dataset.v = to
  if (from === to) { el.textContent = to; return }
  const start = performance.now(), dur = 900
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur)
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// Render a playful leaderboard: medal/rank, name, a score bar that grows, and a counting-up number.
// Rows are keyed by player id and reused across renders, sliding to their new rank via FLIP.
const MEDALS = ['🥇', '🥈', '🥉']
function renderBoard(elId, board) {
  const c = $(elId)
  const oldTop = new Map()
  for (const li of c.children) oldTop.set(li.dataset.pid, li.getBoundingClientRect().top)

  const existing = new Map([...c.children].map((li) => [li.dataset.pid, li]))
  const max = Math.max(1, ...board.map((p) => p.totalScore))
  board.forEach((p, idx) => {
    let li = existing.get(p.id)
    if (!li) {
      li = document.createElement('li'); li.dataset.pid = p.id
      li.innerHTML = '<span class="rank"></span><span class="pname"></span><span class="bar-wrap"><span class="bar"></span></span><span class="pscore">0</span>'
    }
    li.classList.toggle('leader', idx === 0 && p.totalScore > 0)
    li.classList.toggle('off', p.connected === false)
    li.querySelector('.rank').textContent = MEDALS[idx] || idx + 1
    li.querySelector('.pname').textContent = p.nickname
    li.querySelector('.bar').style.width = (p.totalScore / max) * 100 + '%'
    countUp(li.querySelector('.pscore'), p.totalScore)
    c.appendChild(li) // appending an existing node moves it into the new order
  })
  const keep = new Set(board.map((p) => p.id))
  for (const [pid, li] of existing) if (!keep.has(pid)) li.remove()

  let moved = 0
  for (const li of c.children) {
    const prev = oldTop.get(li.dataset.pid)
    if (prev == null) continue
    const dy = prev - li.getBoundingClientRect().top
    if (!dy) continue
    const delay = moved++ * 140                 // stagger so rows slide one after another
    li.style.transition = 'none'
    li.style.transform = `translateY(${dy}px)`
    requestAnimationFrame(() => {
      // slower, with a springy overshoot so ranks settle with a little bounce
      li.style.transition = `transform 1.1s cubic-bezier(.34,1.56,.64,1) ${delay}ms`
      li.style.transform = ''
    })
    if (dy > 0) {                               // this row climbed — flash it as it arrives
      li.classList.remove('bumped'); void li.offsetWidth
      setTimeout(() => li.classList.add('bumped'), delay + 200)
    }
  }
}
function renderProgress() {
  $('progress').textContent = t('round_progress', prog)
}

// "What everyone wrote" wall on the result screen: a tally of the *answers* (no names), one bubble
// per distinct guess with a ×N badge for how many wrote it. Correct guesses glow green; wrong ones
// are the fun part. Guess text is rendered with textContent → XSS-safe.
let lastResults = []
function renderGuesses(results) {
  lastResults = results || []
  const c = $('guessList'); c.innerHTML = ''
  if (!lastResults.length) {
    const e = document.createElement('div'); e.className = 'empty'; e.textContent = t('guesses_empty')
    c.appendChild(e); return
  }
  // tally identical answers (case-insensitive, trimmed); keep the first-seen original casing
  const tally = new Map()
  for (const r of lastResults) {
    const text = (r.guess || '').trim()
    if (!text) continue
    const key = text.toLowerCase()
    const e = tally.get(key)
    if (e) e.count += 1
    else tally.set(key, { text, count: 1, correct: r.correct })
  }
  const items = [...tally.values()].sort((a, b) => b.count - a.count) // most-written answers first
  items.forEach((it, i) => {
    const wrap = document.createElement('div')
    wrap.className = 'bubble-wrap'
    wrap.style.transform = `rotate(${((i % 3) - 1) * 1.5}deg)` // subtle sticky-note tilt
    const b = document.createElement('div')
    b.className = 'bubble ' + (it.correct ? 'correct' : 'wrong')
    b.style.animationDelay = i * 80 + 'ms'
    const said = document.createElement('div'); said.className = 'said'; said.textContent = it.text
    b.appendChild(said)
    if (it.count > 1) {
      const n = document.createElement('span'); n.className = 'count'; n.textContent = '×' + it.count
      b.appendChild(n)
    }
    wrap.appendChild(b); c.appendChild(wrap)
  })
}

function addAnsweredChip(nickname) {
  if (!nickname) return
  const chip = document.createElement('span')
  chip.className = 'chip'
  chip.textContent = nickname
  $('answeredList').appendChild(chip)
}

function buildRound({ index, total, photoUrl, grid, revealOrder: order }) {
  revealOrder = order
  prog = { i: index + 1, n: total, a: 0 }
  renderProgress()
  $('answeredList').innerHTML = '' // clear who-answered chips for the new round
  $('photo').src = photoUrl
  const g = $('grid')
  g.style.gridTemplateColumns = `repeat(${grid.cols}, 1fr)`
  g.style.gridTemplateRows = `repeat(${grid.rows}, 1fr)`
  g.innerHTML = Array.from({ length: grid.rows * grid.cols }, (_, i) => `<div class="tile" data-i="${i}"></div>`).join('')
}

function applyReveal(revealedCount) {
  for (const i of revealOrder.slice(0, revealedCount)) {
    const el = document.querySelector(`.tile[data-i="${i}"]`)
    if (el) el.classList.add('revealed')
  }
}

socket.on('lobby:update', ({ players }) => { renderPlayers(players) })

$('startBtn').onclick = () => socket.emit('host:start')
$('skipBtn').onclick = () => socket.emit('host:skip')
$('nextBtn').onclick = () => { clearAutoNext(); socket.emit('host:next') }
$('restartBtn').onclick = () => socket.emit('host:restart')
$('pauseBtn').onclick = () => socket.emit(paused ? 'host:resume' : 'host:pause')

socket.on('game:pause', () => { paused = true; pauseTimers(); setPauseUi() })
socket.on('game:resume', ({ phase }) => { paused = false; setPauseUi(); resumeTimers(phase) })

socket.on('host:error', ({ code }) => { $('lobbyMsg').textContent = t('error_' + (code || 'generic')) })

socket.on('game:reset', () => { clearAutoNext(); clearPause(); showPauseBtn(false); $('lobbyMsg').textContent = ''; hideIntro(); show('lobby') })

socket.on('game:countdown', ({ from }) => { runIntro(from || 3) })

socket.on('round:start', (data) => {
  hideIntro()
  clearAutoNext()
  clearPause()            // a new round always starts running
  buildRound(data)
  preload(data.nextPhotoUrl)
  startCountdown(data.grid.rows * data.grid.cols * data.intervalMs)
  show('game')
  showPauseBtn(true); setPauseUi()
})
socket.on('round:reveal', ({ revealedCount }) => applyReveal(revealedCount))

socket.on('round:answered', ({ answeredCount, nickname }) => {
  prog.a = answeredCount; renderProgress()
  addAnsweredChip(nickname)
})

socket.on('round:end', ({ answer, leaderboard, results }) => {
  stopCountdown()
  clearPause(); setPauseUi()              // a Skip during a pause lands here with no resume event
  $('answer').textContent = answer       // the big screen tells everyone the answer
  show('result')                         // reveal first so the board is visible…
  renderBoard('leaderboard', leaderboard) // …then animate rank changes
  renderGuesses(results)                 // …and the wall of what everyone wrote
  scheduleAutoNext()                     // auto-advance after 5s
  showPauseBtn(true)                     // still pausable on the result screen
})

socket.on('game:over', ({ leaderboard }) => {
  clearAutoNext()
  clearPause()
  showPauseBtn(false)
  show('over')                          // reveal first so the bars/scores animate…
  renderBoard('finalBoard', leaderboard) // …then grow them in
})

socket.on('state:full', ({ phase, players, round, paused: wasPaused }) => {
  renderPlayers(players)
  stopCountdown()
  clearPause()
  if (phase === 'REVEALING' && round) {
    buildRound(round); applyReveal(round.revealedCount)
    const tiles = round.grid.rows * round.grid.cols
    startCountdown(Math.max(0, tiles - round.revealedCount) * round.intervalMs)
    show('game'); showPauseBtn(true)
  }
  else if (phase === 'ROUND_RESULT' && round) { buildRound(round); applyReveal(round.revealedCount); $('answer').textContent = round.answer; show('result'); renderBoard('leaderboard', round.leaderboard); renderGuesses(round.results); showPauseBtn(true) }
  else if (phase === 'GAME_OVER') { showPauseBtn(false); show('over'); renderBoard('finalBoard', players) }
  else showPauseBtn(false)
  if (wasPaused && (phase === 'REVEALING' || phase === 'ROUND_RESULT')) { paused = true; pauseTimers(); setPauseUi() }
})

applyI18n()
mountLangSwitch()
document.addEventListener('i18n:change', () => { renderProgress(); setPauseUi(); if (lastResults.length === 0) renderGuesses(lastResults) })
