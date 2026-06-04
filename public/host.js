// public/host.js
const socket = io()
const $ = (id) => document.getElementById(id)
const show = (id) => { for (const s of ['lobby','game','result','over']) $(s).classList.toggle('hidden', s !== id) }
const { t, applyI18n, mountLangSwitch } = I18N

let revealOrder = []
let prog = { i: 0, n: 0, a: 0 }      // current round progress, for re-render on lang change
let lastResults = []                 // last round's per-player results
let cdInterval = null                // countdown timer handle

// Kahoot-style countdown: counts down `totalMs` to 0, ring depletes, turns red + pulses in the last 5s.
function startCountdown(totalMs) {
  stopCountdown()
  const timer = $('timer')
  const end = performance.now() + totalMs
  const tick = () => {
    const remain = Math.max(0, end - performance.now())
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

// 加载二维码
fetch('/api/qrcode').then((r) => r.json()).then(({ url, dataUrl }) => {
  $('qr').innerHTML = `<img src="${dataUrl}" alt="qr" />`
  $('joinUrl').textContent = url
})

socket.emit('host:hello')

function renderPlayers(players) {
  const c = $('players'); c.innerHTML = ''
  for (const p of players) { const s = document.createElement('span'); s.textContent = p.nickname; c.appendChild(s) }
}
// Render a leaderboard with a FLIP animation so rows slide to their new rank when scores change.
// Items are keyed by player id and reused across renders; the element must be visible to animate.
function renderBoard(elId, board) {
  const c = $(elId)
  const oldTop = new Map()
  for (const li of c.children) oldTop.set(li.dataset.pid, li.getBoundingClientRect().top)

  const existing = new Map([...c.children].map((li) => [li.dataset.pid, li]))
  for (const p of board) {
    let li = existing.get(p.id)
    if (!li) { li = document.createElement('li'); li.dataset.pid = p.id }
    li.textContent = `${p.nickname} — ${p.totalScore}`
    c.appendChild(li) // appending an existing node moves it into the new order
  }
  const keep = new Set(board.map((p) => p.id))
  for (const [pid, li] of existing) if (!keep.has(pid)) li.remove()

  let moved = 0
  for (const li of c.children) {
    const prev = oldTop.get(li.dataset.pid)
    if (prev == null) continue
    const dy = prev - li.getBoundingClientRect().top
    if (!dy) continue
    const delay = moved++ * 120                 // stagger so rows slide one after another
    li.style.transition = 'none'
    li.style.transform = `translateY(${dy}px)`
    requestAnimationFrame(() => {
      // slower, with a springy overshoot so ranks settle with a little bounce
      li.style.transition = `transform 1.1s cubic-bezier(.34,1.56,.64,1) ${delay}ms`
      li.style.transform = ''
    })
    if (dy > 0) {                               // this row climbed — flash it gold as it arrives
      li.classList.remove('bumped'); void li.offsetWidth
      setTimeout(() => li.classList.add('bumped'), delay + 200)
    }
  }
}
function renderProgress() {
  $('progress').textContent = t('round_progress', prog)
}
function renderResults() {
  const rr = $('roundResults'); rr.innerHTML = ''
  for (const r of lastResults.filter((x) => x.correct).sort((a, b) => b.score - a.score)) {
    const li = document.createElement('li'); li.textContent = t('round_result', { name: r.nickname, score: r.score }); rr.appendChild(li)
  }
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
$('nextBtn').onclick = () => socket.emit('host:next')
$('restartBtn').onclick = () => socket.emit('host:restart')

socket.on('host:error', ({ code }) => { $('lobbyMsg').textContent = t('error_' + (code || 'generic')) })

socket.on('game:reset', () => { $('lobbyMsg').textContent = ''; hideIntro(); show('lobby') })

socket.on('game:countdown', ({ from }) => { runIntro(from || 3) })

socket.on('round:start', (data) => {
  hideIntro()
  buildRound(data)
  startCountdown(data.grid.rows * data.grid.cols * data.intervalMs)
  show('game')
})
socket.on('round:reveal', ({ revealedCount }) => applyReveal(revealedCount))

socket.on('round:answered', ({ answeredCount, nickname }) => {
  prog.a = answeredCount; renderProgress()
  addAnsweredChip(nickname)
})

socket.on('round:end', ({ answer, results, leaderboard }) => {
  stopCountdown()
  $('answer').textContent = answer
  lastResults = results
  renderResults()
  show('result')                       // reveal first so the board is visible…
  renderBoard('leaderboard', leaderboard) // …then animate rank changes
})

socket.on('game:over', ({ leaderboard }) => {
  renderBoard('finalBoard', leaderboard)
  show('over')
})

socket.on('state:full', ({ phase, players, round }) => {
  renderPlayers(players)
  stopCountdown()
  if (phase === 'REVEALING' && round) {
    buildRound(round); applyReveal(round.revealedCount)
    const tiles = round.grid.rows * round.grid.cols
    startCountdown(Math.max(0, tiles - round.revealedCount) * round.intervalMs)
    show('game')
  }
  else if (phase === 'ROUND_RESULT' && round) { buildRound(round); applyReveal(round.revealedCount); $('answer').textContent = round.answer; show('result'); renderBoard('leaderboard', round.leaderboard) }
  else if (phase === 'GAME_OVER') { show('over'); renderBoard('finalBoard', players) }
})

applyI18n()
mountLangSwitch()
document.addEventListener('i18n:change', () => { renderProgress(); renderResults() })
