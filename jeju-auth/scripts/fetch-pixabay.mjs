// Pixabay API로 제주 관련 이미지를 받아 public/images 에 저장한다.
// 사용: PIXABAY_API_KEY=... npm run fetch-images  (또는 .env 에 PIXABAY_API_KEY 작성)
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const file = join(root, '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const key = (process.env.PIXABAY_API_KEY || '').trim().replace(/^["']|["']$/g, '')
if (!key) {
  console.error('PIXABAY_API_KEY 가 없습니다. .env 에 추가하거나 환경변수로 전달하세요.')
  process.exit(1)
}
// 보통 Pixabay 키는 "숫자-영문숫자" 형태 (약 33자). 값 자체는 출력하지 않는다.
console.log(`PIXABAY_API_KEY 길이: ${key.length}자 (형식 ${/^\d+-[0-9a-f]+$/i.test(key) ? '정상' : '이상함'})`)

// 파일명 -> 검색어 (결과가 없으면 fallback 검색어 사용)
const targets = [
  { file: 'hero', q: 'jeju island', alt: 'korea island coast' },
  { file: 'hareubang', q: 'dol hareubang', alt: 'jeju stone statue' },
  { file: 'mikan', q: 'tangerine orchard', alt: 'mandarin orange' },
  { file: 'hallasan', q: 'hallasan', alt: 'jeju mountain' },
  { file: 'sunrise', q: 'seongsan ilchulbong', alt: 'jeju sunrise' },
  { file: 'canola', q: 'jeju canola flowers', alt: 'rapeseed field spring' },
  { file: 'hyeopjae', q: 'hyeopjae beach', alt: 'jeju beach' },
  { file: 'udo', q: 'udo island jeju', alt: 'jeju island sea' },
  { file: 'seopjikoji', q: 'seopjikoji', alt: 'jeju lighthouse coast' },
  { file: 'cherry', q: 'jeju cherry blossom', alt: 'korea cherry blossom' },
  { file: 'stonewall', q: 'jeju stone wall', alt: 'basalt stone wall' },
  { file: 'cheonjiyeon', q: 'cheonjiyeon waterfall', alt: 'jeju waterfall' },
  { file: 'yongmeori', q: 'yongmeori coast', alt: 'jeju coast cliff' },
  { file: 'olle', q: 'jeju olle trail', alt: 'jeju coastal path' },
  { file: 'horse', q: 'jeju horse', alt: 'horse pasture island' },
  { file: 'snow', q: 'hallasan snow', alt: 'jeju winter snow' },
  { file: 'sunset', q: 'jeju sunset', alt: 'korea sunset sea' },
]

const outDir = join(root, 'public', 'images')
mkdirSync(outDir, { recursive: true })
const credits = {}

async function search(q) {
  const url = new URL('https://pixabay.com/api/')
  url.search = new URLSearchParams({
    key, q, image_type: 'photo', orientation: 'horizontal',
    safesearch: 'true', order: 'popular', per_page: '5',
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pixabay API ${res.status}: ${await res.text()}`)
  return (await res.json()).hits
}

for (const t of targets) {
  let hits = await search(t.q)
  if (!hits.length) hits = await search(t.alt)
  const hit = hits[0]
  if (!hit) { console.warn(`✗ ${t.file}: 결과 없음`); continue }
  const img = await fetch(hit.largeImageURL)
  if (!img.ok) { console.warn(`✗ ${t.file}: 다운로드 실패`); continue }
  writeFileSync(join(outDir, `${t.file}.jpg`), Buffer.from(await img.arrayBuffer()))
  credits[t.file] = { user: hit.user, page: hit.pageURL }
  console.log(`✓ ${t.file}.jpg  (${t.q} · by ${hit.user})`)
}

writeFileSync(join(outDir, 'credits.json'), JSON.stringify(credits, null, 2))
console.log('완료: public/images/')
