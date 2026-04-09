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
    // Vercel Blob 토큰 확인
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('Missing BLOB_READ_WRITE_TOKEN');
      return res.status(500).json({ error: 'Vercel Blob 토큰이 설정되지 않았습니다. 대시보드를 확인하세요.' });
    }

    let buffer;
    let contentType = mimeType || 'image/jpeg'; // 기본값: JPEG (경량)

    if (imageBinary) {
      // base64 데이터 유효성 검사 추가
      if (typeof imageBinary !== 'string' || imageBinary.length < 100) {
        throw new Error('전달된 이미지 데이터가 비정상적이거나 너무 짧습니다.');
      }
      buffer = Buffer.from(imageBinary, 'base64');
    } else {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`이미지 원본 주소 접근 실패: ${imgRes.status}`);
      const arrayBuffer = await imgRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      contentType = imgRes.headers.get('content-type') || 'image/png';
    }

    // Vercel Blob에 업로드
    const blob = await put(`portraits/${fileName}`, buffer, {
      access: 'public',
      contentType: contentType,
      addRandomSuffix: false
    });

    return res.status(200).json({ success: true, url: blob.url });
  } catch (e) {
    console.error('Save image critical error:', e);
    return res.status(500).json({ error: e.message, github_issue: 'check BLOB_READ_WRITE_TOKEN' });
  }
}
