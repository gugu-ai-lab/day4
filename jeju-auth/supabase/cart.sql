-- 제주 IP 클럽: 상품 + 장바구니 테이블
-- Supabase 대시보드 > SQL Editor > New query 에 전체를 붙여넣고 Run
-- 여러 번 실행해도 안전하게 작성되어 있습니다.

-- 1) 상품 테이블 (누구나 조회 가능)
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  description text,
  price       integer not null check (price >= 0),   -- 원 단위
  image       text,                                   -- 예: /images/mikan.jpg
  created_at  timestamptz not null default now()
);

-- 2) 장바구니 테이블 (로그인한 본인 것만 접근)
create table if not exists public.cart_items (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id  bigint not null references public.products(id) on delete cascade,
  quantity    integer not null default 1 check (quantity between 1 and 99),
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists cart_items_user_idx on public.cart_items (user_id);

-- 3) RLS (행 단위 보안) 켜기
alter table public.products   enable row level security;
alter table public.cart_items enable row level security;

-- 상품: 로그인 여부와 관계없이 읽기만 허용
drop policy if exists "products are public" on public.products;
create policy "products are public"
  on public.products for select
  using (true);

-- 장바구니: 내 행만 조회/추가/수정/삭제
drop policy if exists "cart select own" on public.cart_items;
create policy "cart select own"
  on public.cart_items for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "cart insert own" on public.cart_items;
create policy "cart insert own"
  on public.cart_items for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "cart update own" on public.cart_items;
create policy "cart update own"
  on public.cart_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "cart delete own" on public.cart_items;
create policy "cart delete own"
  on public.cart_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- 4) 샘플 상품 (이름이 같으면 건너뜀)
insert into public.products (name, description, price, image) values
  ('제주 감귤 3kg',        '새콤달콤 제주 노지 감귤',          15000, '/images/mikan.jpg'),
  ('돌하르방 미니 피규어', '책상을 지켜주는 작은 수호신',      12000, '/images/hareubang.jpg'),
  ('한라산 머그컵',        '백록담이 그려진 도자기 머그',        9800, '/images/hallasan.jpg'),
  ('성산일출봉 엽서 세트', '일출 풍경 엽서 5장',                 5000, '/images/sunrise.jpg'),
  ('유채꽃 에코백',        '노란 유채꽃 프린트 캔버스 가방',    14000, '/images/canola.jpg'),
  ('감귤 초콜릿',          '제주 감귤 향 가득한 초콜릿',         8500, '/images/mikan.jpg')
on conflict (name) do nothing;
