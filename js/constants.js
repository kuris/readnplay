export const STAGE_TEXTS = ['책을 불러오는 중...', '텍스트를 분석하는 중...', 'AI가 게임을 생성하는 중...', '마지막 마무리 중...'];
export const STAGE_PROGRESS = [0, 30, 60, 90];

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
