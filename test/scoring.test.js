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
