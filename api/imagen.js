export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 없습니다.' });

  const { prompt, aspectRatio = "1:1", numImages = 1, mimeType, compressionQuality } = req.body;
  
  // ✅ 최신 Imagen 3 모델 및 Vertex AI 엔드포인트 스타일 (API Key 사용)
  const model = "imagen-3.0-fast-generate-001";
  const endpoint = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:predict?key=${apiKey}`;

  try {
    // Imagen 3은 한 번에 최대 4개까지만 생성 가능하므로 요청을 분할함
    const requests = [];
    let remaining = numImages;
    
    while (remaining > 0) {
      const count = Math.min(remaining, 4);
      requests.push(fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: count,
            aspectRatio: aspectRatio,
            personGeneration: "allow_adult",
            outputOptions: { 
              mimeType: mimeType || "image/jpeg", 
              compressionQuality: compressionQuality || 75 
            }
          }
        })
      }));
      remaining -= count;
    }

    const responses = await Promise.all(requests);
    const allImages = [];

    for (const response of responses) {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Imagen Upstream Error:", errorData);
        return res.status(response.status).json({
          error: "Imagen API 업스트림 에러",
          details: errorData,
          status: response.status
        });
      }
      
      const data = await response.json();
      
      // Vertex AI / AI Platform 응답 형식에서 이미지 추출
      const predictions = data.predictions || [];
      
      if (predictions.length === 0) {
        // 결과가 없으면 세이프티 필터링 가능성 체크
        console.warn("No predictions returned. Possible safety filter trigger.", data);
      }

      predictions.forEach(img => {
        // 여러 가능한 필드명 체크 (bytesBase64Encoded가 표준)
        const binary = img.bytesBase64Encoded || img.imageBinary || img.image?.imageBinary || img.bytes;
        if (binary) allImages.push(binary);
      });
    }

    if (allImages.length === 0) {
      return res.status(400).json({ 
        error: "이미지 데이터가 생성되지 않았습니다 (Safety filter?).",
        rawResponse: responses[0] ? await (async () => { try { return await responses[0].clone().json(); } catch(e) { return "Parse Error"; } })() : null
      });
    }

    return res.status(200).json({ 
      success: true,
      images: allImages,
      imageBinary: allImages[0]
    });
    
  } catch (e) {
    console.error("Imagen Handler Critical Error:", e);
    return res.status(500).json({ 
      error: "내부 서버 에러",
      message: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
}
