import { state } from './state.js';
import { $, log } from './utils.js';
import { WORKFLOW_STAGES } from './constants.js';
import { showScreen } from './ui-manager.js';

export function initWorkflowUI() {
  showScreen('workflow');
  
  const chatArea = $('wf-chat-area');
  const cardArea = $('wf-card-area');
  if (chatArea) chatArea.innerHTML = '';
  if (cardArea) cardArea.innerHTML = '<div class="wf-card-empty"><span class="book-anim">⏳</span><p>AI가 데이터를 정리하고 있습니다...</p></div>';
  
  updateWorkflowMetadata();
  renderWorkflowSidebar();
  updateWorkflowSummary();
}

/**
 * 프로젝트 정보를 업데이트합니다.
 */
export function updateWorkflowMetadata() {
  const titleEl = $('wf-book-title');
  if (titleEl) titleEl.textContent = state.bookTitle || state.selectedGutenbergBook?.title || '도서 선택 대기 중...';
  
  const metaEl = $('wf-book-meta');
  if (metaEl) {
    const mode = state.selectedMode || '-';
    const lang = state.selectedLang || '-';
    metaEl.textContent = `${mode} / ${lang}`;
  }
}

export function renderWorkflowSidebar() {
  const stepsEl = $('wf-steps');
  if (!stepsEl) return;

  const stages = Object.values(WORKFLOW_STAGES);
  const currentStageIdx = state.workflow.stageIdx || 0;

  stepsEl.innerHTML = stages.map((stage, i) => `
    <div class="wf-step-item ${i === currentStageIdx ? 'active' : (i < currentStageIdx ? 'done' : '')}">
      <div class="wf-step-icon">${i < currentStageIdx ? '✓' : stage.icon}</div>
      <div class="wf-step-label">${stage.label}</div>
    </div>
  `).join('');
}

/**
 * 우측 라이브 요약 패널을 업데이트합니다.
 */
export function updateWorkflowSummary() {
  const modeEl = $('sum-mode');
  const langEl = $('sum-lang');
  const lengthEl = $('sum-length');
  const styleEl = $('sum-style');

  if (modeEl) modeEl.textContent = state.selectedMode === 'adventure' ? '⚔ 주인공 빙의' : (state.selectedMode === 'visual_novel' ? '🎭 비주얼 노벨' : '-');
  if (langEl) langEl.textContent = state.selectedLang === 'ko' ? '🇰🇷 한국어' : (state.selectedLang === 'en' ? '🇺🇸 영어' : '-');
  if (lengthEl) lengthEl.textContent = state.selectedLength === 'short' ? '⚡ 빠른 전개' : (state.selectedLength === 'medium' ? '📖 표준' : (state.selectedLength === 'long' ? '🎯 심화' : '-'));
  if (styleEl) {
    const styleName = {
      'semi_realistic_anime': '세미리얼 애니',
      'webtoon_korean': '한국 웹툰풍',
      'classic_watercolor': '클래식 수채화',
      'cyberpunk_noir': '사이버펑크 누아르'
    }[state.userDecisions.visualStyle.profile] || '-';
    styleEl.textContent = styleName;
  }
}

/**
 * AI 메시지를 채팅창에 추가합니다.
 */
export async function postAiMessage(text) {
  const chatArea = $('wf-chat-area');
  if (!chatArea) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'wf-msg';
  msgDiv.innerHTML = `
    <div class="wf-msg-avatar">🤖</div>
    <div class="wf-msg-bubble">${text}</div>
  `;
  chatArea.appendChild(msgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
  
  // 약간의 딜레이로 생동감 부여
  return new Promise(resolve => setTimeout(resolve, 600));
}

/**
 * 특정 타입의 인터랙션 카드를 렌더링합니다.
 */
export function renderWorkflowCard(type, data, onDecision) {
  const cardArea = $('wf-card-area');
  if (!cardArea) return;

  cardArea.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'wf-card';

  switch (type) {
    case 'BOOK_SELECT':
      renderBookSelectCard(card, data, onDecision);
      break;
    case 'CONFIG_SELECT':
      renderConfigSelectCard(card, data, onDecision);
      break;
    case 'MODE_SELECT':
      renderModeSelectCard(card, data, onDecision);
      break;
    case 'ENTITY_RESOLVE':
      renderEntityResolveCard(card, data, onDecision);
      break;
    case 'STYLE_SELECT':
      renderStyleSelectCard(card, data, onDecision);
      break;
    case 'PLAN_CONFIRM':
      renderPlanConfirmCard(card, data, onDecision);
      break;
  }

  cardArea.appendChild(card);
}

/**
 * Step 0: 도서 선택 카드
 */
function renderBookSelectCard(container, data, resolve) {
  container.innerHTML = `
    <div class="wf-card-h">📖 어떤 이야기를 시작할까요?</div>
    <div class="wf-book-options">
      <div class="wf-option-group">
        <div class="field-label">내 기기의 파일</div>
        <div class="wf-drop-zone" id="wf-drop-zone">
          <span class="icon">📁</span>
          <div class="txt">EPUB 파일을 드래그하거나 클릭하세요</div>
        </div>
        <input type="file" id="wf-file-input" accept=".epub" style="display:none">
      </div>
      
      <div class="wf-option-group">
        <div class="field-label">무료 고전 도서 (Gutenberg)</div>
        <div class="wf-search-box">
          <input type="text" id="wf-gb-search" placeholder="제목이나 작가 검색..." class="field-input">
          <button class="btn-wf-sm" id="btn-gb-search">🔍</button>
        </div>
        <div class="wf-book-mini-grid" id="wf-book-grid">
          <!-- 추천/검색 결과 -->
        </div>
      </div>
    </div>
  `;

  // 파일 업로드 처리
  const dropZone = container.querySelector('#wf-drop-zone');
  const fileInput = container.querySelector('#wf-file-input');
  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (file) {
      resolve({ type: 'upload', file });
    }
  };

  // 구텐베르크 추천 도서 렌더링
  const grid = container.querySelector('#wf-book-grid');
  const { FEATURED_BOOKS } = data; // constants에서 전달받음
  
  function renderList(books) {
    grid.innerHTML = books.map(b => `
      <div class="wf-book-mini-card" data-id="${b.id}">
        <div class="title">${b.title}</div>
        <div class="author">${b.author}</div>
      </div>
    `).join('');
    grid.querySelectorAll('.wf-book-mini-card').forEach(c => {
      c.onclick = () => {
        const book = books.find(x => String(x.id) === String(c.dataset.id));
        resolve({ type: 'gutenberg', book });
      };
    });
  }

  renderList(FEATURED_BOOKS.slice(0, 4));

  // 검색 처리
  const searchInput = container.querySelector('#wf-gb-search');
  container.querySelector('#btn-gb-search').onclick = async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    grid.innerHTML = '<div style="font-size:11px; color:var(--ink3); padding:10px;">검색 중...</div>';
    try {
      const { searchGutenberg } = await import('./gutenberg.js');
      const { results } = await searchGutenberg(query, 10);
      if (results && results.length > 0) {
        const mapped = results.map(r => ({
          id: r.id, title: r.title, author: r.authors?.[0]?.name || 'Unknown'
        }));
        renderList(mapped);
      } else {
        grid.innerHTML = '<div style="font-size:11px; color:var(--ink3); padding:10px;">결과 없음</div>';
      }
    } catch(e) {
      grid.innerHTML = '<div style="font-size:11px; color:var(--red); padding:10px;">검색 실패</div>';
    }
  };
}

/**
 * Step 1: 환경 설정 카드
 */
function renderConfigSelectCard(container, data, resolve) {
  container.innerHTML = `
    <div class="wf-card-h">⚙️ 리딩 환경 설정</div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.5rem;">
      <div class="wf-option-group">
        <div class="field-label">언어</div>
        <select id="sel-wf-lang" class="field-input">
          <option value="ko" ${state.selectedLang === 'ko' ? 'selected' : ''}>🇰🇷 한국어</option>
          <option value="en" ${state.selectedLang === 'en' ? 'selected' : ''}>🇺🇸 영어 원문</option>
        </select>
      </div>
      <div class="wf-option-group">
        <div class="field-label">읽기 강도 (분량)</div>
        <select id="sel-wf-length" class="field-input">
          <option value="short" ${state.selectedLength === 'short' ? 'selected' : ''}>⚡ 빠른 전개</option>
          <option value="medium" ${state.selectedLength === 'medium' ? 'selected' : ''}>📖 표준</option>
          <option value="long" ${state.selectedLength === 'long' ? 'selected' : ''}>🎯 심화</option>
        </select>
      </div>
    </div>
    
    <div class="wf-option-group" style="margin-top:1.5rem;">
      <div class="field-label">장르 및 모드</div>
      <div class="wf-mode-grid mini">
        <div class="wf-mode-card ${state.selectedMode === 'adventure' ? 'selected' : ''}" data-mode="adventure">
          <div class="title">⚔ 주인공 빙의</div>
          <div class="desc">선택지로 스토리를 개척</div>
        </div>
        <div class="wf-mode-card ${state.selectedMode === 'visual_novel' ? 'selected' : ''}" data-mode="visual_novel">
          <div class="title">🎭 비주얼 노벨</div>
          <div class="desc">캐릭터 관계 및 전개</div>
        </div>
      </div>
    </div>

    <div class="wf-actions">
      <button class="btn-wf-primary" id="btn-wf-confirm">설정 완료 →</button>
    </div>
  `;

  let selectedMode = state.selectedMode;
  container.querySelectorAll('.wf-mode-card').forEach(c => {
    c.onclick = () => {
      container.querySelectorAll('.wf-mode-card').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      selectedMode = c.dataset.mode;
    };
  });

  container.querySelector('#btn-wf-confirm').onclick = () => {
    resolve({
      lang: container.querySelector('#sel-wf-lang').value,
      length: container.querySelector('#sel-wf-length').value,
      mode: selectedMode
    });
  };
}

/**
 * 모드 선택 카드
 */
function renderModeSelectCard(container, data, resolve) {
  const modes = [
    { id: 'teaser', icon: '⚡', title: '요약 탐색 (Highlights)', desc: '작품의 핵심 정수만 빠르게 훑어보는 요약 독서 경험' },
    { id: 'story', icon: '📖', title: '전개 집중 (Full Story)', desc: '원작의 호흡을 보존하며 장면별로 깊게 읽는 고밀도 경험' },
    { id: 'hybrid', icon: '🔄', title: '맞춤형 리딩', desc: 'AI가 중요도에 따라 요약과 상세 묘사를 섞어 제안합니다.' }
  ];

  const currentMode = data.recommendedMode || 'story';

  container.innerHTML = `
    <div class="wf-card-h">🎯 생성 방식 선택</div>
    <p style="font-size:13px; color:var(--ink2); margin-bottom:1.5rem;">
      텍스트 분석 결과, <b>${currentMode === 'story' ? '풍부한 서사' : '빠른 전개'}</b>가 어울리는 작품입니다. 어떤 방식으로 요리할까요?
    </p>
    <div class="wf-mode-grid">
      ${modes.map(m => `
        <div class="wf-mode-card ${m.id === currentMode ? 'selected' : ''}" data-mode="${m.id}">
          <div class="icon">${m.icon}</div>
          <div class="title">${m.title}</div>
          <div class="desc">${m.desc}</div>
        </div>
      `).join('')}
    </div>
    <div class="wf-actions">
      <button class="btn-wf-primary" id="btn-wf-confirm">선택 완료 →</button>
    </div>
  `;

  let selected = currentMode;
  container.querySelectorAll('.wf-mode-card').forEach(c => {
    c.onclick = () => {
      container.querySelectorAll('.wf-mode-card').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      selected = c.dataset.mode;
    };
  });

  container.querySelector('#btn-wf-confirm').onclick = () => resolve(selected);
}

/**
 * 엔티티 정제 카드
 */
function renderEntityResolveCard(container, data, resolve) {
  const { entities } = data;
  let currentEntities = [...entities];
  let excludedIds = new Set();

  function updateList() {
    container.innerHTML = `
      <div class="wf-card-h">👥 등장인물 및 엔티티 정제</div>
      <p style="font-size:12px; color:var(--ink2); margin-bottom:1rem;">
        식별된 인물들입니다. 중복된 이름은 병합하거나, 불필요한 항목은 제외해 주세요.
      </p>
      <div class="wf-entity-list">
        ${currentEntities.map(e => {
          const isExcluded = excludedIds.has(e.id);
          return `
            <div class="wf-entity-row" data-id="${e.id}" style="${isExcluded ? 'opacity:0.4; background:var(--paper3)' : ''}">
              <div class="wf-entity-main">
                <div class="wf-entity-name" style="${isExcluded ? 'text-decoration:line-through' : ''}">
                  ${e.name}
                  <span class="wf-entity-type-badge">${e.type}</span>
                </div>
                <div class="wf-entity-aliases">${e.aliases?.join(', ') || ''}</div>
              </div>
              <div class="wf-entity-actions">
                ${isExcluded 
                  ? `<button class="btn-wf-sm" data-action="restore">복구</button>`
                  : `<button class="btn-wf-sm danger" data-action="exclude">제외</button>`
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="wf-actions">
        <button class="btn-wf-primary" id="btn-wf-confirm">구성 완료 →</button>
      </div>
    `;

    container.querySelectorAll('.btn-wf-sm').forEach(btn => {
      btn.onclick = () => {
        const row = btn.closest('.wf-entity-row');
        const id = row.dataset.id;
        const action = btn.dataset.action;

        if (action === 'exclude') excludedIds.add(id);
        if (action === 'restore') excludedIds.delete(id);
        updateList();
      };
    });

    container.querySelector('#btn-wf-confirm').onclick = () => {
      const finalEntities = currentEntities.filter(e => !excludedIds.has(e.id));
      resolve({ entities: finalEntities, mergeGroups: [] });
    };
  }

  updateList();
}

/**
 * 비주얼 스타일 선택 카드
 */
function renderStyleSelectCard(container, data, resolve) {
  const styles = [
    { id: 'semi_realistic_anime', name: '세미리얼 애니', desc: '현대적이고 깔끔한 화풍', img: 'https://images.unsplash.com/photo-1578632738908-4521c44b0d38?q=80&w=400&auto=format&fit=crop' },
    { id: 'webtoon_korean', name: '한국 웹툰풍', desc: '대조가 명확하고 화려한 스타일', img: 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?q=80&w=400&auto=format&fit=crop' },
    { id: 'classic_watercolor', name: '클래식 수채화', desc: '고전 소설에 어울리는 부드러운 화풍', img: 'https://images.unsplash.com/photo-1541462608141-ad4d719cf080?q=80&w=400&auto=format&fit=crop' },
    { id: 'cyberpunk_noir', name: '사이버펑크 누아르', desc: '강렬한 조명과 어두운 분위기', img: 'https://images.unsplash.com/photo-1605806616949-1e87b487fc2f?q=80&w=400&auto=format&fit=crop' }
  ];

  container.innerHTML = `
    <div class="wf-card-h">🎨 비주얼 스타일 결정</div>
    <div class="wf-style-grid">
      ${styles.map(s => `
        <div class="wf-style-card" data-style="${s.id}">
          <img src="${s.img}" class="wf-style-img">
          <div class="wf-style-info">
            <div class="wf-style-name">${s.name}</div>
            <div class="wf-style-desc">${s.desc}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="wf-actions">
      <button class="btn-wf-primary" id="btn-wf-confirm">스타일 확정 →</button>
    </div>
  `;

  let selected = styles[0].id;
  container.querySelectorAll('.wf-style-card').forEach(c => {
    c.onclick = () => {
      container.querySelectorAll('.wf-style-card').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      selected = c.dataset.style;
    };
  });

  container.querySelector('#btn-wf-confirm').onclick = () => resolve(selected);
}

/**
 * 최종 계획 확인 카드
 */
function renderPlanConfirmCard(container, data, resolve) {
  const { sceneCount, characterCount } = data;

  container.innerHTML = `
    <div class="wf-card-h">🗺️ 생성 계획 최종 확인</div>
    <div style="background:var(--paper2); padding:1.5rem; border-radius:12px; margin-bottom:1.5rem;">
      <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
        <span style="font-size:13px; color:var(--ink2);">예상 장면 수</span>
        <span style="font-weight:600; color:var(--gold);">${sceneCount} 씬</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
        <span style="font-size:13px; color:var(--ink2);">핵심 인물 포트레이트</span>
        <span style="font-weight:600; color:var(--gold);">${characterCount}명</span>
      </div>
      <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border); padding-top:0.5rem; margin-top:0.5rem;">
        <span style="font-size:13px; color:var(--ink2);">예상 소요 시간</span>
        <span style="font-weight:600; color:var(--ink);">약 2~3분</span>
      </div>
    </div>
    <p style="font-size:12px; color:var(--ink3); line-height:1.6;">
      위 계획대로 AI가 정밀 생성을 시작합니다. 생성 중에는 브라우저를 닫지 마세요.
    </p>
    <div class="wf-actions">
      <button class="btn-wf-primary" id="btn-wf-confirm" style="width:100%; background:var(--gold); color:#fff;">✨ 마법 시작하기</button>
    </div>
  `;

  container.querySelector('#btn-wf-confirm').onclick = () => resolve(true);
}
