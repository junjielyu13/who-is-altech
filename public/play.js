// public/play.js
const socket = io()
const $ = (id) => document.getElementById(id)
let myScore = 0
let canSubmit = false
let joined = false

// 重连时恢复昵称
const savedNick = localStorage.getItem('wis_nick')
if (savedNick) $('nickname').value = savedNick

function doJoin(nick) {
  localStorage.setItem('wis_nick', nick)
  socket.emit('player:join', { nickname: nick })
}

$('joinBtn').onclick = () => doJoin($('nickname').value.trim() || '玩家')

socket.on('connect', () => {
  // 断线重连后，如果之前已经加入过，用保存的昵称自动重新加入
  if (joined) {
    const nick = localStorage.getItem('wis_nick')
    if (nick) socket.emit('player:join', { nickname: nick })
  }
})

socket.on('player:joined', () => {
  joined = true
  $('me').textContent = localStorage.getItem('wis_nick')
  $('joinView').classList.add('hidden')
  $('playView').classList.remove('hidden')
})

socket.on('round:start', () => {
  canSubmit = true
  $('guess').value = ''
  $('guess').disabled = false
  $('submitBtn').disabled = false
  $('status').textContent = ''
  $('status').className = 'status'
})

$('submitBtn').onclick = () => {
  if (!canSubmit) return
  const guess = $('guess').value.trim()
  if (!guess) return
  socket.emit('player:submit', { guess })
}

socket.on('player:result', (r) => {
  if (r.alreadySubmitted) { $('status').textContent = '你这轮已经答过啦'; return }
  if (r.rejected) { $('status').textContent = '现在不能提交'; return }
  canSubmit = false
  $('guess').disabled = true
  $('submitBtn').disabled = true
  if (r.correct) {
    $('status').textContent = `答对！+${r.score} 分 🎉`
    $('status').className = 'status ok'
    myScore += r.score
    $('score').textContent = myScore
  } else {
    $('status').textContent = '已锁定，等待揭晓…'
    $('status').className = 'status'
  }
})

socket.on('round:end', () => {
  $('status').textContent = $('status').textContent.includes('答对') ? $('status').textContent : '本轮结束，看大屏揭晓 👀'
})
