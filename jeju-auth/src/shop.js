import { esc, won } from './util.js'
import { listProducts, listCart, addToCart, setQuantity, removeItem } from './cart.js'

const LOAD_ERROR = '불러오지 못했어요. Supabase에서 supabase/cart.sql 을 실행했는지 확인해주세요.'

export const shop = {
  view: () => `
    <section class="wrap">
      <h2>제주 굿즈 상점</h2>
      <p class="sub">마음에 드는 상품을 장바구니에 담아보세요.</p>
      <p class="msg" role="status"></p>
      <div class="grid" id="products"><p>불러오는 중…</p></div>
    </section>`,
  async mount(root, { state, navigate }) {
    const box = root.querySelector('#products')
    const msg = root.querySelector('.msg')
    let products
    try {
      products = await listProducts()
    } catch {
      box.innerHTML = ''
      msg.className = 'msg err'
      msg.textContent = LOAD_ERROR
      return
    }
    box.innerHTML = products
      .map(
        (p) => `
      <article class="card">
        <div class="pic" ${p.image ? `style="--img:url(${esc(p.image)})"` : ''}></div>
        <div class="body">
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description || '')}</p>
          <div class="buy"><strong class="price">${won(p.price)}</strong>
            <button class="btn" data-add="${p.id}">담기</button></div>
        </div>
      </article>`,
      )
      .join('')

    box.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-add]')
      if (!btn) return
      if (!state.session) return navigate('/login')
      btn.disabled = true
      try {
        await addToCart(state.session.user.id, Number(btn.dataset.add))
        btn.textContent = '담았어요 ✓'
        setTimeout(() => { btn.textContent = '담기'; btn.disabled = false }, 900)
      } catch {
        btn.disabled = false
        msg.className = 'msg err'
        msg.textContent = '장바구니에 담지 못했어요. 잠시 후 다시 시도해주세요.'
      }
    })
  },
}

export const cart = {
  guard: 'auth',
  view: () => `
    <section class="wrap narrow">
      <h2>🛒 장바구니</h2>
      <p class="msg" role="status"></p>
      <div id="cart"><p>불러오는 중…</p></div>
    </section>`,
  async mount(root) {
    const box = root.querySelector('#cart')
    const msg = root.querySelector('.msg')

    async function load() {
      let items
      try {
        items = await listCart()
      } catch {
        box.innerHTML = ''
        msg.className = 'msg err'
        msg.textContent = LOAD_ERROR
        return
      }
      if (!items.length) {
        box.innerHTML = '<p class="empty">장바구니가 비어 있어요.</p><a class="btn big" href="/shop" data-link>상점 구경하기</a>'
        return
      }
      const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0)
      box.innerHTML = `
        <ul class="cart-list">${items
          .map(
            (i) => `
          <li data-id="${i.id}">
            <div class="thumb" ${i.product.image ? `style="--img:url(${esc(i.product.image)})"` : ''}></div>
            <div class="grow"><strong>${esc(i.product.name)}</strong><br /><span>${won(i.product.price)}</span></div>
            <div class="qty">
              <button data-dec aria-label="수량 감소">−</button>
              <span>${i.quantity}</span>
              <button data-inc aria-label="수량 증가">+</button>
            </div>
            <strong class="line">${won(i.product.price * i.quantity)}</strong>
            <button class="rm" data-rm aria-label="삭제">✕</button>
          </li>`,
          )
          .join('')}</ul>
        <div class="total"><span>합계</span><strong>${won(total)}</strong></div>
        <p class="note">결제 기능은 준비 중이에요.</p>`
      box._items = items
    }

    box.addEventListener('click', async (e) => {
      const li = e.target.closest('li[data-id]')
      if (!li) return
      const id = Number(li.dataset.id)
      const item = box._items.find((i) => i.id === id)
      try {
        if (e.target.closest('[data-rm]')) await removeItem(id)
        else if (e.target.closest('[data-inc]')) await setQuantity(id, Math.min(item.quantity + 1, 99))
        else if (e.target.closest('[data-dec]')) {
          if (item.quantity <= 1) await removeItem(id)
          else await setQuantity(id, item.quantity - 1)
        } else return
        await load()
      } catch {
        msg.className = 'msg err'
        msg.textContent = '변경하지 못했어요. 잠시 후 다시 시도해주세요.'
      }
    })

    await load()
  },
}
