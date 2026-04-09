import { put } from '@vercel/blob';

export default async function handler(req, res) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageUrl, fileName } = req.body;
  if (!imageUrl || !fileName) return res.status(400).json({ error: 'imageUrl and fileName are required' });

  try {
    // 1. 외부 이미지 가져오기 (Pollinations 등)
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
    
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Vercel Blob에 업로드 (중복 방지를 위해 addRandomSuffix: false 권장)
    const blob = await put(`portraits/${fileName}`, buffer, {
      access: 'public',
      contentType: imgRes.headers.get('content-type') || 'image/png',
      addRandomSuffix: false
    });

    return res.status(200).json({ success: true, url: blob.url });
  } catch (e) {
    console.error('Save image error:', e);
    return res.status(500).json({ error: e.message });
  }
}
