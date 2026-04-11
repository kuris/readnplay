import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.rnp_SUPABASE_URL,
  process.env.rnp_SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
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
    if (!process.env.rnp_SUPABASE_URL || !process.env.rnp_SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Missing Supabase Credentials' });
    }

    let buffer;
    const contentType = mimeType || 'image/png';

    if (imageBinary) {
      if (typeof imageBinary !== 'string' || imageBinary.length < 100) {
        throw new Error('Invalid image data');
      }
      buffer = Buffer.from(imageBinary, 'base64');
    } else {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Fetch failed: ${imgRes.status}`);
      const arrayBuffer = await imgRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // Supabase Storage에 업로드 (기본 경로: portraits/)
    const filePath = `portraits/${fileName}`;
    const { data, error } = await supabase.storage
      .from('readplay-images')
      .upload(filePath, buffer, {
        contentType,
        upsert: true
      });

    if (error) throw error;

    // 공용 URL 가져오기
    const { data: { publicUrl } } = supabase.storage
      .from('readplay-images')
      .getPublicUrl(filePath);

    return res.status(200).json({ success: true, url: publicUrl });
    
  } catch (e) {
    console.error('Supabase Save Image Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
