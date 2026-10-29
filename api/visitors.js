// 서귀포시 직영관광지 관람객수 (data.go.kr / odcloud) 프록시. 인증키를 브라우저에 노출하지 않기 위해 서버에서만 호출한다.
const BASE = 'https://api.odcloud.kr/api/15125100/v1/uddi:32a1b877-af20-4505-a76a-fd389ebd30ca';

export default async function handler(req, res) {
  const key = (process.env.DATA_GO_KR_KEY || '').trim();
  if (!key) return res.status(500).json({ error: 'DATA_GO_KR_KEY 가 설정되지 않았습니다.' });
  const params = new URLSearchParams({
    page: '1',
    perPage: String(Math.min(Number(req.query.perPage) || 1000, 5000)),
    returnType: 'JSON',
    serviceKey: decodeURIComponent(key), // Encoding/Decoding 어느 키든 동작
  });
  try {
    const r = await fetch(`${BASE}?${params}`);
    const body = await r.text();
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
