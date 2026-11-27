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
  grid: 'dots',
  watermark: false,
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

function closeMenu() {
  if (menu) menu.hidden = true
}

filesBtn.addEventListener('click', () => {
  saveNow()
  renderHome()
  home.hidden = false
})

newBtn.addEventListener('click', () => {
  saveNow()
  newBtn.classList.add('is-saved')
  newBtn.title = 'Saved'
  newBtn.setAttribute('aria-label', 'Canvas saved')
  setTimeout(() => {
    newBtn.classList.remove('is-saved')
    newBtn.title = 'Save canvas'
    newBtn.setAttribute('aria-label', 'Save canvas')
  }, 1200)
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
  .ch-card-menu { position:absolute;right:12px;bottom:48px;z-index:5;min-width:142px;padding:5px;background:#fff;border:1px solid #deded8;border-radius:10px;box-shadow:0 10px 28px #0002;display:grid;gap:2px; }
  .ch-card-menu button { border:0;background:transparent;text-align:left;padding:9px 10px;border-radius:7px;font:500 13px inherit;color:#252522;cursor:pointer; }
  .ch-card-menu button:hover { background:#f0f0ed; }
  .ch-card-menu button.danger { color:#c0392b; }
  .ch-rename-input { font:650 14px inherit;min-width:0;width:100%;border:1px solid #777;border-radius:6px;padding:4px;background:transparent;color:inherit; }
  .ch-empty { grid-column:1/-1;padding:55px 20px;text-align:center;border:1px dashed #d8d8d2;border-radius:16px;color:#888; }
  .ch-empty strong { display:block;color:inherit;margin-bottom:7px;font-size:16px; }
  :root.dark .ch-card,:root.dark .ch-search,:root.dark .ch-sort { background:#222420;color:#f4f4f1;border-color:#383a34; }
  :root.dark .ch-preview { background-color:#292b26;background-image:linear-gradient(90deg,#373a33 1px,transparent 1px),linear-gradient(#373a33 1px,transparent 1px); }
  :root.dark .ch-card { border-color:#383a34; }
  :root.dark .ch-card:hover { border-color:#666b7a;box-shadow:0 12px 30px #0005; }
  :root.dark .ch-more:hover { background:#373a33;color:white; }
  :root.dark .ch-card-menu { background:#292b26;border-color:#44473f;box-shadow:0 10px 28px #0008; }
  :root.dark .ch-card-menu button { color:#f4f4f1; }
  :root.dark .ch-card-menu button:hover { background:#3a3d36; }
  :root.dark .ch-card-menu button.danger { color:#ff8d80; }
  :root.dark .ch-rename-input { color:#f4f4f1;border-color:#777; }
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
      grid.querySelectorAll('.ch-card-menu').forEach((node) => node.remove())
      const actions = document.createElement('div')
      actions.className = 'ch-card-menu'
      const addAction = (label, fn, danger = false) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = label
        if (danger) button.classList.add('danger')
        button.addEventListener('click', (e) => { e.stopPropagation(); actions.remove(); fn() })
        actions.append(button)
      }
      addAction('Rename', () => {
        const input = document.createElement('input')
        input.className = 'ch-rename-input'
        input.value = file.name
        input.setAttribute('aria-label', 'Canvas name')
        title.replaceWith(input)
        input.focus(); input.select()
        const commit = () => {
          const value = input.value.trim()
          if (value) { file.name = value; file.updatedAt = Date.now(); saveIndex() }
          renderHome()
        }
        input.addEventListener('keydown', (e) => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') renderHome()
        })
        input.addEventListener('blur', commit, { once: true })
      })
      addAction('Duplicate', () => {
        const snapshot = localStorage.getItem(fileKey(file.id))
        const id = newId()
        index.files.push({ id, name: file.name + ' copy', updatedAt: Date.now() })
        if (snapshot) localStorage.setItem(fileKey(id), snapshot)
        saveIndex(); renderHome()
      })
      addAction('Delete', () => {
        if (index.files.length <= 1) return
        const confirmed = window.confirm('Delete “' + file.name + '”? This cannot be undone.')
        if (confirmed) {
          index.files = index.files.filter((item) => item.id !== file.id)
          localStorage.removeItem(fileKey(file.id))
          if (index.current === file.id) {
            const nextFile = [...index.files].sort((a, b) => b.updatedAt - a.updatedAt)[0]
            if (nextFile) openFile(nextFile.id)
          }
          saveIndex()
          renderHome()
        }
      }, true)
      card.append(actions)
      actions.addEventListener('click', (e) => e.stopPropagation())
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
