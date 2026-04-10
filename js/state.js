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
  imageTaskQueue: Promise.resolve() // 이미지 생성 큐
};
