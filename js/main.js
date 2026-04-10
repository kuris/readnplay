import { state } from './state.js';
import { $ } from './utils.js';
import { showScreen, updateLangTabs } from './ui-manager.js';
import { generate } from './story-generator.js';
import { startGame, renderScene } from './game-engine.js';
import { loadProgress, clearProgress, handleFile } from './storage.js';
import { renderFeaturedBooks, searchGutenberg, renderBookList } from './gutenberg.js';
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

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  
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
          return;
        }
        const mapped = results.slice(0, 16).map(b => ({
          id: b.id, title: b.title, author: b.authors?.[0]?.name || 'Unknown',
          lang: b.languages?.[0] || 'en', category: 'classic'
        }));
        renderBookList(mapped, $('gb-books-grid'));
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
  });
}
