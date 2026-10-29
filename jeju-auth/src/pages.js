import { supabase, configured } from './supabase.js'
import { esc } from './util.js'
import { shop, cart } from './shop.js'

export { esc }

const ERRORS = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않아요.',
  'Email not confirmed': '이메일 인증이 아직 완료되지 않았어요. 받은 메일함을 확인해주세요.',
  'User already registered': '이미 가입된 이메일이에요.',
  'Password should be at least 6 characters.': '비밀번호는 6자 이상이어야 해요.',
}
const korean = (err) => {
  if (err?.status === 429) return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.'
  return ERRORS[err?.message] || err?.message || '알 수 없는 오류가 발생했어요.'
}

const IP = [
  { id: 'hareubang', name: '돌하르방', tag: '제주의 수호신', text: '큼직한 코와 부리부리한 눈. 마을 어귀를 지키던 돌 할아버지는 제주를 대표하는 캐릭터예요.' },
  { id: 'mikan', name: '감귤', tag: '제주의 달콤함', text: '겨울이면 온 섬이 주황빛. 한 알 한 알 손으로 따는 제주 감귤이 가장 사랑받는 IP예요.' },
  { id: 'hallasan', name: '한라산', tag: '제주의 중심', text: '섬 한가운데 우뚝 솟은 백록담의 산. 제주의 모든 이야기가 이곳에서 시작돼요.' },
  { id: 'sunrise', name: '성산일출봉', tag: '제주의 아침', text: '바다 위로 솟은 분화구, 수면 위로 떠오르는 해돋이는 제주의 상징이에요.' },
  { id: 'canola', name: '유채꽃', tag: '제주의 봄', text: '노란 물결이 돌담을 따라 번지는 봄. 제주 사진의 단골 배경이에요.' },
]

const card = (c) => `
  <article class="card">
    <div class="pic" style="--img:url(/images/${c.id}.jpg)"></div>
    <div class="body"><span class="tag">${c.tag}</span><h3>${c.name}</h3><p>${c.text}</p></div>
  </article>`

const msg = (root) => root.querySelector('.msg')
function show(root, text, kind = 'err') {
  const el = msg(root)
  el.textContent = text
  el.className = `msg ${kind}`
}

function guardConfigured(root) {
  if (configured) return true
  show(root, 'Supabase 환경변수가 설정되지 않았어요.')
  return false
}

const home = {
  view: ({ session }) => `
    <section class="hero">
      <div class="hero-in">
        <p class="eyebrow">JEJU · 돌 · 바람 · 감귤</p>
        <h1>제주의 이야기를<br />가장 귀엽게 만나다</h1>
        <p class="lead">돌하르방부터 감귤까지, 제주를 대표하는 캐릭터와 풍경을 모아둔 팬 클럽이에요.</p>
        <div class="cta">${
          session
            ? '<a class="btn big" href="/shop" data-link>굿즈 상점 가기</a><a class="btn big ghost" href="/my" data-link>내 정보 보기</a>'
            : '<a class="btn big" href="/signup" data-link>클럽 가입하기</a><a class="btn big ghost" href="/login" data-link>로그인</a>'
        }</div>
      </div>
    </section>
    <section class="wrap">
      <h2>제주 IP 모아보기</h2>
      <div class="grid">${IP.map(card).join('')}</div>
    </section>`,
}

const signup = {
  guard: 'guest',
  view: () => `
    <section class="auth">
      <h1>회원가입</h1>
      <form id="f">
        <label>닉네임<input name="nickname" required maxlength="20" placeholder="귤이" autocomplete="nickname" /></label>
        <label>이메일<input name="email" type="email" required placeholder="you@example.com" autocomplete="email" /></label>
        <label>비밀번호<input name="password" type="password" required minlength="6" placeholder="6자 이상" autocomplete="new-password" /></label>
        <label>비밀번호 확인<input name="confirm" type="password" required minlength="6" autocomplete="new-password" /></label>
        <button class="btn big" type="submit">가입하기</button>
        <p class="msg" role="status"></p>
      </form>
      <p class="alt">이미 회원이신가요? <a href="/login" data-link>로그인</a></p>
    </section>`,
  mount(root, { navigate }) {
    const form = root.querySelector('#f')
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!guardConfigured(root)) return
      const f = Object.fromEntries(new FormData(form))
      if (f.password !== f.confirm) return show(root, '비밀번호가 서로 달라요.')
      const btn = form.querySelector('button')
      btn.disabled = true
      const { data, error } = await supabase.auth.signUp({
        email: f.email.trim(),
        password: f.password,
        options: { data: { nickname: f.nickname.trim() }, emailRedirectTo: location.origin },
      })
      btn.disabled = false
      if (error) return show(root, korean(error))
      // 이메일 인증이 켜져 있을 때 이미 가입된 이메일은 identities 가 빈 배열로 온다
      if (data.user && data.user.identities?.length === 0) return show(root, korean({ message: 'User already registered' }))
      if (data.session) return navigate('/my')
      form.reset()
      show(root, '인증 메일을 보냈어요! 메일의 링크를 누르면 가입이 완료돼요.', 'ok')
    })
  },
}

const login = {
  guard: 'guest',
  view: () => `
    <section class="auth">
      <h1>로그인</h1>
      <form id="f">
        <label>이메일<input name="email" type="email" required placeholder="you@example.com" autocomplete="email" /></label>
        <label>비밀번호<input name="password" type="password" required autocomplete="current-password" /></label>
        <button class="btn big" type="submit">로그인</button>
        <p class="msg" role="status"></p>
      </form>
      <p class="alt">아직 회원이 아니신가요? <a href="/signup" data-link>회원가입</a></p>
    </section>`,
  mount(root, { navigate }) {
    const form = root.querySelector('#f')
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!guardConfigured(root)) return
      const f = Object.fromEntries(new FormData(form))
      const btn = form.querySelector('button')
      btn.disabled = true
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
      btn.disabled = false
      if (error) return show(root, korean(error))
      navigate('/my')
    })
  },
}

const my = {
  guard: 'auth',
  view: ({ session }) => {
    const u = session.user
    const fmt = (d) => (d ? new Date(d).toLocaleString('ko-KR') : '-')
    return `
    <section class="auth">
      <h1>내 정보</h1>
      <dl class="info">
        <dt>이메일</dt><dd>${esc(u.email)}</dd>
        <dt>가입일</dt><dd>${fmt(u.created_at)}</dd>
        <dt>마지막 로그인</dt><dd>${fmt(u.last_sign_in_at)}</dd>
      </dl>
      <form id="f">
        <label>닉네임<input name="nickname" required maxlength="20" value="${esc(u.user_metadata?.nickname || '')}" /></label>
        <button class="btn big" type="submit">닉네임 변경</button>
        <p class="msg" role="status"></p>
      </form>
      <div class="members">
        <h2>🍊 멤버 전용 소식</h2>
        <p>로그인한 회원에게만 보이는 영역이에요. 곧 제주 IP 굿즈와 이벤트 소식이 올라와요!</p>
      </div>
    </section>`
  },
  mount(root, { state }) {
    const form = root.querySelector('#f')
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const nickname = new FormData(form).get('nickname').trim()
      const btn = form.querySelector('button')
      btn.disabled = true
      const { data, error } = await supabase.auth.updateUser({ data: { nickname } })
      btn.disabled = false
      if (error) return show(root, korean(error))
      state.session = { ...state.session, user: data.user }
      show(root, '닉네임을 바꿨어요.', 'ok')
      root.querySelector('.top nav a').textContent = `🍊 ${nickname}`
    })
  },
}

export const pages = { '/': home, '/signup': signup, '/login': login, '/my': my, '/shop': shop, '/cart': cart }
