import express from 'express'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import multer from 'multer'
import QRCode from 'qrcode'
import os from 'node:os'
import { GameState } from './game.js'
import { QuizStore } from './quizStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PORT = process.env.PORT || 3000

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const store = new QuizStore(path.join(ROOT, 'quiz.json'))
const game = new GameState()
let currentRevealOrder = []

// 静态资源
app.use(express.static(path.join(ROOT, 'public')))
app.use('/uploads', express.static(path.join(ROOT, 'uploads')))
app.use(express.json())

// 页面路由
app.get('/', (req, res) => res.redirect('/host'))
app.get('/admin', (req, res) => res.sendFile(path.join(ROOT, 'public/admin.html')))
app.get('/host', (req, res) => res.sendFile(path.join(ROOT, 'public/host.html')))
app.get('/play', (req, res) => res.sendFile(path.join(ROOT, 'public/play.html')))

// 上传配置
const upload = multer({
  dest: path.join(ROOT, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
})

app.post('/api/questions', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '需要上传图片文件' })
    const aliases = (req.body.aliases || '').split(',').map((s) => s.trim()).filter(Boolean)
    const q = await store.addQuestion({
      photoFile: req.file.filename,
      answer: req.body.answer,
      aliases,
      grid: { rows: Number(req.body.rows) || 4, cols: Number(req.body.cols) || 4 },
      intervalMs: Number(req.body.intervalMs) || 3000,
    })
    res.json(q)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.get('/api/quiz', async (req, res) => res.json(await store.load()))

// 本机局域网 IP（给大屏生成二维码用）
function lanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address
    }
  }
  return 'localhost'
}

app.get('/api/qrcode', async (req, res) => {
  const url = `http://${lanIp()}:${PORT}/play`
  const dataUrl = await QRCode.toDataURL(url)
  res.json({ url, dataUrl })
})

// ---- 露图定时循环 ----
let revealTimer = null
function stopReveal() {
  if (revealTimer) clearInterval(revealTimer)
  revealTimer = null
}

function startRoundBroadcast() {
  const q = game.currentQuestion()
  const tiles = game.totalTiles()
  // 打乱格子顺序
  const order = [...Array(tiles).keys()]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  currentRevealOrder = order
  io.emit('round:start', {
    index: game.currentIndex,
    total: game.quiz.questions.length,
    photoUrl: `/uploads/${q.photoFile}`,
    grid: q.grid,
    revealOrder: order,
    intervalMs: q.intervalMs,
  })
  stopReveal()
  revealTimer = setInterval(() => {
    const ok = game.revealNext()
    io.emit('round:reveal', { revealedCount: game.revealedCount })
    if (!ok) {
      stopReveal()
      finishRound()
    }
  }, q.intervalMs)
}

function finishRound() {
  if (game.phase !== 'REVEALING') return
  stopReveal()
  game.endRound()
  const q = game.currentQuestion()
  const results = [...game.submissions.entries()].map(([id, s]) => ({
    nickname: game.players.get(id)?.nickname || '?',
    correct: s.correct,
    score: s.score,
    revealedAtSubmit: s.revealedAtSubmit,
  }))
  io.emit('round:end', { answer: q.answer, results, leaderboard: game.leaderboard() })
}

io.on('connection', (socket) => {
  socket.on('player:join', async ({ nickname, clientId }) => {
    if (game.quiz.questions.length === 0) game.loadQuiz(await store.load())
    const pid = clientId || socket.id
    socket.data.playerId = pid
    game.addPlayer(pid, String(nickname || '玩家').slice(0, 20))
    socket.emit('player:joined', { playerId: pid })
    io.emit('lobby:update', { players: game.leaderboard() })
  })

  socket.on('player:submit', ({ guess }) => {
    const result = game.submitGuess(socket.data.playerId, guess)
    socket.emit('player:result', result)
    io.emit('round:answered', { answeredCount: game.answeredCount() })
  })

  socket.on('host:hello', async () => {
    if (game.phase === 'LOBBY') game.loadQuiz(await store.load())
    let round = null
    if (game.phase === 'REVEALING' || game.phase === 'ROUND_RESULT') {
      const q = game.currentQuestion()
      round = {
        index: game.currentIndex,
        total: game.quiz.questions.length,
        photoUrl: `/uploads/${q.photoFile}`,
        grid: q.grid,
        revealOrder: currentRevealOrder,
        revealedCount: game.revealedCount,
        answer: game.phase === 'ROUND_RESULT' ? q.answer : null,
        leaderboard: game.leaderboard(),
      }
    }
    socket.emit('state:full', { phase: game.phase, players: game.leaderboard(), round })
  })

  socket.on('host:start', async () => {
    game.loadQuiz(await store.load())
    try {
      game.startGame()
      startRoundBroadcast()
    } catch (err) {
      // startGame only throws when the quiz is empty; send a code so the client localizes it.
      socket.emit('host:error', { code: 'empty_quiz' })
    }
  })

  socket.on('host:skip', () => finishRound())

  socket.on('host:next', () => {
    if (game.phase !== 'ROUND_RESULT' && game.phase !== 'GAME_OVER') return
    game.nextRound()
    if (game.phase === 'GAME_OVER') {
      io.emit('game:over', { leaderboard: game.leaderboard() })
    } else {
      startRoundBroadcast()
    }
  })

  socket.on('disconnect', () => {
    if (socket.data.playerId) game.markDisconnected(socket.data.playerId)
    io.emit('lobby:update', { players: game.leaderboard() })
  })
})

server.listen(PORT, () => console.log(`Who Is She → http://localhost:${PORT}`))
