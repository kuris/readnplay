import { state } from './state.js';
import { $, log } from './utils.js';
import { STAGE_PROGRESS as SP, STAGE_TEXTS as ST } from './constants.js';

/**
 * 특정 화면을 활성화합니다.
 */
export function showScreen(name) {
  log(`화면 전환: ${name}`, 'warn');
  const target = $('screen-' + name);
  if (!target) {
    console.error(`Target screen not found: screen-${name}`);
    return;
  }

  // 1. 모든 스크린 요소에서 active 클래스 제거 (CSS가 display: none을 담당)
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => {
    s.classList.remove('active');
    // JS 강제 스타일 제거 (충돌 방지)
    s.style.display = '';
    s.style.opacity = '';
  });
  
  // 2. 대상 스크린 활성화
  target.classList.add('active');
  
  // 3. 페이지 상단으로 스크롤
  window.scrollTo(0, 0);
}

/**
 * 로딩 단계를 시각적으로 업데이트합니다.
 */
export function setStage(idx) {
  for (let i = 0; i < 4; i++) {
    const el = $('stage-' + i);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  }
  const bar = $('stage-bar');
  if (bar) bar.style.width = SP[idx] + '%';
  const txt = $('loading-stage-text');
  if (txt) txt.textContent = ST[idx] || '';
}

/**
 * 로딩이 완료되었음을 표시합니다.
 */
export function completeStages() {
  for (let i = 0; i < 4; i++) {
    const el = $('stage-' + i);
    if (el) { el.classList.remove('active'); el.classList.add('done'); }
  }
  const bar = $('stage-bar');
  if (bar) bar.style.width = '100%';
  const txt = $('loading-stage-text');
  if (txt) txt.textContent = '완료! 게임을 시작합니다...';
}

/**
 * 게임 내 언어 탭 UI를 업데이트합니다.
 */
export function updateLangTabs(lang) {
  ['ko','en','bi'].forEach(l => {
    const btn = $('glp-' + l);
    if (btn) btn.classList.toggle('active', l === lang);
  });
}

/**
 * 점수 획득/상실 애니메이션을 표시합니다.
 */
export function animateScore(delta) {
  state.score += delta;
  const scoreEl = $('g-score');
  if (scoreEl) {
    scoreEl.textContent = state.score;
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = (delta > 0 ? '+' : '') + delta;
    popup.style.color = delta > 0 ? 'var(--green)' : 'var(--red)';
    scoreEl.style.position = 'relative';
    scoreEl.appendChild(popup);
    setTimeout(() => popup.remove(), 900);
  }
}

/**
 * 캐릭터 호감도 변화 팝업을 표시합니다.
 */
export function showRelationshipPopup(charId, effect) {
  const char = (state.gameData.characters || []).find(c => String(c.id) === String(charId));
  if (!char) return;
  const popup = document.createElement('div');
  popup.className = 'relationship-popup';
  const indicator = effect > 0 ? '▲' : '▼';
  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      ${char.avatar_url ? `<img src="${char.avatar_url}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">` : ''}
      <span>${char.name} 호감도 ${indicator} (${effect > 0 ? '+' : ''}${effect})</span>
    </div>`;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 2000);
}

/**
 * 배경 이미지를 시네마틱하게 업데이트합니다.
 */
export async function updateBackdrop(keyword) {
  const bg = $('game-backdrop');
  if (!bg) return;
  
  if (state.selectedMode !== 'visual_novel') {
    bg.style.backgroundImage = 'none';
    bg.style.backgroundColor = 'transparent';
    return;
  }

  bg.style.opacity = '0.2';
  bg.style.transition = 'opacity 1s ease-in-out';

  // Fallback URL (api-service의 safeFetchImagen을 쓰기 위해 ui-manager에서 호출하지 않고 
  // 실제 로직은 game-engine이나 api-service 쪽에서 담당하는게 좋지만 일단 기존 로직 유지)
  let url = `https://loremflickr.com/1280/720/${encodeURIComponent(keyword || 'landscape')}/all`;
  
  // 실제 Imagen 호출 로직은 외부에서 주입하거나 api-service를 여기로 import 해야 함
  // 여기서는 URL이 결정된 후 적용하는 용도만 수행하도록 일단 개선
}

/**
 * 배경 이미지를 실제 적용합니다.
 */
export function applyBackdrop(url) {
  const bg = $('game-backdrop');
  if (!bg) return;
  const img = new Image();
  img.src = url;
  img.onload = () => {
    bg.style.backgroundImage = `url('${url}')`;
    bg.style.opacity = '1';
  };
}
