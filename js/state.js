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
  imageGenerator: 'imagen', // 'imagen' or 'sd_local'
  sdUrl: 'https://7314-175-121-178-47.ngrok-free.app',
  imageTaskQueue: Promise.resolve() // 이미지 생성 큐
};
