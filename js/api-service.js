import { state } from './state.js';
import { log, sleep } from './utils.js';

/**
 * Gemini API를 통해 스토리를 생성합니다.
 */
export async function fetchGeminiStory(prompt) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { 
        maxOutputTokens: 8192, 
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  if (!res.ok) throw new Error(`API 오류 ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * 이미지 생성을 안정적으로 수행합니다 (429 할당량 초과 대응)
 */
export async function safeFetchImagen(params) {
  return new Promise((resolve) => {
    state.imageTaskQueue = state.imageTaskQueue.then(async () => {
      let retryCount = 0;
      const maxRetries = 5;
      let baseDelay = 5000;
      
      while (retryCount <= maxRetries) {
        try {
          // 호출 간 간격 유지
          const currentDelay = retryCount === 0 ? baseDelay : baseDelay * Math.pow(2, retryCount);
          if (retryCount > 0) log(`재시도 대기 중 (${currentDelay/1000}초)...`, 'warn');
          await sleep(currentDelay);
          
          const res = await fetch('/api/imagen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
          });
          
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error('Imagen API 호출 실패:', {
              status: res.status,
              error: errorData.error,
              details: errorData.details || errorData.message,
              raw: errorData
            });

            // 429(Rate Limit)나 500대 에러만 재시도
            if ((res.status === 429 || res.status >= 500) && retryCount < maxRetries) {
              retryCount++;
              continue;
            }
            
            throw new Error(errorData.error || `HTTP ${res.status}`);
          }
          
          const data = await res.json();
          resolve(data);
          return; 
        } catch (e) {
          console.error(`safeFetchImagen retry ${retryCount}:`, e);
          if (retryCount < maxRetries) {
            retryCount++;
          } else {
            log('이미지 생성 최대 재시도 횟수 초과', 'err');
            resolve(null);
            return;
          }
        }
      }
    });
  });
}

/**
 * 캐릭터들의 인물화를 생성하고 저장합니다.
 */
export async function ensureCharacterPortraits(characters) {
  const total = characters.length;
  for (let i = 0; i < total; i++) {
    const char = characters[i];
    if (char.avatar_url && char.avatar_url.includes('vercel-storage.com')) continue;
    
    if (char.image_prompt) {
      log(`[${i + 1}/${total}] ${char.name} 인물화 생성 대기 중...`);
      
      const tryGenerate = async (retriesInner = 1) => {
        try {
          const genData = await safeFetchImagen({ 
            prompt: `${char.image_prompt}, character illustration, standalone portrait, pure solid white background, high quality, studio lighting, masterpiece`,
            aspectRatio: "1:1", numImages: 1,
            mimeType: "image/png"
          });
          
          if (genData) {
            const base64Data = genData.imageBinary || (genData.images && genData.images[0]);
            if (!base64Data) throw new Error('No image data');

            const fileName = `${char.name.replace(/\s+/g, '_')}_${Date.now()}.png`;
            const saveRes = await fetch('/api/save-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBinary: base64Data, fileName, mimeType: 'image/png' })
            });
            
            if (saveRes.ok) {
              const resData = await saveRes.json();
              char.avatar_url = resData.url;
              log(`${char.name} 생성 완료!`);
              return true;
            }
          }
        } catch (e) {
          console.error(`Generation error for ${char.name}:`, e.message);
        }

        if (retriesInner > 0) {
          return await tryGenerate(retriesInner - 1);
        }
        return false;
      };

      await tryGenerate();
    }
  }
}

/**
 * 게임 데이터 캐시 정보를 가져옵니다.
 */
export async function getGameCache(cacheKey) {
  try {
    const res = await fetch('/api/game-save?cacheKey=' + cacheKey);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Cache fetch failed', e);
    return null;
  }
}

/**
 * 생성된 게임 데이터를 서버에 캐시합니다.
 */
export async function saveGameCache(cacheKey, gameData) {
  try {
    await fetch('/api/game-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cacheKey, gameData })
    });
    return true;
  } catch (e) {
    console.warn('Cache save failed', e);
    return false;
  }
}
