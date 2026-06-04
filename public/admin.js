// public/admin.js
const $ = (id) => document.getElementById(id)

async function refresh() {
  const quiz = await (await fetch('/api/quiz')).json()
  const list = $('list'); list.innerHTML = ''
  quiz.questions.forEach((q, i) => {
    const li = document.createElement('li')
    const aliasPart = q.aliases.length ? `（别名：${q.aliases.join('、')}）` : ''
    li.textContent = `#${i + 1} ${q.answer} — ${q.grid.rows}×${q.grid.cols}，${q.intervalMs}ms${aliasPart}`
    list.appendChild(li)
  })
}

$('add').onclick = async () => {
  const file = $('photo').files[0]
  if (!file) { $('msg').textContent = '请选择图片'; return }
  if (!$('answer').value.trim()) { $('msg').textContent = '请填正确答案'; return }
  const fd = new FormData()
  fd.append('photo', file)
  fd.append('answer', $('answer').value)
  fd.append('aliases', $('aliases').value)
  fd.append('rows', $('rows').value)
  fd.append('cols', $('cols').value)
  fd.append('intervalMs', $('interval').value)
  const res = await fetch('/api/questions', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) { $('msg').textContent = '错误：' + data.error; return }
  $('msg').textContent = '已添加 ✓'
  $('photo').value = ''
  $('answer').value = ''
  $('aliases').value = ''
  refresh()
}

refresh()
