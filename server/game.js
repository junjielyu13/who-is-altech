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

  restart() {
    this.phase = 'LOBBY'
    this.currentIndex = -1
    this.revealedCount = 0
    this.submissions = new Map()
    for (const p of this.players.values()) p.totalScore = 0
  }

  leaderboard() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, nickname: p.nickname, totalScore: p.totalScore }))
      .sort((a, b) => b.totalScore - a.totalScore)
  }
}
