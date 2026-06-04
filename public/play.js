// public/play.js
const socket = io()
const $ = (id) => document.getElementById(id)
const { t, applyI18n, mountLangSwitch } = I18N
let myScore = 0
let canSubmit = false
let joined = false
let statusKey = null      // current status message key, for re-render on lang change
let statusVars = null

// 重连时恢复昵称
const savedNick = localStorage.getItem('wis_nick')
if (savedNick) $('nickname').value = savedNick

let clientId = localStorage.getItem('wis_id')
if (!clientId) { clientId = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('wis_id', clientId) }

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

function doJoin(nick) {
  localStorage.setItem('wis_nick', nick)
  socket.emit('player:join', { nickname: nick, clientId })
}

$('joinBtn').onclick = () => doJoin($('nickname').value.trim() || t('default_nick'))

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
  $('joinView').classList.add('hidden')
  $('playView').classList.remove('hidden')
})

socket.on('round:start', () => {
  canSubmit = true
  $('guess').value = ''
  $('guess').disabled = false
  $('submitBtn').disabled = false
  setStatus(null)
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
  canSubmit = false
  $('guess').disabled = true
  $('submitBtn').disabled = true
  if (r.correct) {
    setStatus('status_correct', { score: r.score }, 'status ok')
    myScore += r.score
    $('score').textContent = myScore
  } else {
    setStatus('status_locked')
  }
})

socket.on('round:end', () => {
  if (statusKey !== 'status_correct') setStatus('status_round_end')
})

socket.on('game:reset', () => {
  myScore = 0
  $('score').textContent = '0'
  canSubmit = false
  setStatus(null)
})

applyI18n()
mountLangSwitch()
document.addEventListener('i18n:change', () => { if (joined) renderGreeting(); renderStatus($('status').className) })
