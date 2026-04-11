import { state } from './state.js';
import { $, log } from './utils.js';
import { GUTENBERG_API, FEATURED_BOOKS, GB_CACHE_TTL, BOOK_LIST_API } from './constants.js';

/**
 * 추천 도서 목록을 렌더링합니다.
 */
export function renderFeaturedBooks() {
  const grid = $('gb-books-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  // 캐시된 도서 목록 확인
  const cached = localStorage.getItem('featured_books_data');
  const books = cached ? JSON.parse(cached).books : FEATURED_BOOKS;
  
  renderBookList(books, grid);
}

/**
 * 서버에서 최신 도서 목록을 가져와 동기화합니다.
 */
export async function refreshFeaturedBooks(force = false) {
  try {
    const res = await fetch(BOOK_LIST_API);
    if (!res.ok) throw new Error('목록을 가져오지 못했습니다.');
    
    const data = await res.json();
    const cached = localStorage.getItem('featured_books_data');
    const cachedData = cached ? JSON.parse(cached) : null;
    
    // 버전이 다르거나 강제 갱신인 경우에만 업데이트
    if (force || !cachedData || cachedData.version !== data.version) {
      log('고전 도서 목록 업데이트 중...');
      localStorage.setItem('featured_books_data', JSON.stringify(data));
      
      // 현재 "추천" 카테고리가 떠있다면 즉시 재렌더링
      const activeCat = document.querySelector('.gb-cat-btn.active');
      if (activeCat && activeCat.dataset.cat === 'featured') {
        renderFeaturedBooks();
      }
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Book list refresh failed:', e);
    return false;
  }
}

/**
 * 도서 카드를 생성하고 그리드에 추가합니다.
 */
export function renderBookList(books, grid) {
  const INITIAL_BOOK_COUNT = 4;
  const initial = books.slice(0, INITIAL_BOOK_COUNT);
  const rest = books.slice(INITIAL_BOOK_COUNT);
  
  initial.forEach(book => grid.appendChild(createBookCard(book)));
  
  if (rest.length > 0) {
    const moreBtn = document.createElement('div');
    moreBtn.style.cssText = 'grid-column:1/-1;';
    moreBtn.innerHTML = `<button class="btn-ghost" style="width:100%;padding:10px;border-style:dashed;">┼ ${rest.length}권 더 보기</button>`;
    moreBtn.querySelector('button').addEventListener('click', () => {
      moreBtn.remove();
      rest.forEach(book => grid.appendChild(createBookCard(book)));
    });
    grid.appendChild(moreBtn);
  }
}

/**
 * 개별 도서 카드를 생성합니다.
 */
function createBookCard(book) {
  const card = document.createElement('div');
  card.className = 'gb-book-card';
  card.innerHTML = `
    <div class="gbc-title">${book.title}</div>
    <div class="gbc-author">by ${book.author}</div>
    <div class="gbc-meta">
      <span class="gbc-tag">${book.category || 'classic'}</span>
      ${book.lang === 'en' ? '<span class="gbc-tag">🇬🇧 English</span>' : ''}
    </div>
  `;
  card.addEventListener('click', () => {
    document.querySelectorAll('.gb-book-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.selectedGutenbergBook = book;
    state.bookTitle = book.title;
    // 전역 체크 함수 호출 필요 (main.js에서 관리 예정)
    if (window.checkReady) window.checkReady();
  });
  return card;
}

/**
 * 검색 결과를 캐시에서 가져옵니다.
 */
function getSearchCache(query) {
  try {
    const raw = localStorage.getItem('gb_search_' + query);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > GB_CACHE_TTL) { 
      localStorage.removeItem('gb_search_' + query); 
      return null; 
    }
    return data;
  } catch { return null; }
}

/**
 * 검색 결과를 캐시에 저장합니다.
 */
function setSearchCache(query, data) {
  try { 
    localStorage.setItem('gb_search_' + query, JSON.stringify({ data, ts: Date.now() })); 
  } catch {}
}

/**
 * 구텐베르크 라이브러리에서 책을 검색합니다.
 */
export async function searchGutenberg(query, page = 1) {
  if (page === 1) {
    const cached = getSearchCache(query);
    if (cached) return { results: cached, fromCache: true };
  }
  try {
    const res = await fetch(`${GUTENBERG_API}?search=${encodeURIComponent(query)}&page=${page}`);
    const data = await res.json();
    if (page === 1 && data.results?.length) setSearchCache(query, data.results);
    return { results: data.results || [], fromCache: false };
  } catch(e) { return { results: [], fromCache: false }; }
}

/**
 * 구텐베르크 텍스트를 정제합니다.
 */
export function cleanGutenbergText(text) {
  const startMarkers = ['*** START OF THE PROJECT GUTENBERG EBOOK', '*** START OF THIS PROJECT GUTENBERG EBOOK', '*END*THE SMALL PRINT'];
  const endMarkers = ['*** END OF THE PROJECT GUTENBERG EBOOK', '*** END OF THIS PROJECT GUTENBERG EBOOK', 'End of the Project Gutenberg EBook'];
  let cleaned = text;
  for (const marker of startMarkers) {
    const idx = cleaned.indexOf(marker);
    if (idx !== -1) {
      const lineEnd = cleaned.indexOf('\n', idx);
      cleaned = cleaned.substring(lineEnd + 1);
      break;
    }
  }
  for (const marker of endMarkers) {
    const idx = cleaned.indexOf(marker);
    if (idx !== -1) { cleaned = cleaned.substring(0, idx); break; }
  }
  return cleaned.trim();
}

/**
 * 특정 ID의 도서를 구텐베르크에서 가져옵니다.
 */
export async function fetchGutenbergBook(bookId) {
  const res = await fetch(`/api/gutenberg?id=${bookId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '책을 불러올 수 없습니다');
  }
  const text = await res.text();
  return cleanGutenbergText(text);
}
