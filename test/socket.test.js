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
  await started

  const result = waitFor(player, 'player:result')
  player.emit('player:submit', { guess: 'marie curie' })
  const r = await result
  assert.equal(r.correct, true)
  assert.ok(r.score >= 50)
  host.close()
  player.close()
})
