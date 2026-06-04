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

test('everyoneAnswered：所有在线玩家答完才为真，离线玩家不计', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.addPlayer('p2', 'Bob')
  g.startGame()
  assert.equal(g.everyoneAnswered(), false)
  g.submitGuess('p1', 'marie curie')
  assert.equal(g.everyoneAnswered(), false) // p2 还没答
  g.submitGuess('p2', 'nope')
  assert.equal(g.everyoneAnswered(), true)  // 两人都答了
})

test('everyoneAnswered：离线玩家不阻塞本轮结束', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.addPlayer('p2', 'Bob')
  g.startGame()
  g.markDisconnected('p2')             // p2 掉线
  g.submitGuess('p1', 'marie curie')   // 仅剩的在线玩家答了
  assert.equal(g.everyoneAnswered(), true)
})

test('everyoneAnswered：无人在线时为假，避免瞬间结束', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.startGame()
  g.markDisconnected('p1')
  assert.equal(g.everyoneAnswered(), false)
})

test('shuffleQuestions：用可控随机数重排题目顺序', () => {
  const g = new GameState()
  g.loadQuiz({ questions: ['a', 'b', 'c', 'd'].map((x) => ({ id: x, answer: x })) })
  // 一个确定性的 rng，使顺序明显改变
  const seq = [0.99, 0.0, 0.99]
  let i = 0
  g.shuffleQuestions(() => seq[i++])
  const order = g.quiz.questions.map((q) => q.id)
  assert.equal(order.length, 4)
  assert.deepEqual([...order].sort(), ['a', 'b', 'c', 'd']) // 仍是同一组题
  assert.notDeepEqual(order, ['a', 'b', 'c', 'd'])          // 但顺序变了
})

test('leaderboard 包含 connected 状态', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.addPlayer('p2', 'Bob')
  g.markDisconnected('p2')
  const board = g.leaderboard()
  const bob = board.find((p) => p.nickname === 'Bob')
  const alice = board.find((p) => p.nickname === 'Alice')
  assert.equal(alice.connected, true)
  assert.equal(bob.connected, false)
})

test('当前题的答案集合包含正确答案与别名', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.startGame()
  assert.deepEqual(g.currentAnswers(), ['Marie Curie', '居里夫人'])
})

test('restart 重置分数回到 LOBBY 并保留玩家，可再次开始', () => {
  const g = new GameState()
  g.loadQuiz(makeQuiz())
  g.addPlayer('p1', 'Alice')
  g.startGame()
  g.revealNext()
  g.submitGuess('p1', 'marie curie')
  g.endRound()
  assert.equal(g.players.get('p1').totalScore, 938)
  g.restart()
  assert.equal(g.phase, 'LOBBY')
  assert.equal(g.currentIndex, -1)
  assert.equal(g.revealedCount, 0)
  assert.equal(g.players.get('p1').totalScore, 0)
  assert.ok(g.players.has('p1'))
  g.startGame()
  assert.equal(g.phase, 'REVEALING')
  assert.equal(g.currentIndex, 0)
})
