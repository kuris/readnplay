export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 없습니다.' });

  const { prompt, aspectRatio = "1:1", negativePrompt = "" } = req.body;
  
  // ✅ Vertex AI / Gemini API Imagen 3 엔드포인트
  const model = "imagen-3.0-generate-001";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateImages?key=${apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        number_of_images: 1,
        safety_settings: [
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
        ],
        aspect_ratio: aspectRatio,    // 1:1 유지
        person_generation: "ALLOW_ADULT",
        output_options: {
          mime_type: "image/jpeg",    // PNG보다 가벼운 JPEG 사용
          compression_quality: 75     // 웹 표시용 최적 품질 (파일 크기↓ 속도↑)
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Imagen API Error:", data);
      return res.status(response.status).json(data);
    }

    // Imagen 3 응답에서 첫 번째 이미지 데이터를 추출 (보통 base64 형태)
    const imageData = data.images?.[0]?.imageBinary || data.images?.[0]?.image?.imageBinary;
    
    if (!imageData) {
      throw new Error("이미지 데이터 생성 실패");
    }

    return res.status(200).json({ 
      success: true,
      imageBinary: imageData 
    });
    
  } catch (e) {
    console.error("Imagen Server Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
