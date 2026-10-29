import './style.css'
import { supabase, configured } from './supabase.js'
import { pages, esc } from './pages.js'

const app = document.getElementById('app')
const state = { session: null }

const normalize = (p) => p.replace(/\/+$/, '') || '/'

export function navigate(path) {
  history.pushState({}, '', path)
  render()
}

function layout(body) {
  const user = state.session?.user
  const nick = user?.user_metadata?.nickname || user?.email?.split('@')[0]
  const nav = user
    ? `<a href="/my" data-link>🍊 ${esc(nick)}</a><button id="logout" class="btn ghost">로그아웃</button>`
    : `<a href="/login" data-link>로그인</a><a href="/signup" data-link class="btn">회원가입</a>`
  return `
    <header class="top">
      <a href="/" data-link class="logo">🍊 제주 IP 클럽</a>
      <nav>${nav}</nav>
    </header>
    ${configured ? '' : '<div class="warn">⚠ Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)가 설정되지 않았어요. README를 확인하세요.</div>'}
    <main>${body}</main>
    <footer>이미지 출처 <a href="https://pixabay.com" target="_blank" rel="noopener">Pixabay</a> · 제주 IP 클럽</footer>`
}

function render() {
  const path = normalize(location.pathname)
  const page = pages[path] || pages['/']
  const loggedIn = Boolean(state.session)

  if (page.guard === 'auth' && !loggedIn) return navigate('/login')
  if (page.guard === 'guest' && loggedIn) return navigate('/my')

  app.innerHTML = layout(page.view(state))
  window.scrollTo(0, 0)
  document.getElementById('logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut()
  })
  page.mount?.(app, { state, navigate })
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]')
  if (!a || e.metaKey || e.ctrlKey) return
  e.preventDefault()
  navigate(a.getAttribute('href'))
})
window.addEventListener('popstate', render)

async function start() {
  if (configured) {
    const { data } = await supabase.auth.getSession()
    state.session = data.session
    let lastUserId = data.session?.user?.id ?? null
    supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session
      const id = session?.user?.id ?? null
      // 토큰 갱신 등으로 입력 중인 폼이 지워지지 않도록 사용자가 바뀔 때만 다시 그린다
      if (id !== lastUserId) {
        lastUserId = id
        render()
      }
    })
  }
  render()
}
start()
