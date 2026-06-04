# "Who Is She" 猜照片游戏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 Kahoot 风格的线下聚会猜照片游戏：大屏按格子逐块露出照片，玩家手机扫码加入并手动输入名字猜，越早猜中得分越高。

**Architecture:** 单个 Node.js 服务器用 Express 提供三个页面（/admin 配置、/host 大屏、/play 手机）和静态资源，用 Socket.IO 做实时广播。游戏状态保存在服务器内存（单局）。核心逻辑（计分、答案匹配、状态机）是可单测的纯模块。

**Tech Stack:** Node.js 22 (ES modules), Express, Socket.IO, multer（上传）, qrcode（二维码）, 内置 `node:test` 测试。前端纯 HTML/CSS/原生 JS。

---

## File Structure

```
package.json            # 依赖与脚本
server/
  scoring.js            # 计分纯函数
  matching.js           # 答案归一化与匹配纯函数
  game.js               # GameState 状态机（class）
  quizStore.js          # 读写 quiz.json + 处理上传
  index.js              # Express + Socket.IO 启动与事件接线
public/
  shared.css            # 共用样式
  admin.html / admin.js # 配置页
  host.html  / host.js  # 主持人大屏页
  play.html  / play.js  # 玩家手机页
test/
  scoring.test.js
  matching.test.js
  game.test.js
  socket.test.js
uploads/                # 运行时生成（.gitkeep）
quiz.json               # 运行时生成
```

每个文件单一职责：纯逻辑（scoring/matching/game）与 IO（quizStore/index）分离，便于测试。

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `uploads/.gitkeep`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "who-is-she",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.19.2",
    "socket.io": "^4.7.5",
    "multer": "^1.4.5-lts.1",
    "qrcode": "^1.5.4"
  }
}
```

- [ ] **Step 2: 创建 .gitignore**

```
node_modules/
uploads/*
!uploads/.gitkeep
quiz.json
```

- [ ] **Step 3: 创建占位文件并安装依赖**

```bash
mkdir -p uploads server public test
touch uploads/.gitkeep
npm install
```
Expected: `node_modules/` 生成，无报错。

- [ ] **Step 4: 验证测试运行器可用**

Run: `npm test`
Expected: 退出码 0，输出类似 "tests 0"（还没有测试文件）。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore uploads/.gitkeep
git commit -m "chore: scaffold project with deps"
```

---

## Task 2: 计分模块 scoring.js

**Files:**
- Create: `server/scoring.js`
- Test: `test/scoring.test.js`

- [ ] **Step 1: 写失败测试**

```js
// test/scoring.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeScore } from '../server/scoring.js'

test('越少露出块数得分越高', () => {
  assert.equal(computeScore(16, 1), 938)   // ceil(1000*15/16)
  assert.equal(computeScore(16, 8), 500)   // 1000*8/16
})

test('全部露完才中给保底分', () => {
  assert.equal(computeScore(16, 16), 50)
})

test('零块时（盲猜）给满分', () => {
  assert.equal(computeScore(16, 0), 1000)
})

test('可自定义 base 和 floor', () => {
  assert.equal(computeScore(10, 10, { floor: 5 }), 5)
  assert.equal(computeScore(10, 0, { base: 500 }), 500)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/scoring.test.js`
Expected: FAIL，报 `computeScore` 未定义 / 模块找不到。

- [ ] **Step 3: 写最小实现**

```js
// server/scoring.js
export function computeScore(totalTiles, revealedAtSubmit, options = {}) {
  const { base = 1000, floor = 50 } = options
  const raw = Math.ceil((base * (totalTiles - revealedAtSubmit)) / totalTiles)
  return raw <= 0 ? floor : raw
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/scoring.test.js`
Expected: PASS，4 个测试全过。

- [ ] **Step 5: Commit**

```bash
git add server/scoring.js test/scoring.test.js
git commit -m "feat: add scoring formula"
```

---

## Task 3: 答案匹配模块 matching.js

**Files:**
- Create: `server/matching.js`
- Test: `test/matching.test.js`

- [ ] **Step 1: 写失败测试**

```js
// test/matching.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, levenshtein, isCorrect } from '../server/matching.js'

test('normalize 去大小写/多余空格/标点', () => {
  assert.equal(normalize('  Marie   Curie! '), 'marie curie')
  assert.equal(normalize('O’Brien'), 'obrien')
})

test('levenshtein 计算编辑距离', () => {
  assert.equal(levenshtein('abc', 'abc'), 0)
  assert.equal(levenshtein('abc', 'abd'), 1)
  assert.equal(levenshtein('abc', 'aXbc'), 1)
})

test('isCorrect 完全匹配（含大小写/空格容错）', () => {
  assert.equal(isCorrect('marie curie', ['Marie Curie']), true)
  assert.equal(isCorrect('  MARIE  CURIE ', ['Marie Curie']), true)
})

test('isCorrect 匹配别名', () => {
  assert.equal(isCorrect('居里夫人', ['Marie Curie', '居里夫人']), true)
})

test('isCorrect 允许 1 个字符手滑', () => {
  assert.equal(isCorrect('marie curei', ['Marie Curie']), true) // 交换/错一个字母
  assert.equal(isCorrect('totally wrong', ['Marie Curie']), false)
})

test('空输入不算对', () => {
  assert.equal(isCorrect('   ', ['Marie Curie']), false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/matching.test.js`
Expected: FAIL，函数未定义。

- [ ] **Step 3: 写最小实现**

```js
// server/matching.js
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // 去标点（保留字母/数字/空白）
    .trim()
    .replace(/\s+/g, ' ')
}

export function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

export function isCorrect(guess, answers, options = {}) {
  const { maxEdits = 1 } = options
  const g = normalize(guess)
  if (!g) return false
  return answers.some((ans) => {
    const a = normalize(ans)
    if (!a) return false
    if (a === g) return true
    return levenshtein(a, g) <= maxEdits
  })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/matching.test.js`
Expected: PASS，全部通过。

- [ ] **Step 5: Commit**

```bash
git add server/matching.js test/matching.test.js
git commit -m "feat: add answer matching with fuzzy tolerance"
```

---

## Task 4: 游戏状态机 game.js

GameState 用一个 class 持有内存状态。题库 quiz 形如：
```js
{ questions: [ { id, photoFile, answer, aliases: [], grid: { rows, cols }, intervalMs } ] }
```

**Files:**
- Create: `server/game.js`
- Test: `test/game.test.js`

- [ ] **Step 1: 写失败测试**

```js
// test/game.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GameState } from '../server/game.js'

function makeQuiz() {
  return {
    questions: [
      { id: 'q1', photoFile: 'a.jpg', answer: 'Marie Curie', aliases: ['居里夫人'], grid: { rows: 4, cols: 4 }, intervalMs: 3000 },
      { id: 'q2', photoFile: 'b.jpg', answer: 'Ada Lovelace', aliases: [], grid: { rows: 4, cols: 4 }, intervalMs: 3000 },
    ],
  }
}

test('加入与离开玩家', () => {
  const g = new GameState()
  g.addPlayer('p1', 'Alice')
  assert.equal(g.players.get('p1').nickname, 'Alice')
  assert.equal(g.players.get('p1').totalScore, 0)
  g.markDisconnected('p1')
  assert.equal(g.players.get('p1').connected, false)
})

test('开始游戏进入第一题 REVEALING，revealedCount=0', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.startGame()
  assert.equal(g.phase, 'REVEALING')
  assert.equal(g.currentIndex, 0)
  assert.equal(g.revealedCount, 0)
  assert.equal(g.totalTiles(), 16)
})

test('revealNext 递增直到全部露完', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.startGame()
  for (let i = 0; i < 16; i++) g.revealNext()
  assert.equal(g.revealedCount, 16)
  assert.equal(g.revealNext(), false) // 已露完，返回 false
})

test('提交猜测：对的锁定得分，错的 0 分，每轮只能一次', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.addPlayer('p2', 'Bob')
  g.startGame()
  g.revealNext() // revealedCount=1
  const r1 = g.submitGuess('p1', 'marie curie')
  assert.equal(r1.correct, true)
  assert.equal(r1.score, 938)
  const r2 = g.submitGuess('p1', 'again') // 重复提交被拒
  assert.equal(r2.alreadySubmitted, true)
  const r3 = g.submitGuess('p2', 'wrong name')
  assert.equal(r3.correct, false)
  assert.equal(r3.score, 0)
})

test('结算把本轮得分累加到总分并能列排行榜', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.addPlayer('p2', 'Bob')
  g.startGame()
  g.revealNext()
  g.submitGuess('p1', 'marie curie')
  g.endRound()
  assert.equal(g.phase, 'ROUND_RESULT')
  assert.equal(g.players.get('p1').totalScore, 938)
  const board = g.leaderboard()
  assert.equal(board[0].nickname, 'Alice')
  assert.equal(board[0].totalScore, 938)
})

test('nextRound 进入下一题，最后一题后 GAME_OVER', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.startGame()
  g.endRound()
  g.nextRound()
  assert.equal(g.phase, 'REVEALING')
  assert.equal(g.currentIndex, 1)
  g.endRound()
  g.nextRound()
  assert.equal(g.phase, 'GAME_OVER')
})

test('当前题的答案集合包含正确答案与别名', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.startGame()
  assert.deepEqual(g.currentAnswers(), ['Marie Curie', '居里夫人'])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/game.test.js`
Expected: FAIL，`GameState` 未定义。

- [ ] **Step 3: 写最小实现**

```js
// server/game.js
import { computeScore } from './scoring.js'
import { isCorrect } from './matching.js'

export class GameState {
  constructor() {
    this.phase = 'LOBBY' // LOBBY | REVEALING | ROUND_RESULT | GAME_OVER
    this.players = new Map() // id -> { id, nickname, totalScore, connected }
    this.quiz = { questions: [] }
    this.currentIndex = -1
    this.revealedCount = 0
    this.submissions = new Map() // id -> { guess, revealedAtSubmit, correct, score }
  }

  loadQuiz(quiz) {
    this.quiz = quiz
  }

  addPlayer(id, nickname) {
    const existing = this.players.get(id)
    if (existing) {
      existing.nickname = nickname
      existing.connected = true
      return existing
    }
    const p = { id, nickname, totalScore: 0, connected: true }
    this.players.set(id, p)
    return p
  }

  markDisconnected(id) {
    const p = this.players.get(id)
    if (p) p.connected = false
  }

  currentQuestion() {
    return this.quiz.questions[this.currentIndex] || null
  }

  currentAnswers() {
    const q = this.currentQuestion()
    if (!q) return []
    return [q.answer, ...(q.aliases || [])]
  }

  totalTiles() {
    const q = this.currentQuestion()
    return q ? q.grid.rows * q.grid.cols : 0
  }

  startGame() {
    if (this.quiz.questions.length === 0) throw new Error('题库为空')
    this.currentIndex = 0
    this._beginRound()
  }

  _beginRound() {
    this.phase = 'REVEALING'
    this.revealedCount = 0
    this.submissions = new Map()
  }

  revealNext() {
    if (this.phase !== 'REVEALING') return false
    if (this.revealedCount >= this.totalTiles()) return false
    this.revealedCount += 1
    return true
  }

  submitGuess(playerId, guess) {
    if (this.phase !== 'REVEALING') return { rejected: true }
    if (this.submissions.has(playerId)) return { alreadySubmitted: true }
    const correct = isCorrect(guess, this.currentAnswers())
    const score = correct ? computeScore(this.totalTiles(), this.revealedCount) : 0
    const record = { guess, revealedAtSubmit: this.revealedCount, correct, score }
    this.submissions.set(playerId, record)
    return record
  }

  answeredCount() {
    return this.submissions.size
  }

  endRound() {
    this.phase = 'ROUND_RESULT'
    for (const [id, sub] of this.submissions) {
      const p = this.players.get(id)
      if (p && sub.correct) p.totalScore += sub.score
    }
  }

  nextRound() {
    if (this.currentIndex >= this.quiz.questions.length - 1) {
      this.phase = 'GAME_OVER'
      return
    }
    this.currentIndex += 1
    this._beginRound()
  }

  leaderboard() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, nickname: p.nickname, totalScore: p.totalScore }))
      .sort((a, b) => b.totalScore - a.totalScore)
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/game.test.js`
Expected: PASS，全部通过。

- [ ] **Step 5: Commit**

```bash
git add server/game.js test/game.test.js
git commit -m "feat: add game state machine"
```

---

## Task 5: 题库存储 quizStore.js

**Files:**
- Create: `server/quizStore.js`

（这是文件 IO 模块，用一个临时目录做轻量测试。）
- Test: `test/quizstore.test.js`

- [ ] **Step 1: 写失败测试**

```js
// test/quizstore.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { QuizStore } from '../server/quizStore.js'

test('保存后能读回题库', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'quiz-'))
  const store = new QuizStore(path.join(dir, 'quiz.json'))
  assert.deepEqual(await store.load(), { questions: [] }) // 不存在时返回空
  const quiz = { questions: [{ id: 'q1', photoFile: 'a.jpg', answer: 'X', aliases: [], grid: { rows: 4, cols: 4 }, intervalMs: 3000 }] }
  await store.save(quiz)
  assert.deepEqual(await store.load(), quiz)
})

test('addQuestion 生成 id 并追加', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'quiz-'))
  const store = new QuizStore(path.join(dir, 'quiz.json'))
  const q = await store.addQuestion({ photoFile: 'a.jpg', answer: 'X', aliases: ['y'], grid: { rows: 5, cols: 5 }, intervalMs: 2000 })
  assert.ok(q.id)
  const quiz = await store.load()
  assert.equal(quiz.questions.length, 1)
  assert.equal(quiz.questions[0].answer, 'X')
})

test('addQuestion 缺答案报错', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'quiz-'))
  const store = new QuizStore(path.join(dir, 'quiz.json'))
  await assert.rejects(() => store.addQuestion({ photoFile: 'a.jpg', answer: '', grid: { rows: 4, cols: 4 } }))
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/quizstore.test.js`
Expected: FAIL，`QuizStore` 未定义。

- [ ] **Step 3: 写最小实现**

```js
// server/quizStore.js
import { promises as fs } from 'node:fs'

let counter = 0
function genId() {
  counter += 1
  return `q${counter}_${process.hrtime.bigint().toString(36)}`
}

export class QuizStore {
  constructor(filePath) {
    this.filePath = filePath
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      return JSON.parse(raw)
    } catch (err) {
      if (err.code === 'ENOENT') return { questions: [] }
      throw err
    }
  }

  async save(quiz) {
    await fs.writeFile(this.filePath, JSON.stringify(quiz, null, 2), 'utf8')
  }

  async addQuestion({ photoFile, answer, aliases = [], grid = { rows: 4, cols: 4 }, intervalMs = 3000 }) {
    if (!photoFile) throw new Error('缺少照片')
    if (!answer || !String(answer).trim()) throw new Error('缺少正确答案')
    const quiz = await this.load()
    const q = { id: genId(), photoFile, answer: String(answer).trim(), aliases, grid, intervalMs }
    quiz.questions.push(q)
    await this.save(quiz)
    return q
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/quizstore.test.js`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add server/quizStore.js test/quizstore.test.js
git commit -m "feat: add quiz store"
```

---

## Task 6: 服务器与 Socket.IO 接线 index.js

服务器负责：静态托管 public/、托管 uploads/、/admin 上传与读取题库的 HTTP 接口、Socket.IO 实时事件，并把单个 GameState 暴露给所有客户端。

**Socket 事件协议（约定）：**

客户端 → 服务器：
- `player:join { nickname }` → 回 `player:joined { playerId }`，并广播 `lobby:update`
- `player:submit { guess }` → 回 `player:result { correct, score, revealedAtSubmit }`
- `host:start` → 开始游戏，进入第一题的露图循环
- `host:skip` → 结束当前轮
- `host:next` → 下一轮 / 结束
- `host:hello` → 回 `state:full`（用于主持人页连上时拉全量状态）

服务器 → 所有人广播：
- `lobby:update { players: [{nickname}] }`
- `round:start { index, total, photoUrl, grid, revealOrder, intervalMs }`
- `round:reveal { revealedCount }`
- `round:end { answer, results: [{nickname, correct, score, revealedAtSubmit}], leaderboard }`
- `game:over { leaderboard }`

其中 `revealOrder` 是打乱后的格子索引数组（长度 = rows*cols），大屏按这个顺序逐块移除遮罩；服务器只广播 `revealedCount`，大屏取 `revealOrder` 前 `revealedCount` 个。

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: 写服务器实现**

```js
// server/index.js
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
  game._revealOrder = order
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
      stopReveal() // 全部露完，停止；等待主持人 skip/next 或 host:skip 自动结束
      finishRound()
    }
  }, q.intervalMs)
}

function finishRound() {
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
  socket.on('player:join', async ({ nickname }) => {
    if (game.quiz.questions.length === 0) game.loadQuiz(await store.load())
    game.addPlayer(socket.id, String(nickname || '玩家').slice(0, 20))
    socket.emit('player:joined', { playerId: socket.id })
    io.emit('lobby:update', { players: game.leaderboard() })
  })

  socket.on('player:submit', ({ guess }) => {
    const result = game.submitGuess(socket.id, guess)
    socket.emit('player:result', result)
    io.emit('round:answered', { answeredCount: game.answeredCount() })
  })

  socket.on('host:hello', async () => {
    game.loadQuiz(await store.load())
    socket.emit('state:full', { phase: game.phase, players: game.leaderboard() })
  })

  socket.on('host:start', async () => {
    game.loadQuiz(await store.load())
    try {
      game.startGame()
      startRoundBroadcast()
    } catch (err) {
      socket.emit('host:error', { error: err.message })
    }
  })

  socket.on('host:skip', () => finishRound())

  socket.on('host:next', () => {
    game.nextRound()
    if (game.phase === 'GAME_OVER') {
      io.emit('game:over', { leaderboard: game.leaderboard() })
    } else {
      startRoundBroadcast()
    }
  })

  socket.on('disconnect', () => {
    game.markDisconnected(socket.id)
    io.emit('lobby:update', { players: game.leaderboard() })
  })
})

server.listen(PORT, () => console.log(`Who Is She → http://localhost:${PORT}`))
```

- [ ] **Step 2: 启动服务器手动冒烟测试**

Run: `npm start`
然后另开终端：
```bash
curl -s localhost:3000/api/quiz
curl -s localhost:3000/api/qrcode | head -c 80
```
Expected: 第一个返回 `{"questions":[]}`；第二个返回含 `url` 和 `dataUrl` 的 JSON 开头。按 Ctrl+C 停。

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add express + socket.io server"
```

---

## Task 7: Socket 集成测试

验证加入、提交、广播这条主链路。

**Files:**
- Test: `test/socket.test.js`

- [ ] **Step 1: 写测试（启动真实服务器 + socket.io-client）**

先装客户端依赖：
```bash
npm install --save-dev socket.io-client
```

```js
// test/socket.test.js
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { io as Client } from 'socket.io-client'

const ROOT = path.join(import.meta.dirname, '..')
let proc

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve))
}

before(async () => {
  // 准备一题题库
  await fs.writeFile(
    path.join(ROOT, 'quiz.json'),
    JSON.stringify({ questions: [{ id: 'q1', photoFile: 'none.jpg', answer: 'Marie Curie', aliases: [], grid: { rows: 2, cols: 2 }, intervalMs: 200 }] })
  )
  proc = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: '3999' } })
  await new Promise((r) => setTimeout(r, 800)) // 等服务器起来
})

after(async () => {
  proc.kill()
  await fs.rm(path.join(ROOT, 'quiz.json'), { force: true })
})

test('玩家加入并收到 lobby 更新', async () => {
  const c = Client('http://localhost:3999')
  const joined = waitFor(c, 'player:joined')
  c.emit('player:join', { nickname: 'Alice' })
  const res = await joined
  assert.ok(res.playerId)
  c.close()
})

test('开始后玩家提交正确答案得满分', async () => {
  const host = Client('http://localhost:3999')
  const player = Client('http://localhost:3999')
  await waitFor(player, 'connect')
  player.emit('player:join', { nickname: 'Bob' })
  await waitFor(player, 'player:joined')

  const started = waitFor(player, 'round:start')
  host.emit('host:start')
  await started // revealedCount 此刻为 0

  const result = waitFor(player, 'player:result')
  player.emit('player:submit', { guess: 'marie curie' })
  const r = await result
  assert.equal(r.correct, true)
  assert.ok(r.score >= 50)
  host.close()
  player.close()
})
```

- [ ] **Step 2: 运行测试**

Run: `node --test test/socket.test.js`
Expected: PASS（两个测试通过）。若超时，确认 PORT=3999 未被占用。

- [ ] **Step 3: Commit**

```bash
git add test/socket.test.js package.json package-lock.json
git commit -m "test: add socket integration tests"
```

---

## Task 8: 配置页 admin

**Files:**
- Create: `public/shared.css`
- Create: `public/admin.html`
- Create: `public/admin.js`

- [ ] **Step 1: 写 shared.css**

```css
/* public/shared.css */
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; }
.wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
h1 { color: #ffd166; }
button { background: #ffd166; color: #1a1a2e; border: 0; border-radius: 8px; padding: 12px 20px; font-size: 16px; font-weight: 700; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
input { padding: 10px; border-radius: 6px; border: 1px solid #444; background: #16213e; color: #eee; font-size: 16px; }
.card { background: #16213e; border-radius: 12px; padding: 16px; margin: 12px 0; }
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
```

- [ ] **Step 2: 写 admin.html**

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>配置题库 · Who Is She</title>
  <link rel="stylesheet" href="/shared.css" />
</head>
<body>
  <div class="wrap">
    <h1>📋 配置题库</h1>
    <div class="card">
      <h3>添加一张照片</h3>
      <div class="row">
        <input type="file" id="photo" accept="image/*" />
        <input type="text" id="answer" placeholder="正确答案（人名）" />
        <input type="text" id="aliases" placeholder="别名，逗号分隔（可选）" />
      </div>
      <div class="row" style="margin-top:10px">
        网格 <input type="number" id="rows" value="4" min="2" max="8" style="width:60px" /> ×
        <input type="number" id="cols" value="4" min="2" max="8" style="width:60px" />
        每块间隔(ms) <input type="number" id="interval" value="3000" step="500" style="width:90px" />
        <button id="add">添加</button>
      </div>
      <p id="msg"></p>
    </div>
    <div class="card">
      <h3>已配置的题目</h3>
      <ul id="list"></ul>
    </div>
    <a href="/host"><button>前往主持人大屏 →</button></a>
  </div>
  <script src="/admin.js"></script>
</body>
</html>
```

- [ ] **Step 3: 写 admin.js**

```js
// public/admin.js
const $ = (id) => document.getElementById(id)

async function refresh() {
  const quiz = await (await fetch('/api/quiz')).json()
  $('list').innerHTML = quiz.questions
    .map((q, i) => `<li>#${i + 1} <b>${q.answer}</b> — ${q.grid.rows}×${q.grid.cols}，${q.intervalMs}ms${q.aliases.length ? '（别名：' + q.aliases.join('、') + '）' : ''}</li>`)
    .join('')
}

$('add').onclick = async () => {
  const file = $('photo').files[0]
  if (!file) { $('msg').textContent = '请选择图片'; return }
  if (!$('answer').value.trim()) { $('msg').textContent = '请填正确答案'; return }
  const fd = new FormData()
  fd.append('photo', file)
  fd.append('answer', $('answer').value)
  fd.append('aliases', $('aliases').value)
  fd.append('rows', $('rows').value)
  fd.append('cols', $('cols').value)
  fd.append('intervalMs', $('interval').value)
  const res = await fetch('/api/questions', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) { $('msg').textContent = '错误：' + data.error; return }
  $('msg').textContent = '已添加 ✓'
  $('photo').value = ''
  $('answer').value = ''
  $('aliases').value = ''
  refresh()
}

refresh()
```

- [ ] **Step 4: 手动验证**

Run: `npm start`，浏览器开 `http://localhost:3000/admin`，上传一张图片+填答案点添加，确认下方列表出现该题；`quiz.json` 生成。

- [ ] **Step 5: Commit**

```bash
git add public/shared.css public/admin.html public/admin.js
git commit -m "feat: add admin config page"
```

---

## Task 9: 主持人大屏页 host

照片格子用 CSS grid 叠遮罩：一个容器里放 `<img>` 铺满，上面盖 `rows*cols` 个 `.tile` 遮罩块；按 `revealOrder` 前 `revealedCount` 个把对应 tile 设为透明。

**Files:**
- Create: `public/host.html`
- Create: `public/host.js`

- [ ] **Step 1: 写 host.html**

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>大屏 · Who Is She</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    .stage { text-align: center; }
    .photo-box { position: relative; width: min(70vmin, 600px); aspect-ratio: 1; margin: 16px auto; background:#000; }
    .photo-box img { width: 100%; height: 100%; object-fit: cover; display:block; }
    .grid { position: absolute; inset: 0; display: grid; }
    .tile { background: #0d0d1a; transition: opacity .4s; }
    .tile.revealed { opacity: 0; }
    #qr img { width: 180px; }
    .players span { display:inline-block; background:#16213e; padding:6px 12px; border-radius:20px; margin:4px; }
    .lead { font-size: 20px; }
    .lead li { margin: 6px 0; }
    .hidden { display:none; }
  </style>
</head>
<body>
  <div class="wrap stage">
    <h1>🕵️ Who Is She</h1>

    <div id="lobby">
      <div id="qr"></div>
      <p>扫码加入：<b id="joinUrl"></b></p>
      <div class="players" id="players"></div>
      <button id="startBtn">开始游戏</button>
      <p id="lobbyMsg"></p>
    </div>

    <div id="game" class="hidden">
      <p>第 <span id="qIndex"></span> / <span id="qTotal"></span> 题 · 已答 <span id="answered">0</span> 人</p>
      <div class="photo-box">
        <img id="photo" alt="" />
        <div class="grid" id="grid"></div>
      </div>
      <button id="skipBtn">跳过本轮</button>
    </div>

    <div id="result" class="hidden">
      <h2>答案：<span id="answer"></span></h2>
      <ol class="lead" id="leaderboard"></ol>
      <button id="nextBtn">下一题 →</button>
    </div>

    <div id="over" class="hidden">
      <h2>🏆 最终排行</h2>
      <ol class="lead" id="finalBoard"></ol>
    </div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/host.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 host.js**

```js
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
```

- [ ] **Step 3: 手动验证**

Run: `npm start`，开 `http://localhost:3000/host`，确认显示二维码与加入网址；点开始（需先在 /admin 加过题）能看到照片格子开始逐块露出。

- [ ] **Step 4: Commit**

```bash
git add public/host.html public/host.js
git commit -m "feat: add host display page"
```

---

## Task 10: 玩家手机页 play

**Files:**
- Create: `public/play.html`
- Create: `public/play.js`

- [ ] **Step 1: 写 play.html**

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>加入 · Who Is She</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    .big { width: 100%; font-size: 20px; padding: 16px; }
    .status { font-size: 18px; margin-top: 16px; min-height: 2em; }
    .ok { color: #06d6a0; }
    .bad { color: #ef476f; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>🕵️ Who Is She</h1>

    <div id="joinView">
      <input type="text" id="nickname" class="big" placeholder="你的昵称" maxlength="20" />
      <button id="joinBtn" class="big" style="margin-top:12px">加入游戏</button>
    </div>

    <div id="playView" class="hidden">
      <p>嗨 <b id="me"></b>！看大屏，猜猜是谁 👀</p>
      <input type="text" id="guess" class="big" placeholder="输入名字" />
      <button id="submitBtn" class="big" style="margin-top:12px">提交答案</button>
      <div class="status" id="status"></div>
      <p>当前总分：<b id="score">0</b></p>
    </div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/play.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 play.js**

```js
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
```

- [ ] **Step 3: 手动验证**

Run: `npm start`，手机或另一浏览器标签开 `http://<本机IP>:3000/play`，输入昵称加入，确认 /host 的等待区出现昵称；主持人开始后能提交并看到结果。

- [ ] **Step 4: Commit**

```bash
git add public/play.html public/play.js
git commit -m "feat: add player phone page"
```

---

## Task 11: 全链路手动联调与全部测试

**Files:** 无新增

- [ ] **Step 1: 运行全部自动化测试**

Run: `npm test`
Expected: scoring / matching / game / quizstore / socket 所有测试通过。

- [ ] **Step 2: 完整玩一局（手动）**

1. `npm start`
2. 电脑开 `/admin`，上传 2 张照片配好答案
3. 电脑开 `/host`（投影），手机扫码进 `/play` 加入 2 个昵称
4. 点开始 → 确认照片逐块露出、有人提交时大屏"已答人数"增加
5. 露完或点"跳过本轮" → 确认揭晓答案 + 排行榜，越早答对分越高
6. 点"下一题"，最后一题后看到最终排行榜

- [ ] **Step 3: 验证断线重连**

手机刷新 `/play` 页面，确认昵称还在、能继续玩。

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: complete who-is-she game MVP"
```

---

## 与 Spec 的覆盖对照（自检）

- 同屏/扫码加入 → Task 6 二维码 + Task 10 play 页 ✓
- 手动输入名字 + 容错匹配 → Task 3 matching + Task 10 ✓
- 越早猜中越高分 → Task 2 scoring + Task 4 提交锁定 r ✓
- 自动定时逐块露出，露完/跳过结束 → Task 6 露图循环 ✓
- 提前上传配置题库 → Task 5 quizStore + Task 8 admin ✓
- 每轮只能提交一次、所有答对的人都得分 → Task 4 submitGuess / endRound ✓
- 断线重连 → Task 10 localStorage 恢复 + 自动重连 ✓
- 三个页面 LOBBY/REVEALING/ROUND_RESULT/GAME_OVER 状态 → Task 4 + Task 9 视图切换 ✓
- 测试策略（单元 + 集成 + 手动）→ Task 2/3/4/5/7/11 ✓
- YAGNI：单局、无数据库、玩家端不显示照片 → 全程遵守 ✓
