import { repairJson } from "./utils.js";
import { GLOBAL_STYLE_PROFILE, ENTITY_TYPES } from "./constants.js";

/**
 * 문자열에서 유해한 문자를 제거하고 정리합니다.
 */
function sanitizeText(input = "") {
  return String(input)
    .replace(/\u0000/g, "")
    .trim();
}

/**
 * 챕터 수에 따른 모드 라벨을 반환합니다.
 */
function chapterLabel(count) {
  if (count <= 1) return "single";
  return "multi";
}

/**
 * 단일 챕터용 시네마틱 프롬프트를 생성합니다.
 */
export function buildSingleChapterScenePrompt({
  text,
  chapterTitle = "",
  workTitle = "",
  maxCandidates = 8,
  maxSelectedScenes = 4,
  styleHint = "anime visual novel illustration",
}) {
  const cleanText = sanitizeText(text);

  return `
다음 텍스트는 소설의 특정 한 챕터이다.

작품명: ${workTitle || "알 수 없음"}
챕터명: ${chapterTitle || "알 수 없음"}

이 텍스트를 "독서 요약"이 아니라 "유튜브 스토리 영상 / 비주얼노벨 컷신 / 이미지 생성" 용도로 분석하라.

중요 전제:
- 사용자는 이전 챕터 내용을 모를 수 있다.
- 따라서 각 장면은 맥락이 부족해도 이해 가능해야 한다.
- 문학적 중요도보다 시각적 임팩트, 감정 충돌, 관계 변화, 긴장감, 대사 힘, 썸네일 적합도를 우선하라.
- 설명 위주의 장면, 반복 장면, 내면 독백만 길게 이어지는 장면은 제외하라.
- 장면은 서로 역할이 겹치지 않게 고른다.

유의사항 (CRITICAL):
1. 모든 장면 제목(title), 인물 대사(dialogue), 선택지(choices), 스토리 요약(summary, overview)은 **반드시 한국어(Korean)**로 작성한다.
2. 이미지 생성을 위한 필드(image_data 하위 및 characters의 appearance)만 **반드시 영어(English)**로 작성한다.
3. **단순한 인물 포스터가 아닌, 이야기의 한 장면(Scene)을 그려라.**
4. 장면의 우선순위: **순간(Moment) > 인물관계(Relationship) > 장소/배경(Setting) > 구도(Composition) > 인물(Character)**.

대사 작성 및 시각화 규칙:
- 대사 자체를 이미지에 그리는 것이 아니라, 그 대사가 발생하는 **순간의 감정과 관계를 시각적으로 표현**하라.
- 배경 설명 시 추상적인 조명보다는 시대감과 장소의 특정 소품(court bench, witness stand, gothic details 등)을 구체적으로 영어로 묘사하라.

장면 구도 규칙:
- **중앙 배치 단독 상반신 초상화 구도를 지양하라.** (전체 시퀀스 중 최대 1개만 허용)
- shot_type을 다양화하라: wide_establishing, over_the_shoulder, dynamic_action, closeup_reaction 등.

출력은 반드시 아래 JSON 형식만 사용한다:

{
  "chapter_mode": "single",
  "scene_candidates": [
    {
      "title": "장면 제목 (한국어)",
      "summary": "장면 요약 (한국어)",
      "context_for_new_viewer": "맥락 설명 (한국어)",
      "characters": [
        {"name": "인물1", "gender": "male|female", "appearance": "Detailed English description"}
      ],
      "visual_narrative": "Narrative situation (English only)",
      "emotion_score": 1,
      "thumbnail_score": 1,
      "start_index": 0
    }
  ],
  "selected_scenes": [
    {
      "title": "장면 제목 (한국어)",
      "selection_reason": "선택 근거 (한국어)",
      "best_use": "wide_establishing | confrontation | closeup_emotion | symbolic_detail",
      "choices": [
        { "text": "선택지 한국어", "character_effects": {"인물ID": 10}, "outcome": "결과 한국어" }
      ],
      "dialogue": {
        "opening_hook_line": { "speaker": "인물명", "line": "한국어 대사" },
        "core_dialogue_lines": [ { "speaker": "인물명", "line": "한국어 대사" } ],
        "closing_hook_line": { "speaker": "인물명", "line": "한국어 대사" }
      },
      "image_data": {
        "shot_type": "establishing_wide | medium_two_shot | over_the_shoulder | closeup_reaction",
        "camera_angle": "low angle | eye level | high angle",
        "visual_narrative": "One-line narrative context (English)",
        "core_moment": "Narrative focus (English)",
        "character_focus": "Action and gaze (English, no 'centered portrait')",
        "background_focus": "Specific narrative props and setting (English)",
        "must_show": ["narrative prop A", "atmospheric detail B"],
        "must_avoid": ["boring centered portrait", "generic character card"],
        "lighting": "cinematic lighting style (English)",
        "style_hint": "${styleHint}",
        "prompt_seed_text": "Detailed cinematic prompt (English)",
        "negative_prompt_seed_text": "centered framing, single character portrait, flat lighting, text"
      }
    }
  ]
}

JSON 외 텍스트는 절대 출력하지 마라.

텍스트:
"""${cleanText}"""
`.trim();
}

/**
 * 텍스트에서 캐릭터, 장소, 사물 등 엔티티를 추출하고 canonicalize합니다.
 */
export function buildEntityExtractionPrompt({ text, workTitle = "" }) {
  const cleanText = sanitizeText(text);

  return `
다음 텍스트는 소설의 일부이다. 이 텍스트에서 등장인물, 별칭, 집단, 장소, 중요한 사물을 추출하라.

작품명: ${workTitle || "알 수 없음"}

요구사항:
1. **Canonicalization (표준화)**: 
   - 동일 인물이 별명(예: "주인공", "그"), 직함(예: "김 중위", "소대장"), 실명(예: "김유나")으로 불릴 경우 이를 하나의 대표 이름(canonical_name)으로 통합하라.
   - aliases 배열에 모든 알려진 호칭을 포함하라.
2. **Entity Classification**:
   - type을 다음 중 하나로 분류하라: [${Object.values(ENTITY_TYPES).join(', ')}]
   - person_major: 핵심 주인공 및 주연
   - person_minor: 조연 및 단역
   - group: 소대, 부대, 팀 등 집단
   - location: 배경이 되는 장소
   - object: 중요한 장비나 사물
3. **Importance Ranking**:
   - importance를 A(핵심), B(전개에 필요), C(배경/단역) 중 하나로 지정하라.
4. **Visual Signature**:
   - 인물의 경우 외모 특징(appearance)을 **영문(English)**으로 상세히 기술하라.
   - **GLOBAL STYLE**: 모든 이미지 관련 묘사는 "${GLOBAL_STYLE_PROFILE}" 스타일을 염두에 두라.

응답 형식 (JSON만):
{
  "entities": [
    {
      "id": "char_001",
      "canonical_name": "대표 이름 (한국어)",
      "aliases": ["이름1", "이름2"],
      "type": "person_major",
      "importance": "A",
      "gender": "male|female|unknown",
      "role_summary": "서사 내 핵심 역할 (예: 복수를 꿈꾸는 퇴역 장교)",
      "relationship_tags": ["주인공의 스승", "비밀의 수호자"],
      "appearance": "Detailed English description of face, hair, eyes, build, clothing style",
      "summary": "엔티티 설명 (한국어)"
    }
  ]
}

텍스트:
"""${cleanText}"""
`.trim();
}

/**
 * 장편의 호흡을 유지하는 "Story Mode" 장면 분해 프롬프트를 생성합니다.
 */
export function buildStoryModeScenePrompt({
  text,
  entities = [],
  chapterTitles = [],
  workTitle = "",
  minScenes = 10,
  maxScenes = 20,
}) {
  const cleanText = sanitizeText(text);
  const entitiesJson = JSON.stringify(entities, null, 2);

  return `
다음 텍스트를 장편 비주얼 노벨의 "Story Mode"로 변환하라. 
이 모드는 요약이 목적이 아니라, 원작의 호흡과 세부 감정을 최대한 보존하는 것이 목적이다.

작품명: ${workTitle || "알 수 없음"}
대상 챕터: ${chapterTitles.join(", ")}

사전에 정의된 엔티티 목록 (반드시 이 ID들을 사용하라):
${entitiesJson}

요구사항:
1. **장면 밀도 (Scene Density)**:
   - 전체 텍스트를 최소 ${minScenes}개에서 최대 ${maxScenes}개의 장면으로 촘촘하게 분해하라.
   - 사건 전개, 장소 이동, 감정의 변화가 있을 때마다 장면을 분리하라.
2. **연속성 (Continuity)**:
   - script 내의 speaker는 반드시 사전 정의된 엔티티 ID를 사용하라.
   - 인물 이름 뒤에 (학생 시절), (군인 시절) 등 시기를 붙여야 한다면 ID는 유지하되 display_name으로 처리하라.
3. **내레이션 보존**:
   - 대사가 없는 구간도 내레이션 블록으로 충분히 보존하여 "읽는 맛"을 유지하라.
4. **이미지 연출**:
   - image_data의 style_hint는 반드시 "${GLOBAL_STYLE_PROFILE}"을 포함하라.
   - 단순 초상화가 아닌, 해당 순간의 "결정적 컷"을 묘사하라.

응답 형식 (JSON):
{
  "scenes": [
    {
      "id": 1,
      "title": "장면 제목",
      "chapter_range": "${chapterTitles[0]}",
      "setting": "구체적인 시간과 장소 (예: 18세기 어느 겨울 밤, 런던의 부둣가)",
      "participants": ["char_001", "char_002"],
      "time_context": "과거 회상 | 현재 진행 | 미래 암시",
      "emotion_tags": ["긴장감", "슬픔", "비장함"],
      "narrative_function": "major turning point | character intro | foreshadowing",
      "source_excerpt": "장면의 근거가 되는 원작의 핵심 문장 2-3줄 (반드시 원문 그대로 보존)",
      "narrative": "장면의 분위기와 상황 설명 (독자가 읽기 좋게 각색)",
      "script": [
        { "speaker": "char_id", "text": "대사", "display_name": "표시될 이름" }
      ],
      "choices": [
        { "type": "exploration", "text": "배경 정보 보기", "outcome": "배경 설명" },
        { "type": "progression", "text": "다음 장면으로", "outcome": "진행" }
      ],
      "related_scene_ids": [2, 5],
      "image_data": {
        "shot_type": "...",
        "visual_narrative": "...",
        "character_focus": "...",
        "background_focus": "...",
        "style_hint": "${GLOBAL_STYLE_PROFILE}"
      }
    }
  ]
}

텍스트:
"""${cleanText}"""
`.trim();
}

/**
 * 다중 챕터용 시네마틱 프롬프트를 생성합니다.
 */
export function buildMultiChapterScenePrompt({
  text,
  chapterTitles = [],
  workTitle = "",
  maxCandidates = 12,
  maxSelectedScenes = 6,
  styleHint = "anime visual novel illustration",
}) {
  const cleanText = sanitizeText(text);
  const joinedTitles = chapterTitles.length
    ? chapterTitles.join(", ")
    : "알 수 없음";

  return `
장면 선택 및 연출 규칙 (CRITICAL):
- 첫 장면은 공간적 배경을 보여주는 **wide_establishing** 또는 강렬한 **visual_hook**을 포함하라.
- **구도 반복 금지**: 한 시퀀스(장면 묶음) 내에서 중앙 정면 상반신 초상화 구도는 최대 1회로 제한한다.
- **시각적 번역**: 대사를 직접 그리는 것이 아니라, 대사가 발생하는 **감정, 인물 간 거리, 행동, 공간적 맥락**을 영어로 번역하여 image_data에 담아라.
- 배경은 장소의 시대감과 서사적 소품(gothic bench, witness stand, stained glass 등)을 포함한 서사형 배경으로 작성하라.
- 결과물의 모든 장면 제목(title)과 요약문은 **반드시 한국어**로 작성한다.

언어 규칙 (CRITICAL):
- 모든 대사(dialogue), 선택지(choices), 스토리 요약(summary/overview), 장면 제목(title/summary)은 **반드시 한국어(Korean)**로 작성한다.
- 오직 이미지 데이터(image_data 내 모든 필드 및 characters의 appearance)만 이미지 생성 모델을 위해 **영어(English)**로 작성한다.

이미지 데이터 작성 규칙:
- 우선순위: **결정적 순간(Moment) > 인물관계(Relationship) > 장소/배경(Setting) > 구도(Composition) > 인물(Character)**.
- shot_type과 camera_angle을 다양하게 활용하여 장면의 다이내믹함을 확보하라.
- visual_narrative 필드에 장면의 핵심 서사적 상황을 짧은 영어 문구로 요약하라.

출력은 반드시 아래 JSON 형식만 사용한다:

{
  "chapter_mode": "multi",
  "overview": {
    "story_flow_summary": "2~3챕터 흐름 요약 (한국어)",
    "entry_context_for_new_viewer": "맥락 설명 (한국어)",
    "recommended_arc": "intro -> conflict -> reveal -> cliffhanger"
  },
  "scene_candidates": [
    {
      "title": "장면 제목 (한국어)",
      "summary": "장면 요약 (한국어)",
      "chapter_reference": "chapter_1 | chapter_2",
      "characters": [
        {"name": "인물1", "gender": "male|female", "appearance": "English description"}
      ],
      "visual_narrative": "Narrative situation (English only)",
      "emotion_score": 1,
      "thumbnail_score": 1,
      "start_index": 0
    }
  ],
  "selected_scenes": [
    {
      "title": "장면 제목 (한국어)",
      "sequence_role": "intro | escalation | turning_point | aftermath | cliffhanger",
      "selection_reason": "선택 근거 (한국어)",
      "best_use": "establishing_wide | confrontation | closeup_emotion | symbolic_detail",
      "choices": [
        { "text": "선택지 한국어", "character_effects": {"인물ID": 10}, "outcome": "결과 한국어" }
      ],
      "dialogue": {
        "opening_hook_line": { "speaker": "인물명", "line": "한국어 대사" },
        "core_dialogue_lines": [ { "speaker": "인물명", "line": "한국어 대사" } ],
        "closing_hook_line": { "speaker": "인물명", "line": "한국어 대사" }
      },
      "image_data": {
        "shot_type": "wide_establishing | over_the_shoulder | two_shot_interaction | extreme_closeup_eye",
        "camera_angle": "low angle | bird's eye view | eye level | Dutch angle",
        "visual_narrative": "One-line narrative scene summary (English)",
        "core_moment": "Narrative focus (English)",
        "character_focus": "Pose, action, and gaze focus (English, no 'centered portrait')",
        "background_focus": "Specific narrative props and setting (English)",
        "must_show": ["narrative prop A", "atmospheric detail B"],
        "must_avoid": ["boring centered portrait", "generic character card"],
        "lighting": "moody lighting, high contrast, cinematic shadow",
        "style_hint": "${GLOBAL_STYLE_PROFILE}",
        "prompt_seed_text": "Cinematic visual narrative prompt (English)",
        "negative_prompt_seed_text": "centered framing, single character portrait, flat lighting, text, logo"
      }
    }
  ]
}

JSON 외 텍스트는 절대 출력하지 마라.

텍스트:
"""${cleanText}"""
`.trim();
}

/**
 * 설정에 따라 적절한 장면 생성 프롬프트를 반환합니다.
 */
export function buildScenePrompt({
  text,
  entities = [],
  chapterTitles = [],
  workTitle = "",
  mode = 'teaser', // 'teaser' or 'story'
  styleHint = GLOBAL_STYLE_PROFILE,
}) {
  if (mode === 'story') {
    return buildStoryModeScenePrompt({
      text,
      entities,
      chapterTitles,
      workTitle,
      minScenes: text.length > 50000 ? 15 : 10,
      maxScenes: text.length > 50000 ? 25 : 15,
    });
  }

  const chapterCount = chapterTitles.length || 1;
  if (chapterCount <= 1) {
    return buildSingleChapterScenePrompt({
      text,
      chapterTitle: chapterTitles[0] || "",
      workTitle,
      styleHint,
    });
  }

  return buildMultiChapterScenePrompt({
    text,
    chapterTitles,
    workTitle,
    styleHint,
  });
}

/**
 * 모델 응답에서 JSON 부분을 추출합니다.
 */
export function extractJsonFromModelResponse(raw = "") {
  const text = String(raw || "").trim();

  if (!text) {
    throw new Error("Empty model response");
  }

  // ```json ... ``` 블록 우선
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (e) {
        // 무시하고 아래 일반 추출 시도
    }
  }

  // 일반 JSON 객체/배열 추출
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let start = -1;

  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);

  if (start === -1) {
    throw new Error("No JSON found in model response");
  }

  const candidate = text.slice(start);
  // 마지막 괄호 찾기
  const lastBrace = candidate.lastIndexOf("}");
  const lastBracket = candidate.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (end === -1) {
    throw new Error("Incomplete JSON in model response");
  }

  const cleanedStr = candidate.slice(0, end + 1).trim();
  const repaired = repairJson(cleanedStr);

  try {
    return JSON.parse(repaired);
  } catch (err) {
    console.error("JSON Parsing Failed after repair:", repaired);
    throw new Error(`Failed to parse model response JSON: ${err.message}`);
  }
}

/**
 * 장면 생성 결과를 표준화된 스킴으로 정규화합니다.
 */
export function normalizeSceneResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Invalid result object");
  }

  const normalized = {
    chapter_mode: result.chapter_mode || "single",
    overview: result.overview || null,
    scene_candidates: Array.isArray(result.scene_candidates) ? result.scene_candidates : [],
    selected_scenes: Array.isArray(result.selected_scenes) ? result.selected_scenes : (Array.isArray(result.scenes) ? result.scenes : []),
  };

  normalized.scene_candidates = normalized.scene_candidates.map((scene, index) => ({
    title: scene.title || `scene_candidate_${index + 1}`,
    summary: scene.summary || "",
    context_for_new_viewer: scene.context_for_new_viewer || "",
    characters: Array.isArray(scene.characters) ? scene.characters : [],
    location: scene.location || "",
    mood: scene.mood || "",
    visual_narrative: scene.visual_narrative || "",
    emotion_score: Number(scene.emotion_score || 0),
    thumbnail_score: Number(scene.thumbnail_score || 0),
    dialogue_score: Number(scene.dialogue_score || 0),
    background_score: Number(scene.background_score || 0),
    story_progress_score: Number(scene.story_progress_score || 0),
    start_index: Number(scene.start_index || 0),
    chapter_reference: scene.chapter_reference || null,
  }));

  normalized.selected_scenes = normalized.selected_scenes.map((scene, index) => ({
    title: scene.title || `selected_scene_${index + 1}`,
    sequence_role: scene.sequence_role || null,
    chapter_reference: scene.chapter_reference || null,
    selection_reason: scene.selection_reason || "",
    best_use: scene.best_use || "story_cut",
    visual_narrative: scene.visual_narrative || "",
    context_for_new_viewer: scene.context_for_new_viewer || "",
    choices: Array.isArray(scene.choices)
      ? scene.choices.map((c) => ({
          text: c.text || "",
          character_effects: c.character_effects || c.impact || {},
          outcome: c.outcome || c.result_narrative || "",
        }))
      : [],
    dialogue: {
      opening_hook_line: {
        speaker: scene?.dialogue?.opening_hook_line?.speaker || "",
        line: scene?.dialogue?.opening_hook_line?.line || "",
      },
      core_dialogue_lines: Array.isArray(scene?.dialogue?.core_dialogue_lines)
        ? scene.dialogue.core_dialogue_lines.map((line) => ({
            speaker: line?.speaker || "",
            line: line?.line || "",
          }))
        : [],
      closing_hook_line: {
        speaker: scene?.dialogue?.closing_hook_line?.speaker || "",
        line: scene?.dialogue?.closing_hook_line?.line || "",
      },
    },
    image_data: {
      shot_type: scene?.image_data?.shot_type || "",
      camera_angle: scene?.image_data?.camera_angle || "",
      visual_narrative: scene?.image_data?.visual_narrative || "",
      core_moment: scene?.image_data?.core_moment || "",
      character_focus: scene?.image_data?.character_focus || "",
      background_focus: scene?.image_data?.background_focus || "",
      must_show: Array.isArray(scene?.image_data?.must_show) ? scene.image_data.must_show : [],
      must_avoid: Array.isArray(scene?.image_data?.must_avoid) ? scene.image_data.must_avoid : [],
      lighting: scene?.image_data?.lighting || "",
      composition: scene?.image_data?.composition || "",
      style_hint: scene?.image_data?.style_hint || "anime visual novel illustration",
      prompt_seed_text: scene?.image_data?.prompt_seed_text || "",
      negative_prompt_seed_text:
        scene?.image_data?.negative_prompt_seed_text ||
        "low quality, blurry, bad hands, extra fingers, text, watermark",
    },
    // --- READER METADATA ---
    setting: scene.setting || "",
    participants: Array.isArray(scene.participants) ? scene.participants : [],
    time_context: scene.time_context || "",
    emotion_tags: Array.isArray(scene.emotion_tags) ? scene.emotion_tags : [],
    narrative_function: scene.narrative_function || "",
    source_excerpt: scene.source_excerpt || scene.source_span || "",
    related_scene_ids: Array.isArray(scene.related_scene_ids) ? scene.related_scene_ids : [],
  }));

  return normalized;
}

/**
 * 이미지 생성 엔진(Draw Things/SD)용 프롬프트를 구성합니다.
 * @param {Object} imageData 이미지 관련 데이터
 * @param {'backdrop'|'portrait'} mode 생성 모드
 */
export function buildDrawThingsPrompt(imageData = {}, mode = 'portrait') {
  if (mode === 'backdrop') {
    // 🏷 배경 전용 모드: 인물 관련 묘사를 완전히 제외
    const bgParts = [
      imageData.style_hint,
      imageData.background_focus,
      imageData.lighting,
      "cinematic wide shot",
      "landscape scenery focus",
      "(strictly NO people, NO humans, NO characters, empty scenery:1.5)"
    ].filter(Boolean);

    return {
      prompt: bgParts.join(", "),
      negative_prompt: "(human, people, person, character, man, woman:1.5), " + 
        (imageData.negative_prompt_seed_text || "low quality, blurry, text, watermark")
    };
  }

  // 👤 인물/장면 통합 모드 ('scene' 또는 'portrait')
  const parts = [
    imageData.style_hint,
    imageData.shot_type,
    imageData.camera_angle,
    imageData.visual_narrative,
    imageData.character_focus,
    imageData.background_focus,
    imageData.core_moment,
    imageData.lighting,
    imageData.must_show ? imageData.must_show.join(", ") : null,
    imageData.composition,
    imageData.prompt_seed_text
  ].filter(Boolean);

  let neg = imageData.negative_prompt_seed_text || 
    "(text, letters, words, logo, signature, watermark:1.5), low quality, blurry, bad anatomy, bad hands, distorted face";
  
  if (imageData.must_avoid && imageData.must_avoid.length > 0) {
    neg = imageData.must_avoid.join(", ") + ", " + neg;
  }

  return {
    prompt: parts.join(", "),
    negative_prompt: neg
  };
}
