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
  assert.equal(g.revealNext(), false)
})

test('提交猜测：对的锁定得分，错的 0 分，每轮只能一次', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.addPlayer('p2', 'Bob')
  g.startGame()
  g.revealNext()
  const r1 = g.submitGuess('p1', 'marie curie')
  assert.equal(r1.correct, true)
  assert.equal(r1.score, 938)
  const r2 = g.submitGuess('p1', 'again')
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
