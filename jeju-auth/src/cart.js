import { supabase } from './supabase.js'

let count = 0
export const getCount = () => count

// 헤더의 장바구니 숫자를 갱신한다 (n 을 주면 저장값도 함께 바꿈)
export function updateBadge(n) {
  if (n != null) count = n
  const el = document.getElementById('cartCount')
  if (el) el.textContent = count
}

export async function listProducts() {
  const { data, error } = await supabase.from('products').select('*').order('id')
  if (error) throw error
  return data
}

export async function listCart() {
  const { data, error } = await supabase
    .from('cart_items')
    .select('id, quantity, product:products(id, name, price, image)')
    .order('created_at')
  if (error) throw error
  return data
}

export async function refreshCount() {
  const { data, error } = await supabase.from('cart_items').select('quantity')
  if (error) return
  updateBadge(data.reduce((sum, r) => sum + r.quantity, 0))
}

export async function addToCart(userId, productId) {
  const { data: existing } = await supabase
    .from('cart_items')
    .select('quantity')
    .eq('product_id', productId)
    .maybeSingle()
  const quantity = Math.min((existing?.quantity || 0) + 1, 99)
  const { error } = await supabase
    .from('cart_items')
    .upsert({ user_id: userId, product_id: productId, quantity }, { onConflict: 'user_id,product_id' })
  if (error) throw error
  await refreshCount()
}

export async function setQuantity(id, quantity) {
  const { error } = await supabase.from('cart_items').update({ quantity }).eq('id', id)
  if (error) throw error
  await refreshCount()
}

export async function removeItem(id) {
  const { error } = await supabase.from('cart_items').delete().eq('id', id)
  if (error) throw error
  await refreshCount()
}
