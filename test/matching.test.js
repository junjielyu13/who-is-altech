import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, levenshtein, isCorrect } from '../server/matching.js'

test('normalize 去大小写/多余空格/标点', () => {
  assert.equal(normalize('  Marie   Curie! '), 'marie curie')
  assert.equal(normalize("O’Brien"), 'obrien')
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
  assert.equal(isCorrect('marie curei', ['Marie Curie']), true)
  assert.equal(isCorrect('totally wrong', ['Marie Curie']), false)
})

test('空输入不算对', () => {
  assert.equal(isCorrect('   ', ['Marie Curie']), false)
})
