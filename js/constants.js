export const STAGE_TEXTS = ['책을 불러오는 중...', '텍스트를 분석하는 중...', 'AI가 게임을 생성하는 중...', '마지막 마무리 중...'];
export const STAGE_PROGRESS = [0, 30, 60, 90];

export const WORKFLOW_STAGES = {
  BOOK_SELECT: { idx: 0, label: '도서 선택', icon: '📖' },
  CONFIG_SELECT: { idx: 1, label: '환경 설정', icon: '⚙️' },
  PRE_ANALYSIS: { idx: 2, label: '작품 분석', icon: '🔍' },
  ENTITY_RESOLUTION: { idx: 3, label: '인물 정제', icon: '👥' },
  STYLE_SELECTION: { idx: 4, label: '화풍 결정', icon: '🎨' },
  PLAN_CONFIRMATION: { idx: 5, label: '확인 및 시작', icon: '✨' }
};

export const GUTENBERG_API = 'https://gutendex.com/books/';
export const GUTENBERG_MIRROR = 'https://www.gutenberg.org/files/';

export const FEATURED_BOOKS = [
  { id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen', lang: 'en', category: 'romance' },
  { id: 84, title: 'Frankenstein', author: 'Mary Shelley', lang: 'en', category: 'horror' },
  { id: 2701, title: 'Moby Dick', author: 'Herman Melville', lang: 'en', category: 'adventure' },
  { id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', lang: 'en', category: 'mystery' },
  { id: 11, title: 'Alice\'s Adventures in Wonderland', author: 'Lewis Carroll', lang: 'en', category: 'fantasy' },
  { id: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', lang: 'en', category: 'classic' },
  { id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens', lang: 'en', category: 'historical' },
  { id: 1952, title: 'The Yellow Wallpaper', author: 'Charlotte Perkins Gilman', lang: 'en', category: 'short' },
  { id: 244, title: 'A Study in Scarlet', author: 'Arthur Conan Doyle', lang: 'en', category: 'mystery' },
  { id: 46, title: 'A Christmas Carol', author: 'Charles Dickens', lang: 'en', category: 'short' }
];

export const GB_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

export const BOOK_LIST_API = '/api/classic-books';

// 🎨 전역 이미지 스타일 가이드 (일관성 유지)
export const STYLE_PROFILES = {
  semi_realistic_anime: "semi-realistic anime, cinematic lighting, clean lineart, muted realistic colors, consistent facial proportions, no exaggerated anime expressions, high-quality digital illustration, masterpiece, detailed atmosphere",
  webtoon_korean: "modern korean webtoon style, high contrast, vibrant cinematic lighting, sharp lineart, professional digital coloring, manhwa aesthetics, high quality",
  classic_watercolor: "classic watercolor painting, soft edges, paper texture, traditional book illustration, delicate colors, artistic, dreamy atmosphere",
  cyberpunk_noir: "cyberpunk noir style, neon lighting, heavy shadows, high contrast, futuristic city atmosphere, rain, cinematic fog, sharp details"
};

export const GLOBAL_STYLE_PROFILE = STYLE_PROFILES.semi_realistic_anime;

// 🎭 엔티티 타입 분류
export const ENTITY_TYPES = {
  MAJOR: 'person_major',
  MINOR: 'person_minor',
  GROUP: 'group',
  LOCATION: 'location',
  OBJECT: 'object',
  ALIAS: 'alias',
  UNKNOWN: 'unknown'
};
