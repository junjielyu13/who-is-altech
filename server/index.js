import express from 'express'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import multer from 'multer'
import QRCode from 'qrcode'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { GameState } from './game.js'
import { buildQuiz } from './quizFromUploads.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PORT = process.env.PORT || 3000
// The quiz is just the images in this folder: each file's name (sans extension) is the answer.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads')
const loadQuiz = () => buildQuiz(UPLOADS_DIR)

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const game = new GameState()
let currentRevealOrder = []
let countingDown = false // true during the 3-2-1 intro between host:start and the first round
let paused = false        // host pressed Pause: reveal loop is frozen and submits are blocked

// 静态资源
app.use(express.static(path.join(ROOT, 'public')))
app.use('/uploads', express.static(UPLOADS_DIR))
app.use(express.json())

// 页面路由
app.get('/', (req, res) => res.redirect('/host'))
app.get('/admin', (req, res) => res.sendFile(path.join(ROOT, 'public/admin.html')))
app.get('/host', (req, res) => res.sendFile(path.join(ROOT, 'public/host.html')))
app.get('/play', (req, res) => res.sendFile(path.join(ROOT, 'public/play.html')))

// Uploads keep their ORIGINAL file name — the name (sans extension) is the answer.
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, path.basename(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
})

// Upload one or more photos; each file's name becomes a question.
app.post('/api/photos', upload.array('photos', 50), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'no_image' })
  res.json({ added: req.files.map((f) => f.filename) })
})

// Delete a photo (and thus its question) by file name.
app.delete('/api/photos/:name', async (req, res) => {
  const name = path.basename(req.params.name) // prevent path traversal
  try {
    await fs.unlink(path.join(UPLOADS_DIR, name))
    res.json({ deleted: name })
  } catch (err) {
    res.status(404).json({ error: 'not_found' })
  }
})

app.get('/api/quiz', async (req, res) => res.json(await loadQuiz()))

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
  paused = false // a fresh round always starts running
  const next = game.quiz.questions[game.currentIndex + 1]
  io.emit('round:start', {
    index: game.currentIndex,
    total: game.quiz.questions.length,
    photoUrl: `/uploads/${q.photoFile}`,
    nextPhotoUrl: next ? `/uploads/${next.photoFile}` : null, // big screen preloads it
    grid: q.grid,
    revealOrder: order,
    intervalMs: q.intervalMs,
  })
  runRevealLoop(q.intervalMs)
}

// The tile-reveal interval. Pulled out of startRoundBroadcast so host:resume can restart it
// from wherever it was frozen (same revealedCount), not from the beginning.
function runRevealLoop(intervalMs) {
  stopReveal()
  revealTimer = setInterval(() => {
    const ok = game.revealNext()
    io.emit('round:reveal', { revealedCount: game.revealedCount })
    if (!ok) {
      stopReveal()
      finishRound()
    }
  }, intervalMs)
}

function finishRound() {
  if (game.phase !== 'REVEALING') return
  stopReveal()
  paused = false // leaving REVEALING — any pause is cleared
  game.endRound()
  const q = game.currentQuestion()
  io.emit('round:end', { answer: q.answer, results: roundResults(), leaderboard: game.leaderboard() })
}

// What each player submitted this round — `guess` is the raw text they typed, shown on the
// big screen's "what everyone wrote" wall (rendered with textContent, so it's XSS-safe).
function roundResults() {
  return [...game.submissions.entries()].map(([id, s]) => ({
    nickname: game.players.get(id)?.nickname || '?',
    guess: s.guess,
    correct: s.correct,
    score: s.score,
    revealedAtSubmit: s.revealedAtSubmit,
  }))
}

io.on('connection', (socket) => {
  socket.on('player:join', async ({ nickname, clientId }) => {
    if (game.quiz.questions.length === 0) game.loadQuiz(await loadQuiz())
    const pid = clientId || socket.id
    socket.data.playerId = pid
    game.addPlayer(pid, String(nickname || '玩家').slice(0, 20))
    socket.emit('player:joined', { playerId: pid })
    io.emit('lobby:update', { players: game.leaderboard() })
  })

  socket.on('player:submit', ({ guess }) => {
    if (paused) return // game is paused: ignore guesses (phones also disable the button)
    const result = game.submitGuess(socket.data.playerId, guess)
    socket.emit('player:result', result)
    // Only broadcast when a fresh submission was recorded (not a duplicate/rejected attempt).
    // Include the nickname so the host can show who has locked in (without revealing correctness).
    if (result && typeof result.correct === 'boolean') {
      const p = game.players.get(socket.data.playerId)
      io.emit('round:answered', { answeredCount: game.answeredCount(), nickname: p ? p.nickname : '?' })
      // Everyone still connected has answered → end the round now instead of waiting out the tiles.
      if (game.everyoneAnswered()) finishRound()
    }
  })

  socket.on('host:hello', async () => {
    if (game.phase === 'LOBBY') game.loadQuiz(await loadQuiz())
    let round = null
    if (game.phase === 'REVEALING' || game.phase === 'ROUND_RESULT') {
      const q = game.currentQuestion()
      round = {
        index: game.currentIndex,
        total: game.quiz.questions.length,
        photoUrl: `/uploads/${q.photoFile}`,
        grid: q.grid,
        intervalMs: q.intervalMs,
        revealOrder: currentRevealOrder,
        revealedCount: game.revealedCount,
        answer: game.phase === 'ROUND_RESULT' ? q.answer : null,
        leaderboard: game.leaderboard(),
        results: game.phase === 'ROUND_RESULT' ? roundResults() : null,
      }
    }
    socket.emit('state:full', { phase: game.phase, players: game.leaderboard(), round, paused })
  })

  socket.on('host:start', async () => {
    if (game.phase !== 'LOBBY' || countingDown) return
    game.loadQuiz(await loadQuiz())
    if (game.quiz.questions.length === 0) {
      socket.emit('host:error', { code: 'empty_quiz' })
      return
    }
    game.shuffleQuestions() // photos appear in random order, not upload order
    // 3-2-1 intro: tell everyone to count down together, then start the first round in sync.
    countingDown = true
    io.emit('game:countdown', { from: 3 })
    setTimeout(() => {
      countingDown = false
      game.startGame()
      startRoundBroadcast()
    }, 3000)
  })

  socket.on('host:skip', () => finishRound())

  // Pause/resume — only meaningful mid-game (revealing tiles, or the result screen's auto-advance).
  // REVEALING: freeze the reveal loop so no more tiles show and submits are blocked.
  // ROUND_RESULT: the 5s auto-advance is host-side, so we just flag + broadcast for the UI to freeze.
  socket.on('host:pause', () => {
    if (paused) return
    if (game.phase !== 'REVEALING' && game.phase !== 'ROUND_RESULT') return
    paused = true
    if (game.phase === 'REVEALING') stopReveal()
    io.emit('game:pause', { phase: game.phase })
  })

  socket.on('host:resume', () => {
    if (!paused) return
    paused = false
    if (game.phase === 'REVEALING') runRevealLoop(game.currentQuestion().intervalMs)
    io.emit('game:resume', { phase: game.phase })
  })

  socket.on('host:restart', async () => {
    stopReveal()
    paused = false
    game.restart()
    game.loadQuiz(await loadQuiz())
    io.emit('game:reset')
    io.emit('lobby:update', { players: game.leaderboard() })
  })

  socket.on('host:next', () => {
    if (game.phase !== 'ROUND_RESULT' && game.phase !== 'GAME_OVER') return
    paused = false // advancing past the result screen clears any pause
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

server.listen(PORT, () => console.log(`Who Is Altech → http://localhost:${PORT}`))
