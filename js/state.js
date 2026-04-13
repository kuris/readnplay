// 글로벌 상태 관리 객체
export const state = {
  gameData: null,
  curIdx: 0,
  score: 0,
  selectedMode: 'adventure',
  selectedLang: 'ko',
  activeLang: 'ko',
  selectedLength: 'medium',
  epubText: '',
  bookTitle: '',
  selectedSource: 'upload',
  selectedGutenbergBook: null,
  gameStartTime: 0,
  characterRelationships: {},
  cacheStrategy: 'use', // 'use' or 'refresh'
  imageGenerator: 'sd_local', // 'imagen' or 'sd_local' (로컬 워커 기본 사용하게 변경)
  sdUrl: 'https://7314-175-121-178-47.ngrok-free.app',
  imageTaskQueue: Promise.resolve(), // 이미지 생성 큐
  // --- NEW ---
  customStartingPoint: null, // 시리즈/커스텀 모드 선택 시작 지점
  customEndPoint: null,      // 시리즈/커스텀 모드 선택 종료 지점
  isGalleryMode: false,
  gutenbergSearchResults: [],
  gutenbergSearchPage: 1,
  // --- READER NEW ---
  isSourceVisible: false,    // 원문 보기 활성화 여부
  activeSidePanel: null,    // 현재 열린 사이드 패널 (info, characters, timeline 등)
  // --- WORKFLOW NEW ---
  workflow: {
    stageIdx: 0, 
    isProcessing: false,
    results: {
      book: null,
      config: null,
      analysis: null,
      entities: null,
      style: null,
      plan: null
    }
  },
  userDecisions: {
    generationMode: null, // teaser, story, hybrid
    entityResolution: {
      mergeGroups: [], // list of lists of character IDs
      excludedEntities: [],
      typeOverrides: {} // { entityId: 'location' }
    },
    visualStyle: {
      profile: 'semi_realistic_anime',
      lighting: 'cinematic'
    },
    imagePlan: {
      portraitScope: 'major_only', // 'all', 'major_only', 'none'
      generateScenes: true
    }
  }
};
