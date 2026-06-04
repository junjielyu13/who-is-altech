// public/play.js
const socket = io()
const $ = (id) => document.getElementById(id)
const { t, applyI18n, mountLangSwitch } = I18N
let myScore = 0
let canSubmit = false
let joined = false
let statusKey = null      // current status message key, for re-render on lang change
let statusVars = null
let pendingResult = null  // this round's result, revealed only after the round closes
let cdTimers = []         // pending 3-2-1 countdown ticks

// 重连时恢复昵称
const savedNick = localStorage.getItem('wis_nick')
if (savedNick) $('nickname').value = savedNick

let clientId = localStorage.getItem('wis_id')
if (!clientId) { clientId = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('wis_id', clientId) }

// joinView → waitView (sala de espera) → playView
function showView(name) {
  for (const v of ['joinView', 'waitView', 'playView']) $(v).classList.toggle('hidden', v !== name)
}
function renderWaitPlayers(players) {
  const c = $('waitPlayers'); c.innerHTML = ''
  for (const p of players) {
    const s = document.createElement('span'); s.textContent = p.nickname
    if (p.connected === false) s.classList.add('off')
    c.appendChild(s)
  }
}

// Round timer bar: depletes over the round and turns red in the last 5s. Frozen on round close.
let barTimer = null
function startBar(totalMs) {
  stopBar()
  const bar = $('timebar')
  bar.classList.remove('urgent')
  bar.style.transition = 'none'
  bar.style.width = '100%'
  void bar.offsetWidth
  requestAnimationFrame(() => {
    bar.style.transition = `width ${totalMs}ms linear`
    bar.style.width = '0%'
  })
  if (totalMs > 5000) barTimer = setTimeout(() => $('timebar').classList.add('urgent'), totalMs - 5000)
}
function stopBar() {
  if (barTimer) { clearTimeout(barTimer); barTimer = null }
  const bar = $('timebar')
  bar.style.transition = 'none'
  bar.style.width = getComputedStyle(bar).width // freeze where it is
}
function renderGreeting() {
  $('greeting').textContent = t('greeting', { name: localStorage.getItem('wis_nick') || '' })
}
function setStatus(key, vars, cls) {
  statusKey = key; statusVars = vars || null
  renderStatus(cls || 'status')
}
function renderStatus(cls) {
  $('status').textContent = statusKey ? t(statusKey, statusVars) : ''
  if (cls) $('status').className = cls
}

// synchronized 3-2-1 overlay; round:start clears it
function hideCountdown() {
  cdTimers.forEach(clearTimeout); cdTimers = []
  $('countdown').classList.add('hidden')
}
function runCountdown(from) {
  hideCountdown()
  const num = $('countdownNum')
  $('countdown').classList.remove('hidden')
  for (let n = from; n >= 1; n--) {
    cdTimers.push(setTimeout(() => {
      num.textContent = n
      num.classList.remove('tick'); void num.offsetWidth; num.classList.add('tick')
    }, (from - n) * 1000))
  }
  cdTimers.push(setTimeout(hideCountdown, from * 1000 + 1500)) // safety, if round:start is missed
}

function doJoin(nick) {
  localStorage.setItem('wis_nick', nick)
  socket.emit('player:join', { nickname: nick, clientId })
}

$('joinBtn').onclick = () => doJoin($('nickname').value.trim() || t('default_nick'))
// Enter key submits the guess, the natural action on a phone keyboard.
$('guess').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('submitBtn').click() })

socket.on('connect', () => {
  // 断线重连后，如果之前已经加入过，用保存的昵称自动重新加入
  if (joined) {
    const nick = localStorage.getItem('wis_nick')
    if (nick) socket.emit('player:join', { nickname: nick, clientId })
  }
})

socket.on('player:joined', () => {
  joined = true
  renderGreeting()
  showView('waitView')
})

// keep the waiting-room list fresh as others join/leave
socket.on('lobby:update', ({ players }) => { renderWaitPlayers(players) })

// host pressed start: everyone counts down together, then round:start arrives
socket.on('game:countdown', ({ from }) => { runCountdown(from || 3) })

socket.on('round:start', (data) => {
  hideCountdown()
  canSubmit = true
  pendingResult = null
  $('guess').value = ''
  $('guess').disabled = false
  $('submitBtn').disabled = false
  setStatus(null)
  showView('playView')
  startBar(data.grid.rows * data.grid.cols * data.intervalMs)
})

$('submitBtn').onclick = () => {
  if (!canSubmit) return
  const guess = $('guess').value.trim()
  if (!guess) return
  socket.emit('player:submit', { guess })
}

socket.on('player:result', (r) => {
  if (r.alreadySubmitted) { setStatus('status_already'); return }
  if (r.rejected) { setStatus('status_cannot'); return }
  // Lock the answer in, but do NOT reveal correctness or score yet — that is suspense for
  // after the round, shown on the big screen (and mirrored here on round:end).
  canSubmit = false
  $('guess').disabled = true
  $('submitBtn').disabled = true
  pendingResult = r
  setStatus('status_locked')
})

socket.on('round:end', () => {
  stopBar()
  // round closed → now it's safe to reveal this player's outcome and update their total
  if (pendingResult && pendingResult.correct) {
    setStatus('status_correct', { score: pendingResult.score }, 'status ok')
    myScore += pendingResult.score
    $('score').textContent = myScore
  } else if (pendingResult) {
    setStatus('status_wrong', null, 'status bad')
  } else {
    setStatus('status_round_end')
  }
  pendingResult = null
})

socket.on('game:reset', () => {
  myScore = 0
  $('score').textContent = '0'
  canSubmit = false
  pendingResult = null
  setStatus(null)
  hideCountdown()
  stopBar()
  if (joined) showView('waitView') // back to the sala de espera for the next game
})

applyI18n()
mountLangSwitch()
document.addEventListener('i18n:change', () => { if (joined) renderGreeting(); renderStatus($('status').className) })
