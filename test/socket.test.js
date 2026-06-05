import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { io as Client } from 'socket.io-client'

const ROOT = path.join(import.meta.dirname, '..')
// Use an isolated temp uploads dir so the test never touches the project's real uploads/.
// The file name IS the answer, so "Marie Curie.jpg" → answer "Marie Curie".
const UPLOADS_DIR = path.join(os.tmpdir(), `wis-test-uploads-${process.pid}`)
let proc

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

before(async () => {
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.writeFile(path.join(UPLOADS_DIR, 'Marie Curie.jpg'), '')
  proc = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: '3999', UPLOADS_DIR } })
  await new Promise((r) => setTimeout(r, 800))
})

after(async () => {
  proc.kill()
  await fs.rm(UPLOADS_DIR, { recursive: true, force: true })
})

test('玩家加入并收到 lobby 更新', async () => {
  const c = Client('http://localhost:3999', { forceNew: true })
  const joined = waitFor(c, 'player:joined')
  c.emit('player:join', { nickname: 'Alice' })
  const res = await joined
  assert.ok(res.playerId)
  c.close()
})

test('开始后玩家提交正确答案得满分', async () => {
  const host = Client('http://localhost:3999', { forceNew: true })
  const player = Client('http://localhost:3999', { forceNew: true })
  await waitFor(player, 'connect')
  player.emit('player:join', { nickname: 'Bob' })
  await waitFor(player, 'player:joined')

  const started = waitFor(player, 'round:start')
  host.emit('host:start')
  await started

  const result = waitFor(player, 'player:result')
  player.emit('player:submit', { guess: 'marie curie' })
  const r = await result
  assert.equal(r.correct, true)
  assert.ok(r.score >= 50)
  host.close()
  player.close()
})

test('暂停冻结露图并屏蔽提交，恢复后照常进行', async () => {
  // forceNew so host and player are separate connections (socket.io-client multiplexes the same URL)
  const host = Client('http://localhost:3999', { forceNew: true })
  const player = Client('http://localhost:3999', { forceNew: true })
  // register the listener BEFORE emitting and let socket.io buffer the emit until connected —
  // waiting on 'connect' separately is racy (it can fire before .once() is attached)
  const reset = waitFor(host, 'game:reset')
  host.emit('host:restart') // earlier tests leave the game mid-round; reset to the lobby first
  await reset

  const joined = waitFor(player, 'player:joined')
  player.emit('player:join', { nickname: 'Cara' })
  await joined

  const started = waitFor(player, 'round:start')
  host.emit('host:start')
  await started
  await waitFor(player, 'round:reveal') // a tile revealed → the loop is running

  const paused = waitFor(player, 'game:pause')
  host.emit('host:pause')
  await paused

  // while paused: no further reveals fire, and a submit is ignored (no player:result)
  let reveals = 0
  let gotResult = false
  player.on('round:reveal', () => { reveals++ })
  player.once('player:result', () => { gotResult = true })
  player.emit('player:submit', { guess: 'marie curie' })
  await sleep(1500) // longer than one reveal interval (1250ms)
  assert.equal(reveals, 0, '暂停期间不应再露格子')
  assert.equal(gotResult, false, '暂停期间提交应被忽略')

  // resume → submitting now works again
  const resumed = waitFor(player, 'game:resume')
  host.emit('host:resume')
  await resumed
  const result = waitFor(player, 'player:result')
  player.emit('player:submit', { guess: 'marie curie' })
  const r = await result
  assert.equal(r.correct, true)
  host.close()
  player.close()
})

test('round:end 带上每个人写的答案（guess）供大屏展示', async () => {
  const host = Client('http://localhost:3999', { forceNew: true })
  const player = Client('http://localhost:3999', { forceNew: true })
  const reset = waitFor(host, 'game:reset')
  host.emit('host:restart')
  await reset

  const joined = waitFor(player, 'player:joined')
  player.emit('player:join', { nickname: 'Dani' })
  await joined

  const started = waitFor(player, 'round:start')
  host.emit('host:start')
  await started

  // the lone connected player answers → everyoneAnswered → the round ends and broadcasts results
  const ended = waitFor(player, 'round:end')
  player.emit('player:submit', { guess: 'una cosa rara' })
  const { results } = await ended
  const mine = results.find((x) => x.nickname === 'Dani')
  assert.ok(mine, 'el jugador aparece en los resultados')
  assert.equal(mine.guess, 'una cosa rara') // the raw text they typed comes through
  host.close()
  player.close()
})
