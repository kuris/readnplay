export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sdUrl, prompt, negative_prompt, width, height, steps, seed, batch_size } = req.body;

  if (!sdUrl) {
    return res.status(400).json({ error: 'SD API 주소가 필요합니다.' });
  }

  // 엔드포인트 구성 (슬래시 중복 방지)
  const endpoint = sdUrl.replace(/\/$/, '') + '/sdapi/v1/txt2img';

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        // ngrok 무료 버전의 경우 브라우저 경고 페이지가 뜨는 것을 방지
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "Mozilla/5.0 (Vercel Backend Proxy)" 
      },
      body: JSON.stringify({
        prompt,
        negative_prompt: negative_prompt || "blurry, low quality, bad anatomy, text, watermark, signature",
        width: width || 384,
        height: height || 384,
        steps: steps || 6,
        seed: seed || -1,
        batch_size: batch_size || 1
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("SD Proxy Upstream Error:", errorData);
      return res.status(response.status).json({
        error: "로컬 SD 서버 응답 오류",
        details: errorData,
        status: response.status
      });
    }

    const data = await response.json();
    
    // Stable Diffusion WebUI API는 { images: [base64, ...] } 형식을 반환함
    return res.status(200).json({
      success: true,
      images: data.images,
      imageBinary: data.images ? data.images[0] : null
    });

  } catch (e) {
    console.error("SD Proxy Critical Error:", e.message);
    return res.status(502).json({ 
      error: "로컬 SD 서버에 연결할 수 없습니다.",
      details: "ngrok 주소가 올바른지, 로컬 SD가 실행 중인지 확인하세요.",
      message: e.message 
    });
  }
}
