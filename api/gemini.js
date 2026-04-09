export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 없습니다.' });

  const { contents, generationConfig } = req.body;
  
  // ✅ 최신 모델 및 스트리밍 엔드포인트 사용
  const model = "gemini-2.5-flash-lite"; 
  const endpoint = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:streamGenerateContent?key=${apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, generationConfig })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      return res.status(response.status).json(errorData);
    }

    // 스트리밍 응답 처리 (취합해서 한 번에 반환)
    const reader = response.body.getReader();
    let aggregatedData = { candidates: [{ content: { parts: [{ text: "" }] } }] };
    let decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // JSON 객체 추출 로직 개선: 중괄호 { } 매칭을 시도하거나 정규표현식 사용
      // aiplatform 스트림은 [ {..}, {..} ] 형태이므로 쉼표나 대괄호를 제거하며 처리
      let startIndex = 0;
      while (true) {
        let openBrace = buffer.indexOf('{', startIndex);
        if (openBrace === -1) break;

        // 대략적인 객체 끝 찾기 (중첩 고려 필요할 수 있으나 단순 후보 검색)
        let closeBrace = buffer.indexOf('}', openBrace);
        if (closeBrace === -1) break;

        // 유효한 JSON인지 확인하며 확장
        let potentialJson = "";
        let found = false;
        for (let i = closeBrace; i < buffer.length; i++) {
          if (buffer[i] === '}') {
            potentialJson = buffer.substring(openBrace, i + 1);
            try {
              const chunk = JSON.parse(potentialJson);
              if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
                aggregatedData.candidates[0].content.parts[0].text += chunk.candidates[0].content.parts[0].text;
              }
              startIndex = i + 1;
              found = true;
              break;
            } catch (e) {
              // 미완성 JSON임
              continue;
            }
          }
        }
        if (!found) break; // 더 이상 처리할 완성된 객체 없음
      }
      buffer = buffer.substring(startIndex);
    }

    return res.status(200).json(aggregatedData);
    
  } catch (e) {
    console.error("Gemini Server Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
