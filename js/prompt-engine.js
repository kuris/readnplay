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

반드시 수행할 작업:
1. 이 챕터에서 영상/비주얼노벨용으로 좋은 장면 후보 ${Math.max(6, maxCandidates - 2)}~${maxCandidates}개를 찾는다.
2. 각 장면에 대해 처음 보는 사람도 이해할 수 있도록 짧은 context_for_new_viewer를 작성한다.
3. 각 장면에 대해 opening_hook_line, core_dialogue_lines, closing_hook_line을 만든다.
4. 상위 ${Math.min(4, maxSelectedScenes - 1)}~${maxSelectedScenes}개 장면만 최종 선택한다.
5. 최종 선택 장면마다 이미지 생성용 구조화 데이터를 만든다.

대사 작성 규칙:
- 설명문이 아니라 실제 인물이 말할 법한 짧은 대사로 작성한다.
- opening_hook_line은 장면 첫 줄로서 즉시 긴장감이나 궁금증을 만들어야 한다.
- core_dialogue_lines는 2~4줄로 작성하고, 감정 충돌이나 관계 변화가 드러나야 한다.
- closing_hook_line은 다음 장면이 궁금해지게 만들어야 한다.
- 각 인물의 말투가 최대한 겹치지 않게 한다.
- 짧고 강하게 작성한다. 장황한 설명을 피한다.
- "그는 놀랐다", "그녀는 화가 났다" 같은 서술형 문장을 대사로 쓰지 마라.

이미지 데이터 작성 규칙:
- 추상적 문학 표현보다 외형, 표정, 행동, 의상, 장소, 조명, 소품, 구도를 우선한다.
- ${styleHint} 스타일을 기본으로 상정한다.
- prompt_seed_text는 시각 정보 중심의 짧고 선명한 문장으로 작성한다.
- negative_prompt_seed_text에는 저품질 요소를 포함한다.
- "슬픈 분위기"처럼 추상적으로 끝내지 말고, 표정, 자세, 조명, 색감, 배경 요소로 번역하라.

출력은 반드시 아래 JSON 형식만 사용한다:

{
  "chapter_mode": "single",
  "scene_candidates": [
    {
      "title": "짧은 장면 제목",
      "summary": "장면 요약",
      "context_for_new_viewer": "이전 내용을 몰라도 이해되게 설명",
      "characters": [
        {"name": "인물1", "gender": "male|female", "appearance": "체격, 머리색, 의리 등 핵심 외형"},
        {"name": "인물2", "gender": "male|female", "appearance": "핵심 외형"}
      ],
      "location": "장소",
      "mood": "분위기",
      "visual_hook": "가장 강한 시각 요소",
      "emotion_score": 1,
      "thumbnail_score": 1,
      "dialogue_score": 1,
      "background_score": 1,
      "start_index": 0
    }
  ],
  "selected_scenes": [
    {
      "title": "선택된 장면 제목",
      "selection_reason": "왜 골랐는지",
      "best_use": "thumbnail | dialogue_cut | story_cut | atmosphere_cut",
      "context_for_new_viewer": "처음 보는 사람용 짧은 맥락",
      "choices": [
        {
          "text": "선택지 1 (액션/대사)",
          "character_effects": {"인물ID": 10},
          "outcome": "선택 후 이어질 짧은 반응"
        },
        {
          "text": "선택지 2",
          "character_effects": {"인물ID": -5},
          "outcome": "선택 후 반응"
        }
      ],
      "dialogue": {
        "opening_hook_line": {
          "speaker": "인물명",
          "line": "첫 줄 훅 대사"
        },
        "core_dialogue_lines": [
          {
            "speaker": "인물명",
            "line": "핵심 대사 1"
          },
          {
            "speaker": "인물명",
            "line": "핵심 대사 2"
          }
        ],
        "closing_hook_line": {
          "speaker": "인물명",
          "line": "다음 장면이 궁금해지는 마무리 대사"
        }
      },
      "image_data": {
        "core_moment": "핵심 순간",
        "character_focus": "인물의 성별(gender), 나이, 외형, 의상, 반드시 'Wide long shot' 또는 'Full body shot from a distance' 포함",
        "background_focus": "배경과 풍경 위주, 인물 얼굴보다 장소의 미학 강조",
        "lighting": "조명",
        "composition": "wide landscape long shot, full body from a distance",
        "style_hint": "${styleHint}",
        "prompt_seed_text": "짧고 시각적인 생성용 문장 (Wide angle scenic view)",
        "negative_prompt_seed_text": "low quality, blurry, bad hands, extra fingers, text, watermark"
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
다음 텍스트는 소설의 연속된 2~3개 챕터 묶음이다.

작품명: ${workTitle || "알 수 없음"}
챕터명: ${joinedTitles}

이 텍스트를 "독서 요약"이 아니라 "유튜브 스토리 영상 / 비주얼노벨 컷신 / 이미지 생성" 용도로 분석하라.

중요 전제:
- 사용자는 이 챕터 묶음 이전 내용을 모를 수 있다.
- 따라서 전체 흐름을 처음 보는 사람도 따라갈 수 있어야 한다.
- 문학적 중요도보다 시각적 임팩트, 감정 충돌, 관계 변화, 사건 진전, 장면 다양성, 썸네일 적합도를 우선하라.
- 비슷한 장면은 합치거나 제외하고, 이야기 진행에 필요한 대표 장면만 남긴다.
- 결과는 "연속 시청 가능한 장면 흐름"이 되도록 구성한다.

반드시 수행할 작업:
1. 전체 챕터 묶음의 핵심 흐름을 3~5줄로 요약한다.
2. 영상/비주얼노벨용 장면 후보 ${Math.max(8, maxCandidates - 2)}~${maxCandidates}개를 찾는다.
3. 후보 중에서 중복을 제거하고, 흐름상 중요한 대표 장면 ${Math.max(4, maxSelectedScenes - 1)}~${maxSelectedScenes}개를 최종 선택한다.
4. 최종 선택 장면은 도입 -> 갈등 심화 -> 전환 -> 여운/클리프행어 흐름이 가능하면 유지한다.
5. 각 최종 장면마다 context_for_new_viewer, opening_hook_line, core_dialogue_lines, closing_hook_line을 만든다.
6. 각 최종 장면마다 이미지 생성용 구조화 데이터를 만든다.

대사 작성 규칙:
- 설명문 대신 실제 컷신 대사처럼 짧고 강하게 작성한다.
- opening_hook_line은 장면 진입 순간 바로 몰입되게 만든다.
- core_dialogue_lines는 2~4줄로 제한하고, 관계 변화나 감정 충돌이 드러나게 한다.
- closing_hook_line은 다음 장면으로 이어지는 여운이나 긴장을 남긴다.
- 앞 장면과 뒤 장면의 정서 연결이 느껴지게 한다.
- "그는 놀랐다", "그녀는 화가 났다" 같은 서술형 문장을 대사로 쓰지 마라.

장면 선택 규칙:
- 첫 장면은 진입 장벽이 낮고 흥미를 끌어야 한다.
- 중간 장면은 갈등, 비밀, 감정 변화, 관계 변화를 보여야 한다.
- 마지막 장면은 다음 화를 보고 싶게 만들어야 한다.
- 배경/표정/행동/대사의 다양성을 확보한다.

이미지 데이터 작성 규칙:
- 인물 외형, 표정, 동작, 의상, 장소, 조명, 시대감, 소품, 구도를 우선한다.
- 추상적인 문학 표현은 시각 정보로 번역한다.
- ${styleHint} 스타일을 기본으로 상정한다.
- prompt_seed_text는 짧고 선명하게 작성한다.
- negative_prompt_seed_text에는 저품질 요소를 포함한다.

출력은 반드시 아래 JSON 형식만 사용한다:

{
  "chapter_mode": "multi",
  "overview": {
    "story_flow_summary": "2~3챕터 흐름 요약",
    "entry_context_for_new_viewer": "이전 내용을 모르는 사람용 전체 맥락",
    "recommended_arc": "intro -> conflict -> reveal -> cliffhanger"
  },
  "scene_candidates": [
    {
      "title": "짧은 장면 제목",
      "summary": "장면 요약",
      "chapter_reference": "chapter_1 | chapter_2 | chapter_3",
      "context_for_new_viewer": "처음 보는 사람도 이해할 수 있는 맥락",
      "characters": [
        {"name": "인물1", "gender": "male|female", "appearance": "외형 묘사"},
        {"name": "인물2", "gender": "male|female", "appearance": "외형 묘사"}
      ],
      "location": "장소",
      "mood": "분위기",
      "visual_hook": "가장 강한 시각 요소",
      "emotion_score": 1,
      "thumbnail_score": 1,
      "dialogue_score": 1,
      "background_score": 1,
      "story_progress_score": 1,
      "start_index": 0
    }
  ],
  "selected_scenes": [
    {
      "title": "선택된 장면 제목",
      "sequence_role": "intro | escalation | turning_point | aftermath | cliffhanger",
      "chapter_reference": "chapter_1 | chapter_2 | chapter_3",
      "selection_reason": "왜 골랐는지",
      "best_use": "thumbnail | dialogue_cut | story_cut | atmosphere_cut",
      "context_for_new_viewer": "처음 보는 사람용 짧은 맥락",
      "choices": [
        {
          "text": "선택지 내용",
          "character_effects": {"인물ID": 10},
          "outcome": "결과"
        }
      ],
      "dialogue": {
        "opening_hook_line": {
          "speaker": "인물명",
          "line": "첫 줄 훅 대사"
        },
        "core_dialogue_lines": [
          {
            "speaker": "인물명",
            "line": "핵심 대사 1"
          },
          {
            "speaker": "인물명",
            "line": "핵심 대사 2"
          }
        ],
        "closing_hook_line": {
          "speaker": "인물명",
          "line": "다음 장면으로 이어지는 마무리 대사"
        }
      },
      "image_data": {
        "core_moment": "핵심 순간",
        "character_focus": "인물의 성별(gender), 나이, 외형 구체적 묘사 (반드시 'Long shot' 또는 'Full body' 포함)",
        "background_focus": "풍경과 장소 중심의 묘사, 대서사적인 배경 강조",
        "lighting": "조명",
        "composition": "wide landscape long shot, full body portrait from a distance",
        "style_hint": "${styleHint}",
        "prompt_seed_text": "시각적 생성 문장 (Wide angle scenery)",
        "negative_prompt_seed_text": "low quality, blurry, bad hands, extra fingers, text, watermark"
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
 * 챕터 수에 따라 적절한 장면 생성 프롬프트를 반환합니다.
 */
export function buildScenePrompt({
  text,
  chapterTitles = [],
  workTitle = "",
  maxCandidates,
  maxSelectedScenes,
  styleHint = "anime visual novel illustration",
}) {
  const mode = chapterLabel(chapterTitles.length || 1);

  if (mode === "single") {
    return buildSingleChapterScenePrompt({
      text,
      chapterTitle: chapterTitles[0] || "",
      workTitle,
      maxCandidates: maxCandidates ?? 8,
      maxSelectedScenes: maxSelectedScenes ?? 4,
      styleHint,
    });
  }

  return buildMultiChapterScenePrompt({
    text,
    chapterTitles,
    workTitle,
    maxCandidates: maxCandidates ?? 12,
    maxSelectedScenes: maxSelectedScenes ?? 6,
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

  const finalStr = candidate.slice(0, end + 1).trim();

  try {
    return JSON.parse(finalStr);
  } catch (err) {
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
    selected_scenes: Array.isArray(result.selected_scenes) ? result.selected_scenes : [],
  };

  normalized.scene_candidates = normalized.scene_candidates.map((scene, index) => ({
    title: scene.title || `scene_candidate_${index + 1}`,
    summary: scene.summary || "",
    context_for_new_viewer: scene.context_for_new_viewer || "",
    characters: Array.isArray(scene.characters) ? scene.characters : [],
    location: scene.location || "",
    mood: scene.mood || "",
    visual_hook: scene.visual_hook || "",
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
      core_moment: scene?.image_data?.core_moment || "",
      character_focus: scene?.image_data?.character_focus || "",
      background_focus: scene?.image_data?.background_focus || "",
      lighting: scene?.image_data?.lighting || "",
      composition: scene?.image_data?.composition || "",
      style_hint: scene?.image_data?.style_hint || "anime visual novel illustration",
      prompt_seed_text: scene?.image_data?.prompt_seed_text || "",
      negative_prompt_seed_text:
        scene?.image_data?.negative_prompt_seed_text ||
        "low quality, blurry, bad hands, extra fingers, text, watermark",
    },
  }));

  return normalized;
}

/**
 * 이미지 생성 엔진(Draw Things/SD)용 프롬프트를 구성합니다.
 */
export function buildDrawThingsPrompt(imageData = {}) {
  const parts = [
    imageData.style_hint,
    imageData.character_focus,
    imageData.background_focus,
    imageData.lighting,
    imageData.composition,
    imageData.core_moment,
    imageData.prompt_seed_text,
  ].filter(Boolean);

  return {
    prompt: parts.join(", "),
    negative_prompt:
      imageData.negative_prompt_seed_text ||
      "low quality, blurry, bad hands, extra fingers, text, watermark",
  };
}
