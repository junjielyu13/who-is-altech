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

socket.on('lobby:update', ({ players }) => {
  $('players').innerHTML = players.map((p) => `<span>${p.nickname}</span>`).join('')
})

$('startBtn').onclick = () => socket.emit('host:start')
$('skipBtn').onclick = () => socket.emit('host:skip')
$('nextBtn').onclick = () => socket.emit('host:next')

socket.on('host:error', ({ error }) => { $('lobbyMsg').textContent = '无法开始：' + error })

socket.on('round:start', ({ index, total, photoUrl, grid, revealOrder: order }) => {
  revealOrder = order
  $('qIndex').textContent = index + 1
  $('qTotal').textContent = total
  $('answered').textContent = '0'
  $('photo').src = photoUrl
  const g = $('grid')
  g.style.gridTemplateColumns = `repeat(${grid.cols}, 1fr)`
  g.style.gridTemplateRows = `repeat(${grid.rows}, 1fr)`
  g.innerHTML = Array.from({ length: grid.rows * grid.cols }, (_, i) => `<div class="tile" data-i="${i}"></div>`).join('')
  show('game')
})

socket.on('round:reveal', ({ revealedCount }) => {
  const toReveal = revealOrder.slice(0, revealedCount)
  for (const i of toReveal) {
    const el = document.querySelector(`.tile[data-i="${i}"]`)
    if (el) el.classList.add('revealed')
  }
})

socket.on('round:answered', ({ answeredCount }) => { $('answered').textContent = answeredCount })

socket.on('round:end', ({ answer, leaderboard }) => {
  $('answer').textContent = answer
  $('leaderboard').innerHTML = leaderboard.map((p) => `<li>${p.nickname} — ${p.totalScore}</li>`).join('')
  show('result')
})

socket.on('game:over', ({ leaderboard }) => {
  $('finalBoard').innerHTML = leaderboard.map((p) => `<li>${p.nickname} — ${p.totalScore}</li>`).join('')
  show('over')
})
