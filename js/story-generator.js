import { state } from './state.js';
import { $, log, repairJson, ensureString, getStringHash } from './utils.js';
import { setStage, completeStages, showScreen } from './ui-manager.js';
import { fetchGutenbergBook } from './gutenberg.js';
import { getGameCache, fetchGeminiStory, ensureCharacterPortraits, saveGameCache } from './api-service.js';
import { startGame } from './game-engine.js';

/**
 * 생성된 게임 데이터의 구조적 무결성을 검증하고 수정합니다.
 */
function validateAndRepairGameData(data) {
  if (!data || !data.scenes || !Array.isArray(data.scenes)) return data;

  const sceneCount = data.scenes.length;
  const validCharIds = new Set((data.characters || []).map(c => c.id));

  data.scenes.forEach((scene, idx) => {
    const currentSceneNum = idx + 1;

    // 1. 비주얼 노벨 모드 스크립트 검증
    if (scene.script && Array.isArray(scene.script)) {
      scene.script.forEach(line => {
        if (line.speaker && !validCharIds.has(line.speaker)) {
          // 캐릭터가 없으면 가장 유사한 ID를 찾거나 무시 (여기서는 로그만 남김)
          console.warn(`Validation: Scene ${currentSceneNum} references unknown character ${line.speaker}`);
        }
      });
    }

    // 2. 선택지 분기 보정 (루프 방지 및 유효성 체크)
    if (scene.choices && Array.isArray(scene.choices)) {
      scene.choices.forEach(choice => {
        if (choice.next) {
          const nextIdx = Number(choice.next);
          // 선형 진행 게임이므로 현재보다 이전 혹은 자기 자신으로 돌아가는 루프 방지
          // 단, 마지막 장면이 아닌데 비정상적인 값이면 다음 장면으로 유도
          if (isNaN(nextIdx) || nextIdx <= currentSceneNum || nextIdx > sceneCount) {
             choice.next = currentSceneNum + 1;
          }
        }
      });
    }

    // 3. 장면 자체의 차기 인덱스 보정 (퀴즈 등에서 사용)
    if (scene.next) {
       const nextIdx = Number(scene.next);
       if (isNaN(nextIdx) || nextIdx <= currentSceneNum || nextIdx > sceneCount) {
         scene.next = currentSceneNum + 1;
       }
    }
    
    // 4. 필수 필드 보강
    scene.narrative = scene.narrative || scene.context || "이야기가 계속됩니다.";
    if (data.mode === 'visual_novel' && (!scene.script || scene.script.length === 0)) {
       scene.script = [{ speaker: "system", text: scene.narrative }];
    }
  });

  return data;
}

/**
 * AI 게임 생성을 조율하는 메인 함수입니다.
 */
export async function generate(retryCount = 0) {
  showScreen('loading');
  const maxRetries = 2;

  setStage(0);
  if (state.selectedSource === 'gutenberg' && state.selectedGutenbergBook) {
    if (retryCount === 0) log('구텐베르크에서 책을 불러오는 중...');
    try {
      state.epubText = await fetchGutenbergBook(state.selectedGutenbergBook.id);
    } catch(e) {
      log('다운로드 실패: ' + e.message, 'err');
      return;
    }
  }

  setStage(1);
  const lengthMap = { short: 15000, medium: 25000, long: 40000 };
  const scenesCountMap = { short: '3~5', medium: '5~8', long: '10~15' };
  const targetChars = lengthMap[state.selectedLength] || 25000;
  const processingText = state.epubText.slice(0, targetChars);

  log('콘텐츠 준비 완료 (' + Math.round(processingText.length / 1000) + 'k chars)');

  const bookIdStr = state.selectedGutenbergBook 
    ? state.selectedGutenbergBook.id.toString() 
    : `custom_${getStringHash(state.epubText)}`;
  const cacheKey = `${bookIdStr}_${state.selectedMode}_${state.selectedLang}_${state.selectedLength}`;

  if (retryCount === 0 && state.cacheStrategy === 'use') {
    const cachedData = await getGameCache(cacheKey);
    if (cachedData && cachedData.cached && cachedData.gameData) {
      log('기존 생성 데이터를 불러왔습니다.');
      state.gameData = cachedData.gameData;
      
      if (state.selectedMode === 'visual_novel' && state.gameData.characters) {
        const missingPortraits = state.gameData.characters.some(c => !c.avatar_url);
        if (missingPortraits) {
          log('일부 캐릭터 이미지가 누락되어 생성을 시작합니다...');
          await ensureCharacterPortraits(state.gameData.characters);
        }
      }

      setStage(3);
      completeStages();
      setTimeout(startGame, 600);
      return;
    }
  }

  const langMap = {
    ko: 'narrative, choices, quiz의 모든 텍스트를 자연스러운 한국어로 작성. 원문이 영어면 한국어로 번역/각색.',
    en: '모든 텍스트를 원문 언어(영어)로 유지.',
    bilingual: 'narrative는 한국어로 작성하고 en_narrative 필드에 영어 원문도 포함. choices도 text는 한국어, en_text는 영어.'
  };

  const vnExtra = state.selectedMode === 'visual_novel' ? `
[비주얼 노벨 모드 규칙]
1단계: 텍스트 원문에서 중요 인물을 유동적으로 추출 (3~8명 사이)
 - id, name, personality, role, image_prompt 필드 포함
 - image_prompt: 영어 묘사 및 화풍 명시 (예: "anime style, medium shot, brown hair, vintage suit"). 각 인물마다 고유한 개성이 드러나게 구체적으로 작성.
2단계: 시네마틱 스크립트 기반 스토리 생성
 - scenes[].script: [ { "speaker": "char_id", "text": "대화내용" }, ... ]
 - scenes[].bg_keyword: 장면 배경 키워드 (영어)
 - 예시: {"speaker": "elon_1", "text": "화성에 가야만 합니다."}` : '';

  const adventureExtra = state.selectedMode === 'adventure' ? `
[어드벤처 모드 규칙]
- 선택지 3개: 대담함(high risk), 신중함(low risk), 인간적(mid risk)
- 각 choice: text, outcome, score_impact, risk_level` : '';

  const studyExtra = state.selectedMode === 'study' ? `
[학습 모드 규칙]
- narrative에 핵심 개념(key_concept)과 예제 포함
- 퀴즈(quiz) 필수 포함` : '';

  const prompt = `당신은 세계 최고의 게임 디자이너다. 아래 텍스트를 바탕으로 '${state.selectedMode}' 모드의 인터랙티브 게임을 JSON으로 설계하라.

[텍스트 원문]
${processingText.slice(0, 8000)}

[필수 요구사항]
1. 언어: ${langMap[state.selectedLang]}
2. 분량: ${scenesCountMap[state.selectedLength]} 씬
3. 구조: 
   {
     "title_ko": "한국어 제목",
     "title": "English Title",
     "characters": [...],
     "scenes": [
       {
         "id": 1,
         "context": "장면 요약(10자 이내)",
         "narrative": "서술형 본문",
         "en_narrative": "English Narrative (필요시)",
         "original_excerpt": "원문 발췌",
         "choices": [...],
         "quiz": {...},
         "bg_keyword": "background keyword" (비주얼노벨용),
         "script": [...] (비주얼노벨용)
       }
     ],
     "endings": [...]
   }
${vnExtra}
${adventureExtra}
${studyExtra}

지루한 요약이 아니라, 플레이어가 몰입할 수 있는 긴장감 넘치는 스토리를 만들어라.
중요: 서론이나 결론 없이 오직 유효한 JSON 데이터만 출력하라. 마크다운 태그(\`\`\`json)를 사용하지 마라.`;

  setStage(2);
  log('AI 생성 시작...');
  
  try {
    const rawResponse = await fetchGeminiStory(prompt);
    let jsonText = rawResponse.trim();
    
    const startIdx = jsonText.indexOf('{');
    const lastIdx = jsonText.lastIndexOf('}');
    if (startIdx !== -1 && lastIdx !== -1) {
      jsonText = jsonText.substring(startIdx, lastIdx + 1);
    }
    
    jsonText = repairJson(jsonText);
    state.gameData = JSON.parse(jsonText);
    
    // 데이터 검증 및 보정
    state.gameData = validateAndRepairGameData(state.gameData);
    
    // 데이터 정규화 (필드 타입 보장)
    if (state.gameData) {
      state.gameData.title_ko = ensureString(state.gameData.title_ko);
      state.gameData.title = ensureString(state.gameData.title);
      if (state.gameData.scenes) {
        state.gameData.scenes.forEach(s => { s.context = ensureString(s.context); });
      }
      state.gameData.mode = state.selectedMode;
    }
    
    if (!state.gameData.scenes || !Array.isArray(state.gameData.scenes) || state.gameData.scenes.length === 0) {
       throw new Error('유효한 장면(scenes) 데이터가 생성되지 않았습니다.');
    }
    
    if (state.selectedMode === 'visual_novel' && state.gameData.characters) {
      log('캐릭터 로딩 중...');
      await ensureCharacterPortraits(state.gameData.characters);
    }

    log('스토리 캐시 저장 중...');
    await saveGameCache(cacheKey, state.gameData);

    setStage(3);
    state.gameStartTime = Date.now();
    completeStages();
    setTimeout(startGame, 900);
    
  } catch(e) {
    log('오류: ' + e.message, 'err');
    if (retryCount < maxRetries) {
      log('재시도 중...', 'warn');
      setTimeout(() => generate(retryCount + 1), 2000);
    }
  }
}
