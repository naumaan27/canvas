import { createQuickdraw } from '@quickdrawjs/core'
import '@quickdrawjs/core/quickdraw.css'

const LEGACY_DOC_KEY = 'quickdraw-app-doc'
const THEME_KEY = 'quickdraw-app-theme'
const INDEX_KEY = 'quickdraw-files'
const fileKey = (id) => `quickdraw-file:${id}`

const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
const theme = localStorage.getItem(THEME_KEY) || (prefersDark ? 'dark' : 'light')

const board = createQuickdraw({
  container: document.getElementById('board'),
  theme,
  grid: 'lines',
})

const { editor } = board
const { store } = editor

// ---- file index -------------------------------------------------------------
// { current: id, files: [{ id, name, updatedAt }] } in localStorage; each
// file's snapshot lives under its own key so one huge board can't corrupt
// the rest.
const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

function loadIndex() {
  try {
    const idx = JSON.parse(localStorage.getItem(INDEX_KEY))
    if (idx && Array.isArray(idx.files) && idx.files.length) return idx
  } catch {}
  return null
}

function saveIndex() {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {}
}

let index = loadIndex()
if (!index) {
  // First run on the new format: adopt the pre-files-era board, if any.
  const id = newId()
  index = { current: id, files: [{ id, name: 'Untitled', updatedAt: Date.now() }] }
  const legacy = localStorage.getItem(LEGACY_DOC_KEY)
  if (legacy) {
    try { localStorage.setItem(fileKey(id), legacy) } catch {}
    localStorage.removeItem(LEGACY_DOC_KEY)
  }
  saveIndex()
}

const currentFile = () =>
  index.files.find((f) => f.id === index.current) || index.files[0]

// ---- persistence ------------------------------------------------------------
let saveTimer

function saveNow() {
  clearTimeout(saveTimer)
  const file = currentFile()
  try {
    localStorage.setItem(fileKey(file.id), JSON.stringify(store.getSnapshot()))
    file.updatedAt = Date.now()
    saveIndex()
  } catch {
    // Quota exceeded (huge pasted images) — keep drawing, skip the save.
  }
}

function openFile(id, { fit = true } = {}) {
  const file = index.files.find((f) => f.id === id)
  if (!file) return
  index.current = file.id
  saveIndex()
  let snap = null
  try {
    const raw = localStorage.getItem(fileKey(file.id))
    if (raw) snap = JSON.parse(raw)
  } catch {
    // A corrupt document shouldn't brick the app — open it blank.
    localStorage.removeItem(fileKey(file.id))
  }
  store.loadSnapshot(snap || { document: { store: {} } }, 'remote')
  // A fresh file starts with a fresh history — undo shouldn't cross files.
  store.undos.length = 0
  store.redos.length = 0
  if (fit && snap) editor.fitContent()
  nameInput.value = file.name
}

store.listen(() => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 400)
})

// ---- file bar UI ------------------------------------------------------------
const filebar = document.getElementById('filebar')
const filesBtn = document.getElementById('files-btn')
const newBtn = document.getElementById('new-file-btn')
const nameInput = document.getElementById('file-name')
const menu = document.getElementById('files-menu')

function sizeNameInput() {
  // Grow with the text so the hover pill hugs the name.
  nameInput.style.width = `${Math.min(20, Math.max(4, nameInput.value.length + 1))}ch`
}

function renderMenu() {
  menu.textContent = ''
  const files = [...index.files].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const file of files) {
    const row = document.createElement('div')
    row.className = `qd-file-row${file.id === index.current ? ' current' : ''}`
    row.setAttribute('role', 'menuitem')

    const dot = document.createElement('span')
    dot.className = 'dot'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = file.name
    row.append(dot, name)

    if (index.files.length > 1) {
      const del = document.createElement('button')
      del.className = 'del'
      del.type = 'button'
      del.textContent = '×'
      del.title = `Delete “${file.name}”`
      del.setAttribute('aria-label', `Delete ${file.name}`)
      del.addEventListener('click', (e) => {
        e.stopPropagation()
        deleteFile(file.id)
      })
      row.append(del)
    }

    row.addEventListener('click', () => {
      closeMenu()
      if (file.id !== index.current) {
        saveNow()
        openFile(file.id)
      }
    })
    menu.append(row)
  }
}

function openMenu() {
  renderMenu()
  menu.hidden = false
  filesBtn.setAttribute('aria-expanded', 'true')
}

function closeMenu() {
  menu.hidden = true
  filesBtn.setAttribute('aria-expanded', 'false')
}

filesBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  menu.hidden ? openMenu() : closeMenu()
})

document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target) && e.target !== filesBtn) closeMenu()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) closeMenu()
})

function createFile() {
  saveNow()
  const id = newId()
  const n = index.files.length + 1
  index.files.push({ id, name: `Untitled ${n}`, updatedAt: Date.now() })
  openFile(id)
  closeMenu()
  nameInput.focus()
  nameInput.select()
}

newBtn.addEventListener('click', createFile)

function deleteFile(id) {
  const file = index.files.find((f) => f.id === id)
  if (!file || index.files.length <= 1) return
  if (!window.confirm(`Delete “${file.name}”? This can't be undone.`)) return
  index.files = index.files.filter((f) => f.id !== id)
  localStorage.removeItem(fileKey(id))
  if (index.current === id) {
    const next = [...index.files].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    openFile(next.id)
  } else {
    saveIndex()
  }
  renderMenu()
}

// Rename: commit on Enter/blur, never allow an empty name.
nameInput.addEventListener('input', sizeNameInput)
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') nameInput.blur()
  if (e.key === 'Escape') {
    nameInput.value = currentFile().name
    nameInput.blur()
  }
  e.stopPropagation() // keep board shortcuts out of the input
})
nameInput.addEventListener('blur', () => {
  const name = nameInput.value.trim()
  const file = currentFile()
  if (name) {
    file.name = name
  }
  nameInput.value = file.name
  sizeNameInput()
  file.updatedAt = Date.now()
  saveIndex()
})

// Open the current file on load (no fit if the board is brand new).
openFile(currentFile().id)
sizeNameInput()


/* ---- Canvas home / board manager ----------------------------------------- */
const homeStyle = document.createElement('style')
homeStyle.textContent = `
  .canvas-home { position:fixed; inset:0; z-index:100; overflow:auto; color:#20201e;
    background:radial-gradient(ellipse at 80% -10%,rgba(92,126,255,.10),transparent 42%),#f7f7f5;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  :root.dark .canvas-home { color:#f4f4f1; background:radial-gradient(ellipse at 80% -10%,rgba(92,126,255,.12),transparent 42%),#171816; }
  .ch-wrap { max-width:1160px; margin:0 auto; padding:48px 32px 64px; }
  .ch-top { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:58px; }
  .ch-brand { display:flex; align-items:center; gap:11px; font-size:18px; font-weight:750; letter-spacing:-.5px; }
  .ch-mark { width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:#252b3a;color:white;font-size:19px; }
  .ch-top-note { color:#888; font-size:13px; }
  .ch-heading { font-size:clamp(30px,5vw,44px); letter-spacing:-1.8px; line-height:1.05; margin:0 0 10px; font-weight:750; }
  .ch-sub { color:#85857f; font-size:15px; margin:0 0 32px; }
  .ch-tools { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:24px; }
  .ch-search { flex:1; min-width:220px; max-width:440px; border:1px solid #e3e3df; background:white; color:#252522;
    border-radius:12px;padding:12px 14px;font:inherit;font-size:14px;outline:none; }
  .ch-sort { border:1px solid #e3e3df;background:white;color:#333;border-radius:12px;padding:12px;font:inherit;font-size:14px; }
  .ch-create { border:0;background:#252b3a;color:white;border-radius:12px;padding:12px 17px;font:650 14px inherit;cursor:pointer; }
  .ch-create:hover { background:#39445e; }
  .ch-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:17px; }
  .ch-card { min-height:174px;position:relative;border:1px solid #e5e5e1;border-radius:16px;background:white;padding:16px;
    cursor:pointer;transition:transform .16s,border-color .16s,box-shadow .16s;display:flex;flex-direction:column; }
  .ch-card:hover { transform:translateY(-3px);border-color:#c8cbd5;box-shadow:0 12px 30px #20202012; }
  .ch-preview { height:90px;border-radius:10px;margin-bottom:14px;display:grid;place-items:center;overflow:hidden;
    background-color:#f3f3f0;background-image:linear-gradient(90deg,#e7e7e2 1px,transparent 1px),linear-gradient(#e7e7e2 1px,transparent 1px);background-size:18px 18px; }
  .ch-preview svg { width:70px;height:50px;opacity:.5; }
  .ch-card-title { font-size:14px;font-weight:680;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:28px; }
  .ch-date { color:#92928c;font-size:12px;margin-top:5px; }
  .ch-more { position:absolute;right:12px;bottom:13px;border:0;background:transparent;color:#777;font-size:21px;cursor:pointer;border-radius:8px;width:30px;height:30px; }
  .ch-more:hover { background:#f0f0ed;color:#222; }
  .ch-empty { grid-column:1/-1;padding:55px 20px;text-align:center;border:1px dashed #d8d8d2;border-radius:16px;color:#888; }
  .ch-empty strong { display:block;color:inherit;margin-bottom:7px;font-size:16px; }
  :root.dark .ch-card,:root.dark .ch-search,:root.dark .ch-sort { background:#222420;color:#f4f4f1;border-color:#383a34; }
  :root.dark .ch-preview { background-color:#292b26;background-image:linear-gradient(90deg,#373a33 1px,transparent 1px),linear-gradient(#373a33 1px,transparent 1px); }
  :root.dark .ch-card { border-color:#383a34; }
  :root.dark .ch-card:hover { border-color:#666b7a;box-shadow:0 12px 30px #0005; }
  :root.dark .ch-more:hover { background:#373a33;color:white; }
  :root.dark .ch-empty { border-color:#44473f; }
  @media(max-width:600px) { .ch-wrap{padding:28px 18px 44px}.ch-top{margin-bottom:42px}.ch-top-note{display:none}.ch-tools{align-items:stretch}.ch-create{width:100%} }
`
document.head.append(homeStyle)

const home = document.createElement('main')
home.className = 'canvas-home'
home.innerHTML = `
  <div class="ch-wrap">
    <header class="ch-top">
      <div class="ch-brand"><span class="ch-mark">✳</span><span>Canvas</span></div>
      <div class="ch-top-note">Your ideas, all in one place</div>
    </header>
    <h1 class="ch-heading">Your canvases</h1>
    <p class="ch-sub">Pick up where you left off, or start with a blank canvas.</p>
    <div class="ch-tools">
      <input class="ch-search" id="ch-search" type="search" placeholder="Search canvases…" aria-label="Search canvases">
      <select class="ch-sort" id="ch-sort" aria-label="Sort canvases">
        <option value="recent">Recently edited</option><option value="name">Name (A–Z)</option><option value="oldest">Oldest first</option>
      </select>
      <button class="ch-create" id="ch-create" type="button">＋ New canvas</button>
    </div>
    <section class="ch-grid" id="ch-grid" aria-label="Your canvases"></section>
  </div>`
document.body.append(home)

const homeBtn = document.createElement('button')
homeBtn.className = 'qd-file-btn'
homeBtn.type = 'button'
homeBtn.title = 'All canvases'
homeBtn.setAttribute('aria-label','All canvases')
homeBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.2 10 3l7 6.2v7.1a.7.7 0 0 1-.7.7h-4.1v-5H7.8v5H3.7a.7.7 0 0 1-.7-.7z"/></svg>'
filebar.prepend(homeBtn)

const grid = home.querySelector('#ch-grid')
const searchBox = home.querySelector('#ch-search')
const sortBox = home.querySelector('#ch-sort')
const dateLabel = (timestamp) => {
  if (!timestamp) return 'Not edited yet'
  const date = new Date(timestamp)
  return 'Edited ' + date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined})
}

function renderHome() {
  const query = searchBox.value.trim().toLowerCase()
  let files = index.files.filter((file) => file.name.toLowerCase().includes(query))
  if (sortBox.value === 'name') files.sort((a,b) => a.name.localeCompare(b.name))
  else if (sortBox.value === 'oldest') files.sort((a,b) => a.updatedAt - b.updatedAt)
  else files.sort((a,b) => b.updatedAt - a.updatedAt)
  grid.textContent = ''
  if (!files.length) {
    const empty = document.createElement('div')
    empty.className = 'ch-empty'
    empty.innerHTML = '<strong>No canvases found</strong>Try another search, or create a new canvas.'
    grid.append(empty)
    return
  }
  for (const file of files) {
    const card = document.createElement('article')
    card.className = 'ch-card'
    card.tabIndex = 0
    card.setAttribute('role','button')
    card.setAttribute('aria-label', 'Open ' + file.name)
    const preview = document.createElement('div')
    preview.className = 'ch-preview'
    preview.innerHTML = '<svg viewBox="0 0 90 60" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 42c12-31 19 8 31-13s16 19 27-3 12 4 15-7"/><path d="M12 51h66" opacity=".35"/></svg>'
    const title = document.createElement('div')
    title.className = 'ch-card-title'
    title.textContent = file.name
    const date = document.createElement('div')
    date.className = 'ch-date'
    date.textContent = dateLabel(file.updatedAt)
    const more = document.createElement('button')
    more.className = 'ch-more'
    more.type = 'button'
    more.textContent = '···'
    more.title = 'Canvas actions'
    more.setAttribute('aria-label','Canvas actions for ' + file.name)
    more.addEventListener('click',(event) => {
      event.stopPropagation()
      const action = window.prompt('Enter action: rename, duplicate, or delete','rename')
      if (!action) return
      if (action.toLowerCase() === 'rename') {
        const next = window.prompt('Canvas name',file.name)
        if (next?.trim()) { file.name = next.trim(); file.updatedAt = Date.now(); saveIndex(); renderHome() }
      } else if (action.toLowerCase() === 'duplicate') {
        saveNow()
        const id = newId()
        const copyName = file.name + ' copy'
        const snapshot = localStorage.getItem(fileKey(file.id))
        index.files.push({id,name:copyName,updatedAt:Date.now()})
        if (snapshot) localStorage.setItem(fileKey(id),snapshot)
        saveIndex()
        renderHome()
      } else if (action.toLowerCase() === 'delete') {
        deleteFile(file.id)
        renderHome()
      }
    })
    card.append(preview,title,date,more)
    const open = () => { saveNow(); openFile(file.id); home.hidden = true }
    card.addEventListener('click',open)
    card.addEventListener('keydown',(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() } })
    grid.append(card)
  }
}
searchBox.addEventListener('input',renderHome)
sortBox.addEventListener('change',renderHome)
home.querySelector('#ch-create').addEventListener('click',() => { createFile(); home.hidden = true })
homeBtn.addEventListener('click',() => { saveNow(); renderHome(); home.hidden = false; closeMenu() })
renderHome()
home.hidden = false

// Remember the theme across visits; the chrome follows the board through the
// root .dark class (the CSS variables up in index.html key off it).
const syncTheme = () => {
  const dark = editor.theme.id === 'dark'
  localStorage.setItem(THEME_KEY, editor.theme.id)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#1e1e1c' : '#faf8f4')
}
syncTheme()
editor.on('theme', syncTheme)

// Flush the debounced save before leaving.
window.addEventListener('beforeunload', saveNow)

window.board = board // devtools access, same as the examples
