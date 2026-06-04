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
function renderBoard(elId, board) {
  const c = $(elId); c.innerHTML = ''
  for (const p of board) { const li = document.createElement('li'); li.textContent = `${p.nickname} — ${p.totalScore}`; c.appendChild(li) }
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

function buildRound({ index, total, photoUrl, grid, revealOrder: order }) {
  revealOrder = order
  prog = { i: index + 1, n: total, a: 0 }
  renderProgress()
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

socket.on('host:error', ({ code }) => { $('lobbyMsg').textContent = t('error_' + (code || 'generic')) })

socket.on('round:start', (data) => {
  buildRound(data)
  startCountdown(data.grid.rows * data.grid.cols * data.intervalMs)
  show('game')
})
socket.on('round:reveal', ({ revealedCount }) => applyReveal(revealedCount))

socket.on('round:answered', ({ answeredCount }) => { prog.a = answeredCount; renderProgress() })

socket.on('round:end', ({ answer, results, leaderboard }) => {
  stopCountdown()
  $('answer').textContent = answer
  lastResults = results
  renderResults()
  renderBoard('leaderboard', leaderboard)
  show('result')
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
  else if (phase === 'ROUND_RESULT' && round) { buildRound(round); applyReveal(round.revealedCount); $('answer').textContent = round.answer; renderBoard('leaderboard', round.leaderboard); show('result') }
  else if (phase === 'GAME_OVER') { renderBoard('finalBoard', players); show('over') }
})

applyI18n()
mountLangSwitch()
document.addEventListener('i18n:change', () => { renderProgress(); renderResults() })
