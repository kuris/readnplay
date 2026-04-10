export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 없습니다.' });

  const { prompt, aspectRatio = "1:1", numImages = 1 } = req.body;
  
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
            outputOptions: { mimeType: "image/jpeg", compressionQuality: 75 }
          }
        })
      }));
      remaining -= count;
    }

    const responses = await Promise.all(requests);
    const allImages = [];

    for (const response of responses) {
      const data = await response.json();
      if (!response.ok) {
        console.error("Imagen API Error:", data);
        return res.status(response.status).json(data);
      }
      
      // Vertex AI / AI Platform 응답 형식에서 이미지 추출
      const images = data.predictions || data.images || [];
      images.forEach(img => {
        const binary = img.bytesBase64Encoded || img.imageBinary || img.image?.imageBinary;
        if (binary) allImages.push(binary);
      });
    }

    if (allImages.length === 0) {
      throw new Error("이미지 데이터 생성 실패");
    }

    return res.status(200).json({ 
      success: true,
      images: allImages, // 여러 장을 배열로 반환
      imageBinary: allImages[0] // 하위 호환성을 위해 첫 번째 이미지 추가
    });
    
  } catch (e) {
    console.error("Imagen Server Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
