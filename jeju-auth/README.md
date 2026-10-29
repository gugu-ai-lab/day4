# 제주 IP 클럽 (Vite + Supabase Auth)

돌하르방·감귤·한라산 등 제주 IP를 소개하는 사이트. Supabase 이메일 회원가입/로그인, 로그아웃, 내 정보(닉네임 변경)를 제공합니다.

## 1. Supabase 값 확인
1. Supabase 대시보드 → 프로젝트 선택 → **Project Settings → API** (또는 상단 **Connect** 버튼)
2. `Project URL` → `VITE_SUPABASE_URL`
3. `anon public` 키(또는 새 `publishable` 키) → `VITE_SUPABASE_ANON_KEY`
   - `service_role` / `secret` 키는 **절대** 사용하지 마세요.

## 2. 로컬 실행
```bash
cd jeju-auth
cp .env.example .env     # 값 채우기
npm install
npm run dev
```

## 3. 이미지 (Pixabay)
1. https://pixabay.com/api/docs/ 에서 로그인 후 API Key 확인
2. `.env` 의 `PIXABAY_API_KEY` 에 입력
3. `npm run fetch-images` → `public/images/*.jpg` 저장 후 커밋 (이미지가 없으면 그라데이션으로 대체 표시)

## 4. Supabase 인증 설정
- **Authentication → Sign In / Providers → Email** 활성화
  - 테스트 중에는 *Confirm email* 을 끄면 가입 즉시 로그인됩니다. 켜두면 인증 메일 링크를 눌러야 합니다.
- **Authentication → URL Configuration**
  - Site URL: 배포 주소 (예: `https://xxx.vercel.app`)
  - Redirect URLs: `http://localhost:5173/**`, `https://xxx.vercel.app/**`

## 5. Vercel 배포
1. GitHub 저장소를 Vercel에서 Import
2. **Root Directory = `jeju-auth`**, Framework Preset = Vite (Build `npm run build`, Output `dist`)
3. **Settings → Environment Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가 (Production/Preview/Development 모두)
4. Deploy (환경변수를 바꾸면 Redeploy 필요)
5. 배포 URL을 Supabase의 Site URL / Redirect URLs 에 등록
