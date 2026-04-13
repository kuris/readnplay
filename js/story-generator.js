import { state } from './state.js';
import { $, log, repairJson, ensureString, getStringHash } from './utils.js';
import { setStage, completeStages, showScreen } from './ui-manager.js';
import { fetchGutenbergBook } from './gutenberg.js';
import { getGameCache, fetchGeminiStory, ensureCharacterPortraits, saveGameCache } from './api-service.js';
import { startGame } from './game-engine.js';
import { 
  initWorkflowUI, 
  postAiMessage, 
  renderWorkflowCard, 
  renderWorkflowSidebar 
} from './workflow-ui.js';
import { 
  buildScenePrompt, 
  buildEntityExtractionPrompt,
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
 * 사용자 승인을 기다리는 Promise 래퍼입니다.
 */
async function waitForUserApproval(point, data) {
  state.workflow.stageIdx = point.idx;
  renderWorkflowSidebar();
  
  return new Promise(resolve => {
    renderWorkflowCard(point.type, data, (decision) => {
      resolve(decision);
    });
  });
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
  const lengthLimit = 60000;
  if (state.selectedLength === 'series' && !state.customStartingPoint) {
    try {
      const chapters = await extractChapters(state.epubText);
      renderChapterList(chapters);
      showScreen('chapters');
      return;
    } catch (e) {
      log('챕터 분석 실패, 표준 모드로 진행합니다.', 'warn');
      state.selectedLength = 'medium';
    }
  }

  const lengthMap = { short: 15000, medium: 30000, long: 60000, series: 60000 };
  const targetChars = lengthMap[state.selectedLength] || 30000;
  let processingText = '';
  
  if (state.selectedLength === 'series' && state.customStartingPoint) {
      const startPos = state.customStartingPoint.index || 0;
      const endPos = state.customEndPoint ? state.customEndPoint.index : (startPos + lengthLimit);
      processingText = state.epubText.substring(startPos, Math.min(startPos + lengthLimit, endPos));
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
        await ensureCharacterPortraits(state.gameData.characters);
      }
      setStage(3);
      completeStages();
      setTimeout(startGame, 600);
      return;
    }
  }

  // 🚀 [NEW Workflow] 단계별 인터랙션 시작
  initWorkflowUI();
  
  // -- Interrupt Point 1: Mode Selection --
  await postAiMessage("반갑습니다! 먼저 텍스트의 길이를 분석해보니, 다음과 같은 생성 방식을 제안해 드립니다.");
  const chosenMode = await waitForUserApproval({ idx: 0, type: 'MODE_SELECT' }, { 
    recommendedMode: processingText.length > 25000 ? 'story' : 'teaser' 
  });
  state.userDecisions.generationMode = chosenMode;
  await postAiMessage(`좋습니다. <b>${chosenMode === 'story' ? '전개 집중 (Full Story)' : '요약 탐색 (Highlights)'}</b> 모드로 진행하겠습니다.`);

  if (chosenMode === 'teaser') {
    return generateTeaserMode({ processingText, cacheKey, retryCount });
  } else {
    return generateStoryMode({ processingText, cacheKey, retryCount });
  }
}

/**
 * [STORY MODE] 멀티 스테이지 정밀 생성 파이프라인
 */
async function generateStoryMode({ processingText, cacheKey, retryCount }) {
  const workTitle = state.selectedGutenbergBook?.title || state.bookTitle || "";
  const chapterTitles = state.customStartingPoint ? [state.customStartingPoint.name] : ["시작 지점"];

  try {
    // 1단계: 엔티티 추출
    setStage(1);
    await postAiMessage("1단계: 등장인물 및 주요 엔티티를 분석하고 있습니다. 잠시만 기다려주세요...");
    
    const entityPrompt = buildEntityExtractionPrompt({ text: processingText.slice(0, 20000), workTitle });
    const entityResRaw = await fetchGeminiStory(entityPrompt);
    const entityData = extractJsonFromModelResponse(entityResRaw);
    const rawEntities = entityData.entities || [];

    // -- Interrupt Point 2: Entity Resolution --
    await postAiMessage(`${rawEntities.length}명의 인물과 장소를 찾아냈습니다. 중복되거나 불필요한 항목이 있는지 확인해주세요.`);
    const resolution = await waitForUserApproval({ idx: 1, type: 'ENTITY_RESOLVE' }, { entities: rawEntities });
    
    // 사용자의 결정을 반영하여 실제 캐릭터 리스트 구성
    const resolvedEntities = resolution.entities;
    state.userDecisions.entityResolution.mergeGroups = resolution.mergeGroups;

    // 2단계: 비주얼 스타일 결정
    // -- Interrupt Point 3: Visual Style Selection --
    await postAiMessage("좋습니다. 이제 작품의 분위기를 결정할 차례입니다. 어떤 화풍으로 그려낼까요?");
    const chosenStyle = await waitForUserApproval({ idx: 2, type: 'STYLE_SELECT' }, {});
    state.userDecisions.visualStyle.profile = chosenStyle;

    // 3단계: 마스터 인물화 생성
    setStage(2);
    await postAiMessage(`${chosenStyle} 스타일로 주요 인물들의 마스터 포트레이트를 생성합니다. 이 이미지는 게임 전체의 일관성을 유지하는 기준이 됩니다.`);
    
    const majorChars = resolvedEntities.filter(e => ['person_major', 'person_minor'].includes(e.type));
    state.gameData = { characters: majorChars, scenes: [], metadata: { title: workTitle } };
    
    // 캐릭터 생성 전 스타일 가이드 주입 (ensureCharacterPortraits 내부에서 state.userDecisions 참조하게 수정 필요)
    await ensureCharacterPortraits(state.gameData.characters);

    // 4단계: 생성 계획 확인
    // -- Interrupt Point 4: Plan Confirmation --
    await postAiMessage("모든 준비가 끝났습니다! 분석된 정보로 구성한 최종 생성 계획입니다.");
    const confirmed = await waitForUserApproval({ idx: 3, type: 'PLAN_CONFIRM' }, {
      sceneCount: state.userDecisions.generationMode === 'story' ? 12 : 5, // 예상치
      characterCount: state.gameData.characters.length
    });

    if (!confirmed) return; // 취소 시 중단 (또는 처음으로)

    // 5단계: 장면 생성 실행
    await postAiMessage("✨ 이제 AI가 본격적으로 이야기를 풀어냅니다. 잠시만 기다려주세요!");
    
    const scenePrompt = buildScenePrompt({
      text: processingText,
      entities: state.gameData.characters.map(c => ({ id: c.id, name: c.canonical_name || c.name, appearance: c.appearance })),
      chapterTitles,
      workTitle,
      mode: 'story'
    });
    
    const sceneResRaw = await fetchGeminiStory(scenePrompt);
    const parsed = extractJsonFromModelResponse(sceneResRaw);
    const normalized = normalizeSceneResult(parsed);
    const scenes = normalized.selected_scenes;
    
    log(`${scenes.length}개의 장면이 생성되었습니다.`);

    state.gameData.scenes = scenes.map(s => ({
      ...s,
      context: s.title,
      bg_keyword: s.image_data?.visual_narrative || s.title
    }));

    state.gameData = validateAndRepairGameData(state.gameData);
    await saveGameCache(cacheKey, state.gameData);

    completeStages();
    await postAiMessage("🎊 작가가 집필을 마쳤습니다! 모험을 떠날 준비가 되셨나요?");
    setTimeout(startGame, 1200);

  } catch (e) {
    console.error("Story Mode Error:", e);
    log('스토리 모드 생성 실패: ' + e.message, 'err');
    if (retryCount < 2) {
      log('재시도 중...', 'warn');
      return generate(retryCount + 1);
    }
  }
}

/**
 * [TEASER MODE] 기존 하이라이트 요약 생성 파이프라인
 */
async function generateTeaserMode({ processingText, cacheKey, retryCount }) {
  const workTitle = state.selectedGutenbergBook?.title || state.bookTitle || "";
  const chapterTitles = state.customStartingPoint ? [state.customStartingPoint.name] : ["시작 지점"];

  try {
    // 1단계: 엔티티 추출 (Teaser에서도 인물을 먼저 알아야 함)
    setStage(1);
    await postAiMessage("1단계: 작품의 핵심 인물을 빠르게 분석하고 있습니다...");
    
    const entityPrompt = buildEntityExtractionPrompt({ text: processingText.slice(0, 15000), workTitle });
    const entityResRaw = await fetchGeminiStory(entityPrompt);
    const entityData = extractJsonFromModelResponse(entityResRaw);
    const rawEntities = entityData.entities || [];

    // -- Interrupt Point 2: Entity Resolution --
    await postAiMessage(`${rawEntities.length}명의 인물을 찾았습니다. 티저 모드에 포함할 주인공들을 확인해주세요.`);
    const resolution = await waitForUserApproval({ idx: 1, type: 'ENTITY_RESOLVE' }, { entities: rawEntities });
    
    const resolvedEntities = resolution.entities;
    state.userDecisions.entityResolution.mergeGroups = resolution.mergeGroups;

    // 2단계: 비주얼 스타일 결정
    // -- Interrupt Point 3: Visual Style Selection --
    await postAiMessage("좋습니다! 어떤 화풍으로 인물들을 그려낼까요?");
    const chosenStyle = await waitForUserApproval({ idx: 2, type: 'STYLE_SELECT' }, {});
    state.userDecisions.visualStyle.profile = chosenStyle;

    // 3단계: 마스터 인물화 생성
    setStage(2);
    await postAiMessage("핵심 인물의 마스터 포트레이트를 생성합니다.");
    const majorChars = resolvedEntities.filter(e => ['person_major', 'person_minor'].includes(e.type));
    state.gameData = { characters: majorChars, scenes: [], metadata: { title: workTitle } };
    await ensureCharacterPortraits(state.gameData.characters);

    // 4단계: 생성 계획 확인
    // -- Interrupt Point 4: Plan Confirmation --
    await postAiMessage("티저 생성을 시작할 준비가 되었습니다.");
    const confirmed = await waitForUserApproval({ idx: 3, type: 'PLAN_CONFIRM' }, {
      sceneCount: 5,
      characterCount: state.gameData.characters.length
    });

    if (!confirmed) return;

    // 5단계: 티저 장면 생성
    await postAiMessage("✨ 가장 임팩트 있는 장면들로 요약 중입니다...");
    
    const prompt = buildScenePrompt({
      text: processingText.slice(0, 20000), 
      chapterTitles,
      workTitle,
      mode: 'teaser',
      entities: state.gameData.characters.map(c => ({ id: c.id, name: c.canonical_name || c.name, appearance: c.appearance }))
    });

    const rawResponse = await fetchGeminiStory(prompt);
    const parsed = extractJsonFromModelResponse(rawResponse);
    const normalized = normalizeSceneResult(parsed);
    
    state.gameData.scenes = normalized.selected_scenes.map((s, idx) => ({
      id: idx + 1,
      context: s.title,
      narrative: s.context_for_new_viewer,
      script: [
         ...(s.dialogue.opening_hook_line?.line ? [{ speaker: s.dialogue.opening_hook_line.speaker || 'narrator', text: s.dialogue.opening_hook_line.line }] : []),
         ...s.dialogue.core_dialogue_lines.map(l => ({ speaker: l.speaker || 'narrator', text: l.line })),
         ...(s.dialogue.closing_hook_line?.line ? [{ speaker: s.dialogue.closing_hook_line.speaker || 'narrator', text: s.dialogue.closing_hook_line.line }] : [])
      ],
      choices: s.choices || [],
      image_data: s.image_data,
      bg_keyword: s.image_data.prompt_seed_text || s.title
    }));

    state.gameData = validateAndRepairGameData(state.gameData);
    await saveGameCache(cacheKey, state.gameData);

    completeStages();
    await postAiMessage("🎊 티저 시뮬레이션이 준비되었습니다!");
    setTimeout(startGame, 1200);

  } catch (e) {
    log('오류: ' + e.message, 'err');
    if (retryCount < 2) return generate(retryCount + 1);
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
