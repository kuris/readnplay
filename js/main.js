import { state } from './state.js';
import { $ } from './utils.js';
import { showScreen, updateLangTabs } from './ui-manager.js';
import { generate } from './story-generator.js';
import { startGame, renderScene } from './game-engine.js';
import { loadProgress, clearProgress, handleFile } from './storage.js';
import { renderFeaturedBooks, searchGutenberg, renderBookList, refreshFeaturedBooks } from './gutenberg.js';
import { downloadGameZip, shareResults, saveGameAsHTML, saveGameAsText } from './export-system.js';

// --- 전역 접근이 필요한 함수들 (HTML inline 이벤트 호환용) ---
window.switchLang = (lang) => {
  state.activeLang = lang;
  updateLangTabs(lang);
  renderScene();
};

window.checkReady = () => {
  const ready = state.selectedSource === 'upload' 
    ? state.epubText.length > 0 
    : state.selectedGutenbergBook !== null;
  const btn = $('btn-start');
  if (btn) btn.disabled = !ready;
};

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  setupTabEvents();
  setupGalleryEvents();
  
  if (loadProgress()) {
    const contSec = $('continue-section');
    if (contSec) contSec.style.display = 'block';
  }
});

function initEventListeners() {
  /* ── MODE CARDS ── */
  $('mode-grid').querySelectorAll('.opt-card').forEach(c => {
    c.addEventListener('click', () => {
      $('mode-grid').querySelectorAll('.opt-card').forEach(x => x.classList.remove('sel'));
      c.classList.add('sel');
      state.selectedMode = c.dataset.mode;
    });
  });

  /* ── LENGTH CARDS ── */
  $('length-grid').querySelectorAll('.opt-card').forEach(c => {
    c.addEventListener('click', () => {
      $('length-grid').querySelectorAll('.opt-card').forEach(x => x.classList.remove('sel'));
      c.classList.add('sel');
      state.selectedLength = c.dataset.length;
    });
  });

  /* ── SOURCE TOGGLE ── */
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedSource = btn.dataset.source;
      
      $('upload-area').style.display = state.selectedSource === 'upload' ? 'block' : 'none';
      $('gutenberg-browser').style.display = state.selectedSource === 'gutenberg' ? 'block' : 'none';
      
      if (state.selectedSource === 'gutenberg' && !$('gb-books-grid').innerHTML) {
        renderFeaturedBooks();
      }
      window.checkReady();
    });
  });

  /* ── LANG TOGGLE ── */
  $('lang-row').querySelectorAll('.lang-opt').forEach(b => {
    b.addEventListener('click', () => {
      $('lang-row').querySelectorAll('.lang-opt').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      state.selectedLang = b.dataset.lang;
    });
  });

  /* ── CACHE STRATEGY TOGGLE ── */
  $('cache-row').querySelectorAll('.lang-opt').forEach(b => {
    b.addEventListener('click', () => {
      $('cache-row').querySelectorAll('.lang-opt').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      state.cacheStrategy = b.dataset.strategy;
    });
  });

  /* ── IMAGE GENERATOR SETTINGS (Always SD) ── */
  state.imageGenerator = 'sd_local';

  /* ── SD URL INPUT ── */
  const sdUrlInput = $('sd-url-input');
  if (sdUrlInput) {
    sdUrlInput.value = state.sdUrl || '';
    sdUrlInput.addEventListener('input', () => {
      state.sdUrl = sdUrlInput.value.trim();
    });
  }

  /* ── FILE DROP ── */
  const dz = $('drop-zone');
  if (dz) {
    dz.addEventListener('click', () => $('file-input').click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('over');
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith('.epub')) handleFile(f);
    });
  }
  const fileInput = $('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
  }

  /* ── GUTENBERG SEARCH ── */
  const searchBtn = $('gb-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', async () => {
      const query = $('gb-search-input').value.trim();
      if (!query) return;
      $('gb-loading').style.display = 'block';
      $('gb-books-grid').innerHTML = '';
      try {
        const { results, fromCache } = await searchGutenberg(query);
        $('gb-loading').style.display = 'none';
        if (!results || results.length === 0) {
          $('gb-books-grid').innerHTML = '<div style="padding:2rem;text-align:center;color:var(--ink3);font-size:12px;">검색 결과가 없습니다</div>';
          $('gb-pagination').style.display = 'none';
          return;
        }
        
        state.gutenbergSearchResults = results.map(b => ({
          id: b.id, title: b.title, author: b.authors?.[0]?.name || 'Unknown',
          lang: b.languages?.[0] || 'en', category: 'classic'
        }));
        state.gutenbergSearchPage = 1;
        renderGutenbergPage();

        if (fromCache) {
          const notice = document.createElement('div');
          notice.style.cssText = 'font-size:10px;color:var(--ink3);text-align:right;padding:4px 8px;opacity:0.6;';
          notice.textContent = '⚡ 캐시된 결과 (7일)';
          $('gb-books-grid').appendChild(notice);
        }
      } catch(e) {
        $('gb-loading').style.display = 'none';
        alert('검색 중 오류 발생');
      }
    });
  }

  /* ── CATEGORY FILTER ── */
  document.querySelectorAll('.gb-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gb-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      if (cat === 'featured') {
        renderFeaturedBooks();
      } else {
        const grid = $('gb-books-grid');
        if (grid) grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--ink3);font-size:12px;">이 카테고리를 검색해보세요...</div>';
        const searchInput = $('gb-search-input');
        if (searchInput) {
          searchInput.value = cat;
          searchBtn.click();
        }
      }
    });
  });

  /* ── REFRESH FEATURED BOOKS ── */
  const refreshBtn = $('gb-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.style.animation = 'spin 1s linear infinite';
      const updated = await refreshFeaturedBooks(true);
      refreshBtn.style.animation = '';
      if (!updated) {
        // 변경 사항이 없거나 실패한 경우 간단한 토스트 느낌의 메시지 표시 가능 (생략)
      }
    });
  }

  /* ── START / RESTART / CONTINUE ── */
  const startBtn = $('btn-start');
  if (startBtn) startBtn.addEventListener('click', () => generate(0));

  const restartBtn = $('btn-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      state.epubText = ''; state.gameData = null; state.selectedGutenbergBook = null;
      clearProgress();
      const fileBadge = $('file-badge');
      if (fileBadge) fileBadge.classList.remove('show');
      if (fileInput) fileInput.value = '';
      document.querySelectorAll('.gb-book-card').forEach(c => c.classList.remove('selected'));
      window.checkReady();
      showScreen('setup');
    });
  }

  const continueBtn = $('btn-continue');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (loadProgress()) {
        // 이어서 하기도 VN 모드 토글 필요
        document.body.classList.toggle('mode-vn', state.selectedMode === 'visual_novel');
        showScreen('game');
        renderScene();
      }
    });
  }

  /* ── UI TOGGLES ── */
  const origToggle = $('orig-toggle');
  if (origToggle) {
    origToggle.addEventListener('click', () => {
      const box = $('orig-box');
      if (box) {
        const show = box.classList.toggle('show');
        origToggle.textContent = show ? '원문 발췌 숨기기 ▴' : '원문 발췌 보기 ▾';
      }
    });
  }
  
  // 엔딩 화면의 동적 버튼들에 대한 위임 리스너 (혹은 inject 시점에 바인딩)
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-zip-export') downloadGameZip();
    if (e.target.id === 'btn-share-results') shareResults();
    if (e.target.id === 'btn-save-html') saveGameAsHTML();
    if (e.target.id === 'btn-save-txt') saveGameAsText();
    if (e.target.id === 'btn-go-home') location.reload(); // 가장 확실한 초기화 방법
    
    // pagination 버튼
    if (e.target.id === 'gb-prev-btn') {
      if (state.gutenbergSearchPage > 1) {
        state.gutenbergSearchPage--;
        renderGutenbergPage();
      }
    }
    if (e.target.id === 'gb-next-btn') {
      const maxPage = Math.ceil(state.gutenbergSearchResults.length / 20);
      if (state.gutenbergSearchPage < maxPage) {
        state.gutenbergSearchPage++;
        renderGutenbergPage();
      }
    }
  });
}

/** ─── TABS & GALLERY LOGIC ─── **/
function setupTabEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = 'tab-' + btn.dataset.tab;
      const tabEl = $(tabId);
      if (tabEl) tabEl.classList.add('active');
      
      if (btn.dataset.tab === 'gallery') {
        loadGallery();
      }
    });
  });
}

function setupGalleryEvents() {
  const refreshBtn = $('btn-refresh-gallery');
  if (refreshBtn) refreshBtn.addEventListener('click', loadGallery);
}

async function loadGallery() {
  const grid = $('gallery-grid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="gallery-empty">기록을 불러오는 중...</div>';
  
  try {
    const res = await fetch('/api/gallery');
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || '불러오기 실패');
    }
    const items = data;
    
    if (!items || items.length === 0) {
      grid.innerHTML = '<div class="gallery-empty">아직 기록된 모험이 없습니다.</div>';
      return;
    }
    
    grid.innerHTML = items.map(item => `
      <div class="gallery-card fadein" data-id="${item.id}">
        <div class="gc-title">${item.title}</div>
        <div class="gc-meta">
          <span class="gc-mode">${item.mode === 'visual_novel' ? '🎭 비주얼 노벨' : '⚔ 어드벤처'}</span>
          <span>${new Date(item.created_at).toLocaleDateString()}</span>
        </div>
        <button class="gc-dl-btn" data-id="${item.id}" title="ZIP 다운로드">📦 다운로드</button>
      </div>
    `).join('');
    
    grid.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('gc-dl-btn')) return;
        loadGameFromGallery(card.dataset.id);
      });
    });

    grid.querySelectorAll('.gc-dl-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleGalleryDownload(btn.dataset.id, btn);
      });
    });
  } catch (e) {
    console.error('Gallery Load Error:', e);
    grid.innerHTML = `
      <div class="gallery-empty" style="color:var(--red);">
        목록을 불러오지 못했습니다.<br>
        <span style="font-size:10px; opacity:0.7;">사유: ${e.message}</span>
      </div>
    `;
  }
}

async function loadGameFromGallery(id) {
  log('모험 기록을 불러오는 중...');
  try {
    const res = await fetch('/api/gallery?id=' + id);
    if (!res.ok) throw new Error('데이터를 가져오지 못했습니다.');
    const gameData = await res.json();
    
    state.gameData = gameData;
    state.selectedMode = gameData.mode || 'adventure';
    state.bookTitle = gameData.title_ko || gameData.title;
    state.isGalleryMode = true;
    
    // 갤러리 로딩 시에도 VN 모드 토글
    document.body.classList.toggle('mode-vn', state.selectedMode === 'visual_novel');
    
    // 게임 시작
    import('./game-engine.js').then(m => m.startGame());
  } catch (e) {
    alert('갤러리 로딩 실패: ' + e.message);
  }
}

async function handleGalleryDownload(id, btn) {
  try {
    const res = await fetch('/api/gallery?id=' + id);
    if (!res.ok) throw new Error('데이터를 가져오지 못했습니다.');
    const gameData = await res.json();
    
    // 임시로 상태 설정 후 다운로드 실행
    state.gameData = gameData;
    state.selectedMode = gameData.mode || 'adventure';
    state.bookTitle = gameData.title_ko || gameData.title;
    
    const { downloadGameZip } = await import('./export-system.js');
    await downloadGameZip(btn);
  } catch (e) {
    alert('다운로드 실패: ' + e.message);
  }
}

/**
 * 구텐베르크 검색 결과를 현재 페이지에 맞춰 렌더링합니다.
 */
function renderGutenbergPage() {
  const grid = $('gb-books-grid');
  const pagination = $('gb-pagination');
  const info = $('gb-page-info');
  if (!grid || !pagination) return;

  const results = state.gutenbergSearchResults;
  const page = state.gutenbergSearchPage;
  const pageSize = 20;
  const total = results.length;
  const maxPage = Math.ceil(total / pageSize);

  const start = (page - 1) * pageSize;
  const currentItems = results.slice(start, start + pageSize);
  
  grid.innerHTML = '';
  renderBookList(currentItems, grid);
  
  pagination.style.display = total > pageSize ? 'flex' : 'none';
  if (info) info.textContent = `${page} / ${maxPage}`;
  
  $('gb-prev-btn').disabled = page === 1;
  $('gb-next-btn').disabled = page === maxPage;
}
