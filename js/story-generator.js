import { state } from './state.js';
import { $, log, repairJson, ensureString, getStringHash } from './utils.js';
import { setStage, completeStages, showScreen } from './ui-manager.js';
import { fetchGutenbergBook } from './gutenberg.js';
import { getGameCache, fetchGeminiStory, ensureCharacterPortraits, saveGameCache } from './api-service.js';
import { startGame } from './game-engine.js';
import { 
  buildScenePrompt, 
  extractJsonFromModelResponse, 
  normalizeSceneResult 
} from './prompt-engine.js';

/**
 * 생성된 게임 데이터의 구조적 무결성을 검증하고 수정합니다.
 */
function validateAndRepairGameData(data) {
  if (!data || !data.scenes || !Array.isArray(data.scenes)) return data;

  log('스토리 데이터 구조 정밀 검사 중...');
  const sceneCount = data.scenes.length;
  const validCharIds = new Set((data.characters || []).map(c => String(c.id)));

  // 0. 캐릭터 데이터 기본 검증
  if (data.characters) {
    data.characters.forEach(c => {
      c.id = String(c.id);
      c.name = c.name || "등장인물";
    });
  }

  data.scenes.forEach((scene, idx) => {
    const currentSceneNum = idx + 1;

    // 1. 비주얼 노벨 모드 스크립트 검증
    if (scene.script && Array.isArray(scene.script)) {
      scene.script.forEach(line => {
        line.speaker = String(line.speaker);
        if (line.speaker !== 'system' && line.speaker !== 'narrator' && !validCharIds.has(line.speaker)) {
          // 퍼지 매칭 시도: 대소문자 무시, 혹은 이름 자체가 포함되어 있는지 확인
          const lowerSpeaker = line.speaker.toLowerCase();
          const matchedChar = (data.characters || []).find(c => 
            c.id.toLowerCase() === lowerSpeaker || 
            c.name.toLowerCase().includes(lowerSpeaker) ||
            lowerSpeaker.includes(c.id.toLowerCase())
          );

          if (matchedChar) {
            console.log(`Validation: Fixing speaker ID [${line.speaker}] -> [${matchedChar.id}]`);
            line.speaker = matchedChar.id;
          } else {
            console.warn(`Validation: Unknown speaker ID [${line.speaker}] in Scene ${currentSceneNum}. Dynamically adding to character list.`);
            
            // 엑스트라 자동 생성 및 등록
            const newCharId = line.speaker;
            const newChar = {
              id: newCharId,
              name: newCharId.includes('_') ? (newCharId.charAt(0).toUpperCase() + newCharId.slice(1).replace(/_/g, ' ')) : newCharId,
              image_prompt: `A side character named ${newCharId} in the story "${data.metadata?.title || 'this book'}", matching the overall art style.`,
              avatar_url: '' // 이후 ensureCharacterPortraits에서 생성 요청됨
            };
            
            data.characters.push(newChar);
            validCharIds.add(newCharId);
            line.speaker = newCharId;
          }
        }
      });
    }

    // 2. 선택지 분기 보정 (루프 방지 및 유효성 체크)
    if (scene.choices && Array.isArray(scene.choices)) {
      scene.choices.forEach(choice => {
        if (choice.next !== undefined) {
          const nextIdx = Number(choice.next);
          // 선형 진행 게임이므로 현재보다 이전 혹은 자기 자신으로 돌아가는 루프 방지
          // 0이거나 sceneCount보다 큰 경우도 보정
          if (isNaN(nextIdx) || nextIdx <= currentSceneNum || nextIdx > sceneCount) {
             choice.next = (currentSceneNum < sceneCount) ? currentSceneNum + 1 : null;
          }
        }
      });
    }

    // 3. 장면 자체의 차기 인덱스 보정
    if (scene.next !== undefined) {
       const nextIdx = Number(scene.next);
       if (isNaN(nextIdx) || nextIdx <= currentSceneNum || nextIdx > sceneCount) {
         scene.next = (currentSceneNum < sceneCount) ? currentSceneNum + 1 : null;
       }
    }
    
    // 4. 퀴즈 데이터 보정 (Study 모드 대응)
    if (scene.quiz) {
      if (!scene.quiz.question) scene.quiz.question = "학습한 내용을 확인해봅시다.";
      if (!scene.quiz.choices || !Array.isArray(scene.quiz.choices) || scene.quiz.choices.length === 0) {
        scene.quiz.choices = ["확인했습니다"];
        scene.quiz.answer = 0;
      }
      if (scene.quiz.answer === undefined || isNaN(scene.quiz.answer)) scene.quiz.answer = 0;
    }

    // 5. 필수 필드 보강
    scene.id = currentSceneNum;
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
  const scenesCountMap = { short: '3~5', medium: '5~8', long: '10~15', series: '5~8' };
  
  // --- 시리즈/커스텀 모드 특별 처리 ---
  if (state.selectedLength === 'series' && !state.customStartingPoint) {
    try {
      const chapters = await extractChapters(state.epubText);
      renderChapterList(chapters);
      showScreen('chapters');
      return; // 사용자가 선택할 때까지 중단
    } catch (e) {
      log('챕터 분석 실패, 표준 모드로 진행합니다.', 'warn');
      state.selectedLength = 'medium';
    }
  }

  const targetChars = lengthMap[state.selectedLength] || 25000;
  let processingText = '';
  
  if (state.selectedLength === 'series' && state.customStartingPoint) {
      const startPos = state.customStartingPoint.index || 0;
      const endPos = state.customEndPoint ? state.customEndPoint.index : (startPos + 40000);
      
      // 최소 10000자, 최대 제한 없이 선택한 만큼 처리 (Gemini 컨텍스트 고려)
      processingText = state.epubText.substring(startPos, Math.max(startPos + 10000, endPos));
      log(`선택된 구간(${state.customStartingPoint.name} ~ ${state.customEndPoint?.name || '끝'}) 분석을 시작합니다.`);
  } else {
      processingText = state.epubText.slice(0, targetChars);
  }

  log('콘텐츠 준비 완료 (' + Math.round(processingText.length / 1000) + 'k chars)');

  const bookIdStr = state.selectedGutenbergBook 
    ? state.selectedGutenbergBook.id.toString() 
    : `custom_${getStringHash(state.epubText)}`;
  
  const cacheKey = `${bookIdStr}_${state.selectedMode}_${state.selectedLang}_${state.selectedLength}_${state.customStartingPoint?.index || 0}_${state.customEndPoint?.index || 'end'}`;

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

  log('AI 시네마틱 프롬프트 구성 중...');
  
  const workTitle = state.selectedGutenbergBook?.title || state.bookTitle || "";
  const chapterTitle = state.customStartingPoint?.name || "";
  
  const prompt = buildScenePrompt({
    text: processingText.slice(0, 15000), 
    chapterTitles: [chapterTitle],
    workTitle,
    maxCandidates: state.selectedLength === 'long' ? 12 : 8,
    maxSelectedScenes: state.selectedLength === 'short' ? 3 : (state.selectedLength === 'long' ? 8 : 5),
    styleHint: "digital art style, semi-realistic anime, cinematic lighting, masterpiece, clean lineart"
  });

  setStage(2);
  log('AI 생성 시작 (시네마틱 엔진)...');

  try {
    const rawResponse = await fetchGeminiStory(prompt);
    const parsed = extractJsonFromModelResponse(rawResponse);
    const normalized = normalizeSceneResult(parsed);
    
    log('시네마틱 데이터 수신 및 정규화 완료.');

    // 앱 데이터 구조로 매핑
    state.gameData = {
      title_ko: workTitle,
      title: workTitle,
      mode: state.selectedMode,
      characters: [], // 나중에 추출됨
      scenes: normalized.selected_scenes.map((s, idx) => {
        // 스크립트 결합 (Opening + Core + Closing)
        const script = [];
        if (s.dialogue.opening_hook_line?.line) {
          script.push({ 
            speaker: s.dialogue.opening_hook_line.speaker || 'narrator', 
            text: s.dialogue.opening_hook_line.line 
          });
        }
        s.dialogue.core_dialogue_lines.forEach(line => {
          if (line.line) {
            script.push({ speaker: line.speaker || 'narrator', text: line.line });
          }
        });
        if (s.dialogue.closing_hook_line?.line) {
          script.push({ 
            speaker: s.dialogue.closing_hook_line.speaker || 'narrator', 
            text: s.dialogue.closing_hook_line.line 
          });
        }

        return {
          id: idx + 1,
          context: s.title,
          narrative: s.context_for_new_viewer,
          script: script,
          choices: s.choices || [], // 선택지 데이터 매핑
          image_data: s.image_data, 
          bg_keyword: s.image_data.prompt_seed_text 
        };
      })
    };

    // 캐릭터 목록 및 상세 메타데이터 추출 (candidates 정보 활용)
    const charMap = new Map();
    normalized.scene_candidates.forEach(c => {
      if (Array.isArray(c.characters)) {
        c.characters.forEach(char => {
          if (char.name && !charMap.has(char.name)) {
            charMap.set(char.name, {
              id: char.name,
              name: char.name,
              gender: char.gender || 'unknown',
              appearance: char.appearance || '',
              image_prompt: `${char.name}, ${char.gender}, ${char.appearance || 'detailed character design'}`
            });
          }
        });
      }
    });

    state.gameData.characters = Array.from(charMap.values());
    
    // 데이터 검증 및 보정 (기존 로직 활용)
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

/**
 * 책의 챕터 구성과 주요 시점을 분석합니다.
 */
/**
 * 책의 챕터 구성과 주요 시점을 분석합니다. (정규식 기반 사전 스캔 + AI 검증)
 */
async function extractChapters(text) {
  log('책의 전체 구조를 정밀 스캔 중입니다...');
  
  const len = text.length;
  const markers = [];
  
  // 1. 정규식 기반 사전 스캔 (주요 목차 패턴)
  const patterns = [
    /제\s*(\d+)\s*[화장강회]/g,      // 제1화, 제 2 장, 제3회 등
    /Chapter\s*(\d+)/gi,           // Chapter 1, CHAPTER 2 등
    /(\d+)\s*[화장회]\.?/g,         // 1화, 2장, 3회.
    /\n(\d+)\.\s/g                 // 줄 시작의 "1. " 패턴
  ];

  patterns.forEach(regex => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      markers.push({
        text: match[0],
        index: match.index,
        num: parseInt(match[1])
      });
    }
  });

  // 너무 촘촘한 마커들 정리 (최소 2000자 간격) 및 정렬
  const sortedMarkers = markers.sort((a,b) => a.index - b.index);
  const filteredMarkers = [];
  if (sortedMarkers.length > 0) {
    filteredMarkers.push(sortedMarkers[0]);
    for (let i = 1; i < sortedMarkers.length; i++) {
      if (sortedMarkers[i].index - filteredMarkers[filteredMarkers.length - 1].index > 2000) {
        filteredMarkers.push(sortedMarkers[i]);
      }
    }
  }

  // 2. 샘플링 지점 결정 (정규식 발견 지점 + 기본 샘플 지점)
  const sampleIndices = [0, ...filteredMarkers.map(m => m.index), Math.floor(len * 0.25), Math.floor(len * 0.5), Math.floor(len * 0.75), len - 15000];
  const uniqueIndices = [...new Set(sampleIndices.filter(idx => idx >= 0 && idx < len))].sort((a,b) => a - b);
  
  // 도서 길이에 따라 샘플링 밀도 조절 (긴 책은 더 촘촘하게, 최대 50개)
  const maxSamples = len > 500000 ? 50 : 30;
  const finalIndices = uniqueIndices.filter((idx, i) => {
      if (i === 0 || i === uniqueIndices.length - 1) return true;
      // 정규식 마커 지점은 최대한 포함하되 전체 개수 제한
      return true; 
  }).slice(0, maxSamples);

  const samples = finalIndices.map(idx => ({
    pos: idx,
    content: text.substring(idx, idx + 8000)
  }));

  // AI에게 줄 정규식 발견 마커 요약 (너무 많으면 생략)
  const markersSummary = filteredMarkers.length > 0 
    ? filteredMarkers.map(m => `[위치: ${m.index}자] "${m.text}"`).join('\n')
    : "명시적 챕터 마커를 찾지 못했습니다.";

  const prompt = `다음은 소설의 여러 지점에서 추출한 텍스트 샘플들과 정규식으로 스캔한 예상 챕터 마커들이다. 
우리는 이 소설의 전체 챕터 목록(TOC)을 만들고자 한다.

[정규식 스캔 결과 - 참고용]:
${markersSummary}

[텍스트 샘플 데이터]:
${samples.map(s => `[위치: ${s.pos}자 지점]:\n${s.content}`).join('\n\n')}

요구사항:
1. 샘플과 스캔 결과를 바탕으로 1화(Chapter 1)부터 완결까지 순차적인 목록을 작성하라.
2. 장편 소설의 경우, 샘플 사이에 존재할 법한 지점을 정규식 스캔 결과를 참고하여 최대한 누락 없이 포함하라.
3. 각 항목의 index는 전체 텍스트 길이(${len}자)를 기준으로 한 절대적 위치여야 한다.
4. 소설의 주요 사건이나 테마를 짧은 제목(예: "제18화: 무도회")으로 붙여주면 좋다.
5. 중간에 수십 개의 챕터를 한꺼번에 건너뛰지 마라. 촘촘한 목록을 원한다.

응답 형식 (JSON 리스트만):
[
  {"name": "제N화: 제목", "index": 숫자},
  ...
]`;

  const raw = await fetchGeminiStory(prompt);
  try {
    let chapters = JSON.parse(repairJson(raw.trim()));
    
    // AI 결과가 너무 부실할 경우 (정규식은 많이 찾았는데 AI는 5개 미만 등)
    if (filteredMarkers.length > 10 && chapters.length < filteredMarkers.length / 2) {
      console.warn('AI 챕터 분석 결과가 부족하여 정규식 마커 기반으로 보정합니다.');
      // AI 결과와 정규식 결과를 병합 (중복 제거 로직 필요하지만 여기서는 단순 Fallback)
      const aiChapters = chapters;
      const combined = [...aiChapters];
      
      filteredMarkers.forEach(m => {
        if (!combined.some(c => Math.abs(c.index - m.index) < 5000)) {
           combined.push({ name: m.text, index: m.index });
        }
      });
      chapters = combined;
    }

    // 최종 결과 정렬 및 유효성 체크
    chapters = chapters.filter(c => c.index >= 0 && c.index <= len);
    return chapters.sort((a,b) => a.index - b.index);
  } catch (e) {
    console.error('Hybrid Chapter extraction failed', e);
    // 폴백: 정규식 마커 직접 사용
    if (filteredMarkers.length > 3) {
      return filteredMarkers.map(m => ({ name: m.text, index: m.index }));
    }
    return [
      { name: "도입부", index: 0 },
      { name: "초반 전개", index: Math.floor(len * 0.2) },
      { name: "전개 1", index: Math.floor(len * 0.4) },
      { name: "전개 2", index: Math.floor(len * 0.6) },
      { name: "결말", index: Math.floor(len * 0.8) }
    ];
  }
}

/**
 * 분석된 챕터 목록을 UI에 렌더링하고 범위 선택을 관리합니다.
 */
function renderChapterList(chapters) {
  const grid = $('chapter-list');
  const confirmBtn = $('btn-chapters-confirm');
  if (!grid) return;
  
  state.customStartingPoint = null;
  state.customEndPoint = null;
  if (confirmBtn) confirmBtn.disabled = true;

  function updateUI() {
    const items = grid.querySelectorAll('.chapter-item');
    items.forEach((item, idx) => {
      const chIndex = chapters[idx].index;
      item.classList.remove('sel-start', 'sel-end', 'sel-range');
      
      const startIdx = state.customStartingPoint ? chapters.findIndex(c => c.index === state.customStartingPoint.index) : -1;
      const endIdx = state.customEndPoint ? chapters.findIndex(c => c.index === state.customEndPoint.index) : -1;

      if (startIdx !== -1 && idx === startIdx) item.classList.add('sel-start');
      if (endIdx !== -1 && idx === endIdx) item.classList.add('sel-end');
      
      if (startIdx !== -1 && endIdx !== -1) {
        if (idx > startIdx && idx < endIdx) item.classList.add('sel-range');
      }
    });
    
    if (confirmBtn) confirmBtn.disabled = !state.customStartingPoint;
  }

  grid.innerHTML = chapters.map((ch, i) => `
    <div class="chapter-item fadein" style="animation-delay: ${i * 0.05}s" data-index="${ch.index}" data-name="${ch.name}">
      <div class="chapter-num">${i + 1}</div>
      <div class="chapter-name">${ch.name}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.chapter-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
      const ch = chapters[idx];
      
      if (!state.customStartingPoint || (state.customStartingPoint && state.customEndPoint)) {
        // 새로 시작점 선택
        state.customStartingPoint = ch;
        state.customEndPoint = null;
      } else {
        // 종료점 선택
        if (ch.index > state.customStartingPoint.index) {
          state.customEndPoint = ch;
        } else {
          // 클릭한 게 시작점보다 앞이면 시작점을 바꿈
          state.customStartingPoint = ch;
        }
      }
      updateUI();
    });
  });

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      generate(0);
    };
  }
}
