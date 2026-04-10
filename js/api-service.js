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
      const maxRetries = 3;
      
      while (retryCount <= maxRetries) {
        try {
          // 기본 5초 대기 (할당량 방어용)
          await sleep(5000);
          
          const res = await fetch('/api/imagen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
          });
          
          if (res.status === 429) {
            if (retryCount < maxRetries) {
              const waitTime = (retryCount + 1) * 10000;
              log(`할당량 초과. ${waitTime/1000}초 후 다시 시도합니다... (${retryCount + 1}/${maxRetries})`, 'warn');
              await sleep(waitTime);
              retryCount++;
              continue; 
            } else {
              log('이미지 생성 최대 재시도 횟수 초과', 'err');
              resolve(null);
              return;
            }
          }
          
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          resolve(data);
          return; 
        } catch (e) {
          console.error('safeFetchImagen error:', e);
          resolve(null);
          return;
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
            prompt: `${char.image_prompt}, character illustration, white background, high quality, standalone character`,
            aspectRatio: "1:1", numImages: 1
          });
          
          if (genData) {
            const base64Data = genData.imageBinary || (genData.images && genData.images[0]);
            if (!base64Data) throw new Error('No image data');

            const fileName = `${char.name.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
            const saveRes = await fetch('/api/save-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBinary: base64Data, fileName, mimeType: 'image/jpeg' })
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
