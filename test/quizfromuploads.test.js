import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildQuiz } from '../server/quizFromUploads.js'

async function tmpDirWith(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wis-up-'))
  for (const f of files) await fs.writeFile(path.join(dir, f), '')
  return dir
}

test('扫描 uploads：文件名即答案，忽略非图片，按文件名排序', async () => {
  const dir = await tmpDirWith(['Junjie.jpeg', 'Ada.png', 'notes.txt'])
  const quiz = await buildQuiz(dir)
  assert.equal(quiz.questions.length, 2)
  assert.deepEqual(quiz.questions.map((q) => q.answer), ['Ada', 'Junjie'])
  assert.equal(quiz.questions[1].photoFile, 'Junjie.jpeg')
})

test('答案保留空格和中文', async () => {
  const dir = await tmpDirWith(['Marie Curie.jpg', '李娟.png'])
  const quiz = await buildQuiz(dir)
  const answers = quiz.questions.map((q) => q.answer)
  assert.ok(answers.includes('Marie Curie'))
  assert.ok(answers.includes('李娟'))
})

test('默认网格 4×4、间隔 3000ms', async () => {
  const dir = await tmpDirWith(['x.jpg'])
  const quiz = await buildQuiz(dir)
  assert.deepEqual(quiz.questions[0].grid, { rows: 4, cols: 4 })
  assert.equal(quiz.questions[0].intervalMs, 3000)
})

test('可覆盖网格与间隔', async () => {
  const dir = await tmpDirWith(['x.jpg'])
  const quiz = await buildQuiz(dir, { grid: { rows: 5, cols: 5 }, intervalMs: 2000 })
  assert.deepEqual(quiz.questions[0].grid, { rows: 5, cols: 5 })
  assert.equal(quiz.questions[0].intervalMs, 2000)
})

test('目录不存在时返回空题库', async () => {
  const quiz = await buildQuiz(path.join(os.tmpdir(), 'wis-nope-' + Math.random().toString(36).slice(2)))
  assert.deepEqual(quiz, { questions: [] })
})
