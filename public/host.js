// public/host.js
const socket = io()
const $ = (id) => document.getElementById(id)
const show = (id) => { for (const s of ['lobby','game','result','over']) $(s).classList.toggle('hidden', s !== id) }

let revealOrder = []

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

function buildRound({ index, total, photoUrl, grid, revealOrder: order }) {
  revealOrder = order
  $('qIndex').textContent = index + 1
  $('qTotal').textContent = total
  $('answered').textContent = '0'
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

socket.on('host:error', ({ error }) => { $('lobbyMsg').textContent = '无法开始：' + error })

socket.on('round:start', (data) => { buildRound(data); show('game') })
socket.on('round:reveal', ({ revealedCount }) => applyReveal(revealedCount))

socket.on('round:answered', ({ answeredCount }) => { $('answered').textContent = answeredCount })

socket.on('round:end', ({ answer, results, leaderboard }) => {
  $('answer').textContent = answer
  const rr = $('roundResults'); rr.innerHTML = ''
  for (const r of results.filter((x) => x.correct).sort((a, b) => b.score - a.score)) {
    const li = document.createElement('li'); li.textContent = `${r.nickname} 猜中 +${r.score}`; rr.appendChild(li)
  }
  renderBoard('leaderboard', leaderboard)
  show('result')
})

socket.on('game:over', ({ leaderboard }) => {
  renderBoard('finalBoard', leaderboard)
  show('over')
})

socket.on('state:full', ({ phase, players, round }) => {
  renderPlayers(players)
  if (phase === 'REVEALING' && round) { buildRound(round); applyReveal(round.revealedCount); show('game') }
  else if (phase === 'ROUND_RESULT' && round) { buildRound(round); applyReveal(round.revealedCount); $('answer').textContent = round.answer; renderBoard('leaderboard', round.leaderboard); show('result') }
  else if (phase === 'GAME_OVER') { renderBoard('finalBoard', players); show('over') }
})
