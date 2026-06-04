// public/admin.js
const $ = (id) => document.getElementById(id)
const { t, applyI18n, mountLangSwitch } = I18N

async function refresh() {
  const quiz = await (await fetch('/api/quiz')).json()
  const list = $('list'); list.innerHTML = ''
  quiz.questions.forEach((q, i) => {
    const li = document.createElement('li')
    const aliasPart = q.aliases.length ? t('alias_part', { aliases: q.aliases.join('、') }) : ''
    li.textContent = `#${i + 1} ${q.answer} — ${q.grid.rows}×${q.grid.cols}, ${q.intervalMs}ms${aliasPart}`
    list.appendChild(li)
  })
}

$('add').onclick = async () => {
  const file = $('photo').files[0]
  if (!file) { $('msg').textContent = t('msg_pick_photo'); return }
  if (!$('answer').value.trim()) { $('msg').textContent = t('msg_need_answer'); return }
  const fd = new FormData()
  fd.append('photo', file)
  fd.append('answer', $('answer').value)
  fd.append('aliases', $('aliases').value)
  fd.append('rows', $('rows').value)
  fd.append('cols', $('cols').value)
  fd.append('intervalMs', $('interval').value)
  const res = await fetch('/api/questions', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) { $('msg').textContent = t('msg_error') + data.error; return }
  $('msg').textContent = t('msg_added')
  $('photo').value = ''
  $('answer').value = ''
  $('aliases').value = ''
  refresh()
}

applyI18n()
mountLangSwitch()
document.addEventListener('i18n:change', () => { $('msg').textContent = ''; refresh() })
refresh()
