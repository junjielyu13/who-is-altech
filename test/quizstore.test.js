import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { QuizStore } from '../server/quizStore.js'

test('保存后能读回题库', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'quiz-'))
  const store = new QuizStore(path.join(dir, 'quiz.json'))
  assert.deepEqual(await store.load(), { questions: [] })
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
