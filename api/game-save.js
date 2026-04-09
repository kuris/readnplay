import { put, list } from '@vercel/blob';

export default async function handler(req, res) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { cacheKey, gameData } = req.body;
    if (!cacheKey || !gameData) return res.status(400).json({ error: 'cacheKey and gameData are required' });
    
    try {
      // 지정된 캐시 키로 Vercel Blob에 JSON 데이터 업로드 (동일 키 발생 시 덮어쓰기)
      const blob = await put(`games/${cacheKey}.json`, JSON.stringify(gameData), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false
      });
      
      return res.status(200).json({ success: true, url: blob.url });
    } catch (e) {
      console.error('Blob upload error:', e);
      return res.status(500).json({ error: e.message });
    }
  }
  
  if (req.method === 'GET') {
    const { cacheKey } = req.query;
    if (!cacheKey) return res.status(400).json({ error: 'cacheKey is required' });
    
    try {
      // Blob 리스트 검색
      const { blobs } = await list({ prefix: `games/${cacheKey}.json`, limit: 1 });
      
      if (blobs && blobs.length > 0) {
        // Blob URL에서 내용 fetch
        const response = await fetch(blobs[0].url);
        if (response.ok) {
          const gameData = await response.json();
          return res.status(200).json({ cached: true, gameData });
        }
      }
      return res.status(200).json({ cached: false });
    } catch (e) {
      console.error('Blob GET error:', e);
      return res.status(200).json({ cached: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
