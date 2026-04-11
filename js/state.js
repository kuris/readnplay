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
  isGalleryMode: false
};
