// public/i18n.js — lightweight i18n for the three pages.
// Loaded as a classic <script> before each page script; exposes a global `I18N`.
// Default language is Spanish ('es'); choice is persisted per-device in localStorage.
;(function (global) {
  const TRANSLATIONS = {
    es: {
      brand: 'Who Is She',
      // admin
      admin_title: 'Configurar fotos · Who Is She',
      admin_h1: '📋 Configurar fotos',
      admin_add: 'Añadir una foto',
      ph_answer: 'Respuesta correcta (nombre)',
      ph_aliases: 'Alias, separados por comas (opcional)',
      grid_label: 'Cuadrícula',
      interval_label: 'Intervalo por bloque (ms)',
      btn_add: 'Añadir',
      configured_list: 'Fotos configuradas',
      go_host: 'Ir a la pantalla del anfitrión →',
      msg_pick_photo: 'Selecciona una imagen',
      msg_need_answer: 'Escribe la respuesta correcta',
      msg_added: 'Añadida ✓',
      msg_error: 'Error: ',
      alias_part: '(alias: {aliases})',
      // host
      host_title: 'Pantalla · Who Is She',
      scan_join: 'Escanea para unirte:',
      btn_start: 'Empezar juego',
      round_progress: 'Foto {i}/{n} · {a} han respondido',
      btn_skip: 'Saltar ronda',
      answer_label: 'Respuesta:',
      btn_next: 'Siguiente →',
      final_ranking: '🏆 Clasificación final',
      btn_restart: 'Jugar de nuevo',
      round_result: '{name} acertó +{score}',
      error_empty_quiz: 'No se puede empezar: no hay fotos configuradas',
      error_generic: 'No se puede empezar',
      // play
      play_title: 'Unirse · Who Is She',
      ph_nickname: 'Tu apodo',
      btn_join: 'Unirse al juego',
      greeting: '¡Hola {name}! Mira la pantalla y adivina 👀',
      ph_guess: 'Escribe el nombre',
      btn_submit: 'Enviar respuesta',
      total_score: 'Puntos totales:',
      status_already: 'Ya respondiste esta ronda',
      status_cannot: 'Ahora no puedes enviar',
      status_correct: '¡Correcto! +{score} 🎉',
      status_locked: 'Bloqueado, espera el resultado…',
      status_round_end: 'Ronda terminada, mira la pantalla 👀',
      default_nick: 'Jugador',
    },
    zh: {
      brand: 'Who Is She',
      admin_title: '配置题库 · Who Is She',
      admin_h1: '📋 配置题库',
      admin_add: '添加一张照片',
      ph_answer: '正确答案（人名）',
      ph_aliases: '别名，逗号分隔（可选）',
      grid_label: '网格',
      interval_label: '每块间隔(ms)',
      btn_add: '添加',
      configured_list: '已配置的题目',
      go_host: '前往主持人大屏 →',
      msg_pick_photo: '请选择图片',
      msg_need_answer: '请填正确答案',
      msg_added: '已添加 ✓',
      msg_error: '错误：',
      alias_part: '（别名：{aliases}）',
      host_title: '大屏 · Who Is She',
      scan_join: '扫码加入：',
      btn_start: '开始游戏',
      round_progress: '第 {i}/{n} 题 · 已答 {a} 人',
      btn_skip: '跳过本轮',
      answer_label: '答案：',
      btn_next: '下一题 →',
      final_ranking: '🏆 最终排行',
      btn_restart: '重新开始',
      round_result: '{name} 猜中 +{score}',
      error_empty_quiz: '无法开始：题库为空',
      error_generic: '无法开始',
      play_title: '加入 · Who Is She',
      ph_nickname: '你的昵称',
      btn_join: '加入游戏',
      greeting: '嗨 {name}！看大屏，猜猜是谁 👀',
      ph_guess: '输入名字',
      btn_submit: '提交答案',
      total_score: '当前总分：',
      status_already: '你这轮已经答过啦',
      status_cannot: '现在不能提交',
      status_correct: '答对！+{score} 分 🎉',
      status_locked: '已锁定，等待揭晓…',
      status_round_end: '本轮结束，看大屏揭晓 👀',
      default_nick: '玩家',
    },
  }

  const DEFAULT_LANG = 'es'
  const LANGS = [['es', 'ES'], ['zh', '中']]
  let switchButtons = []

  function interpolate(str, vars) {
    if (!vars) return str
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
  }

  function getLang() {
    try {
      const l = localStorage.getItem('wis_lang')
      return l && TRANSLATIONS[l] ? l : DEFAULT_LANG
    } catch (e) {
      return DEFAULT_LANG
    }
  }

  function t(key, vars) {
    const dict = TRANSLATIONS[getLang()] || TRANSLATIONS[DEFAULT_LANG]
    const raw = dict[key] != null ? dict[key] : (TRANSLATIONS[DEFAULT_LANG][key] != null ? TRANSLATIONS[DEFAULT_LANG][key] : key)
    return interpolate(raw, vars)
  }

  function applyI18n(root) {
    const r = root || document
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')) })
    r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-ph')) })
  }

  function setLang(lang) {
    if (!TRANSLATIONS[lang]) return
    try { localStorage.setItem('wis_lang', lang) } catch (e) {}
    applyI18n()
    for (const b of switchButtons) b.el.classList.toggle('active', b.code === lang)
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }))
  }

  function mountLangSwitch() {
    const cur = getLang()
    const box = document.createElement('div')
    box.className = 'lang-switch'
    switchButtons = []
    for (const [code, label] of LANGS) {
      const b = document.createElement('button')
      b.textContent = label
      if (code === cur) b.classList.add('active')
      b.onclick = () => setLang(code)
      box.appendChild(b)
      switchButtons.push({ code, el: b })
    }
    document.body.appendChild(box)
  }

  global.I18N = { TRANSLATIONS, interpolate, getLang, setLang, t, applyI18n, mountLangSwitch }
})(typeof window !== 'undefined' ? window : globalThis)
