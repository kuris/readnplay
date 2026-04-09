import { put } from '@vercel/blob';

export default async function handler(req, res) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageUrl, imageBinary, fileName, mimeType } = req.body;
  if ((!imageUrl && !imageBinary) || !fileName) {
    return res.status(400).json({ error: 'imageUrl or imageBinary and fileName are required' });
  }

  try {
    let buffer;
    let contentType = mimeType || 'image/jpeg'; // 기본값: JPEG (경량)

    if (imageBinary) {
      // 1-A. 직접 전달된 base64 이미지 데이터 처리
      buffer = Buffer.from(imageBinary, 'base64');
    } else {
      // 1-B. 외부 이미지 가져오기 (이전 방식 호환)
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
      const arrayBuffer = await imgRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      contentType = imgRes.headers.get('content-type') || 'image/png';
    }

    // 2. Vercel Blob에 업로드
    const blob = await put(`portraits/${fileName}`, buffer, {
      access: 'public',
      contentType: contentType,
      addRandomSuffix: false
    });

    return res.status(200).json({ success: true, url: blob.url });
  } catch (e) {
    console.error('Save image error:', e);
    return res.status(500).json({ error: e.message });
  }
}
