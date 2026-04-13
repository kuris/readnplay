import { state } from './state.js';
import { log, sleep } from './utils.js';
import { buildDrawThingsPrompt } from './prompt-engine.js';
import { STYLE_PROFILES } from './constants.js';

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
 * 이미지 생성을 안정적으로 수행합니다 (환경별 분기 및 재시도 대응)
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
          
          let res;
          if (state.imageGenerator === 'sd_local') {
            // ✅ CASE 1: Stable Diffusion (Orchestrator + Worker Queue)
            // 1. 서버에 작업 생성 요청
            const jobRes = await fetch('/api/image-jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: params.prompt,
                negativePrompt: params.negativePrompt || "",
                sdUrl: state.sdUrl,
                metadata: { charName: params.metadata?.charName || 'unknown' }
              })
            });
            
            if (!jobRes.ok) {
              const errorBody = await jobRes.json().catch(() => ({}));
              throw new Error(`작업 등록 실패: ${JSON.stringify(errorBody)}`);
            }
            const jobData = await jobRes.json();
            const jobId = jobData.id;
            
            log(`[SD 큐] 작업 등록 완료 (ID: ${jobId}) - 로컬 워커를 대기 중...`, 'warn');
            
            // 2. 작업 완료까지 폴링 (최대 120초)
            let pollCount = 0;
            const maxPolls = 40; // 3초 간격 x 40 = 120초
            
            while (pollCount < maxPolls) {
              await sleep(3000);
              const checkRes = await fetch(`/api/image-jobs?id=${jobId}`);
              
              if (checkRes.status === 404) {
                 // 일관성 지연으로 일시적으로 못 찾을 수 있음
                 pollCount++;
                 continue;
              }
              
              if (!checkRes.ok) throw new Error(`상태 확인 실패 (${checkRes.status})`);
              
              const jobStatus = await checkRes.json();
              const finalUrl = jobStatus.result_url || jobStatus.resultUrl;
              
              if (jobStatus.status === 'done') {
                log(`[SD 큐] 생성 완료!`, 'ok');
                // 워커가 이미 저장한 결과 URL을 그대로 반환
                resolve({ 
                  success: true, 
                  url: finalUrl
                });
                return;
              }
              
              if (jobStatus.status === 'failed') {
                throw new Error(jobStatus.error || '생성 실패');
              }
              
              if (jobStatus.status === 'processing') {
                if (pollCount % 2 === 0) log(`[SD 큐] 맥북에서 생성 중...`, 'warn');
              }
              
              pollCount++;
            }
            throw new Error('대기 시간 초과 (로컬 워커가 실행 중인지 확인하세요)');

          } else {
            // ✅ CASE 2: Imagen 3 (Cloud)
            res = await fetch('/api/imagen', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(params)
            });
            
            if (!res.ok) {
              const errorData = await res.json().catch(() => ({}));
              console.error('Image API 호출 실패:', {
                status: res.status,
                error: errorData.error,
                details: errorData.details || errorData.message,
                raw: errorData
              });

              // 429(Rate Limit)나 500대 에러만 재시도
              const isRetriable = (res.status === 429 || res.status >= 500);
              if (isRetriable && retryCount < maxRetries) {
                retryCount++;
                continue;
              }
              
              // 세이프티 필터 등의 400 에러는 재시도하지 않음
              const err = new Error(errorData.error || `HTTP ${res.status}`);
              err.isFatal = res.status === 400; 
              throw err;
            }
            
            const data = await res.json();
            resolve(data);
            return;
          }
        } catch (e) {
          console.error(`safeFetchImagen error (retry ${retryCount}):`, e);
          
          if (state.imageGenerator === 'sd_local') {
            const errorMsg = e.message || '알 수 없는 오류';
            log(`[SD 오류] ${errorMsg}`, 'err');
            
            if (errorMsg.includes('작업 등록 실패') || errorMsg.includes('HTTP 500')) {
              log('💡 서버의 Environment Variables에 BLOB_READ_WRITE_TOKEN이 제대로 설정되었는지 확인이 필요합니다.', 'err');
            } else {
              log('💡 로컬 워커가 실행 중이거나 ngrok 주소가 맞는지 확인하세요.', 'err');
            }
            resolve(null);
            return;
          }

          if (!e.isFatal && retryCount < maxRetries) {
            retryCount++;
          } else {
            log(e.isFatal ? `생성 중단: ${e.message}` : '이미지 생성 최대 재시도 횟수 초과', 'err');
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
  // 중요도 순으로 정렬 (A -> B -> C)
  const sortedChars = [...characters].sort((a, b) => {
    const rank = { 'A': 1, 'B': 2, 'C': 3 };
    return (rank[a.importance] || 4) - (rank[b.importance] || 4);
  });

  const total = sortedChars.length;
  for (let i = 0; i < total; i++) {
    const char = sortedChars[i];
    
    // 이미 URL이 있거나, 인물이 아닌 경우(location, object 등) 제외
    if (char.avatar_url && (char.avatar_url.includes('supabase.co') || char.avatar_url.includes('vercel-storage.com'))) continue;
    if (char.type && !['person_major', 'person_minor'].includes(char.type)) {
      log(`[${i + 1}/${total}] ${char.name} (엔티티) 이미지는 장면 생성에서 처리합니다.`, 'warn');
      continue;
    }

    if (char.appearance || char.image_prompt) {
      log(`[${i + 1}/${total}] ${char.name} (${char.importance}급) 인물화 생성 중...`);
      
      const tryGenerate = async (retriesInner = 1) => {
        try {
          const charPrompt = char.appearance || char.image_prompt;
          const styleProfile = STYLE_PROFILES[state.userDecisions.visualStyle.profile] || STYLE_PROFILES.semi_realistic_anime;
          
          const genData = await safeFetchImagen({ 
            prompt: `(${styleProfile}), ${charPrompt}, detailed eyes and face, looking at viewer, highly detailed background, (rim lighting, cinematic atmospheric light:1.2)`,
            negativePrompt: "(text, letters, words, logo, signature, watermark, credits, billboard, placeholder:1.5), sketch, rough, draft, monochrome, black and white, lowres, bad anatomy, bad hands, distorted face, figurine, toy, 3d, render, miniature, doll, pedestal, plastic, statue, blurry, two people, twins, duplicated character",
            aspectRatio: "1:1", numImages: 1,
            mimeType: "image/png"
          });
          
          if (genData) {
            // URL 직접 반환 처리
            if (genData.url && (genData.url.includes('supabase.co') || genData.url.includes('vercel-storage.com'))) {
              char.avatar_url = genData.url;
              log(`${char.name} 생성 완료!`);
              return true;
            }

            const base64Data = genData.imageBinary || (genData.images && genData.images[0]);
            if (base64Data) {
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
          }
        } catch (e) {
          console.error(`Generation error for ${char.name}:`, e.message);
        }

        if (retriesInner > 0) return await tryGenerate(retriesInner - 1);
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
