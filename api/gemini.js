export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 없습니다.' });

  const { contents, generationConfig } = req.body;
  
  // ✅ 게임 생성용: Vertex AI (AI Platform) 표준 엔드포인트 사용
  const model = "gemini-3.0-flash-lite"; 
  const endpoint = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, generationConfig })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Gemini API Error:", data);
      return res.status(response.status).json(data);
    }

    // 클라이언트 형식을 그대로 유지하며 결과 반환
    return res.status(200).json(data);
    
  } catch (e) {
    console.error("Gemini Server Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
