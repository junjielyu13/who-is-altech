// public/admin.js — upload photos (file name = answer) and manage the list. No quiz.json.
const $ = (id) => document.getElementById(id)
const { t, applyI18n, mountLangSwitch } = I18N

async function refresh() {
  const quiz = await (await fetch('/api/quiz')).json()
  const list = $('list'); list.innerHTML = ''
  if (!quiz.questions.length) {
    const li = document.createElement('li'); li.textContent = t('empty_list'); list.appendChild(li)
    return
  }
  for (const q of quiz.questions) {
    const li = document.createElement('li')
    const img = document.createElement('img'); img.src = '/uploads/' + encodeURIComponent(q.photoFile); img.alt = ''
    const name = document.createElement('span'); name.className = 'name'; name.textContent = q.answer
    const del = document.createElement('button')
    del.textContent = t('btn_delete'); del.style.cssText = 'padding:6px 12px;font-size:13px'
    del.onclick = async () => { await fetch('/api/photos/' + encodeURIComponent(q.photoFile), { method: 'DELETE' }); refresh() }
    li.append(img, name, del)
    list.appendChild(li)
  }
}

$('upload').onclick = async () => {
  const files = $('photos').files
  if (!files.length) { $('msg').textContent = t('msg_pick_photo'); return }
  const fd = new FormData()
  for (const f of files) fd.append('photos', f)
  const res = await fetch('/api/photos', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) { $('msg').textContent = t('msg_error') + (data.error || ''); return }
  $('msg').textContent = t('msg_added')
  $('photos').value = ''
  refresh()
}

applyI18n()
mountLangSwitch()
document.addEventListener('i18n:change', () => { $('msg').textContent = ''; refresh() })
refresh()
