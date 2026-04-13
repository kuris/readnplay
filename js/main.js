import { state } from './state.js';
import { $, log } from './utils.js';
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
  
  // 시작하자마자 워크플로우 진입
  generate(0);
});

function initEventListeners() {
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
  
  // 위임 리스너
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-zip-export') downloadGameZip();
    if (e.target.id === 'btn-share-results') shareResults();
    if (e.target.id === 'btn-save-html') saveGameAsHTML();
    if (e.target.id === 'btn-save-txt') saveGameAsText();
    if (e.target.id === 'btn-go-home') location.reload();
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
        <button class="gc-replay-btn" data-id="${item.id}">▶ 다시 플레이</button>
        <button class="gc-dl-btn" data-id="${item.id}" title="ZIP 다운로드">📦 다운로드</button>
      </div>
    `).join('');
    
    grid.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('gc-dl-btn') || e.target.classList.contains('gc-replay-btn')) return;
        loadGameFromGallery(card.dataset.id);
      });
    });

    grid.querySelectorAll('.gc-replay-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadGameFromGallery(btn.dataset.id);
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
    startGame();
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
