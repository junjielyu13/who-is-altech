import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const code = readFileSync(path.join(import.meta.dirname, '..', 'public', 'i18n.js'), 'utf8')

// Load i18n.js (a browser classic script) in a sandbox with a localStorage stub,
// and return the exposed I18N global. `storedLang` simulates a prior saved choice.
function load(storedLang) {
  const store = {}
  if (storedLang) store.wis_lang = storedLang
  const ctx = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
    },
  }
  vm.createContext(ctx)
  vm.runInContext(code, ctx)
  return ctx.I18N
}

test('默认语言是 es（没有保存过选择）', () => {
  assert.equal(load(null).getLang(), 'es')
})

test('t() 按当前语言取值', () => {
  assert.equal(load('es').t('btn_start'), 'Empezar juego')
  assert.equal(load('zh').t('btn_start'), '开始游戏')
})

test('t() 支持 {var} 插值', () => {
  assert.equal(load('es').t('status_correct', { score: 875 }), '¡Correcto! +875 🎉')
  assert.equal(load('zh').t('status_correct', { score: 875 }), '答对！+875 分 🎉')
  assert.equal(load('es').t('round_progress', { i: 2, n: 5, a: 3 }), 'Foto 2/5 · 3 han respondido')
})

test('未知 key 回退到 key 本身', () => {
  assert.equal(load('es').t('nonexistent_key'), 'nonexistent_key')
})

test('未知/无效语言回退到默认 es', () => {
  assert.equal(load('fr').getLang(), 'es')
  assert.equal(load('fr').t('btn_start'), 'Empezar juego')
})

test('interpolate 保留未提供的占位符', () => {
  assert.equal(load('es').interpolate('hola {name}', {}), 'hola {name}')
})
