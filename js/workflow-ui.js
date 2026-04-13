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
  const entitiesEl = $('sum-entities');
  const statsEl = $('sum-stats');

  const safelyVal = (el, val) => {
    if (el) el.innerHTML = `<span>${val}</span>`;
  };

  const modeMap = { 'adventure': '⚔ 주인공 빙의', 'visual_novel': '🎭 비주얼 노벨' };
  const langMap = { 'ko': '🇰🇷 한국어', 'en': '🇺🇸 영어' };
  const lengthMap = { 'short': '⚡ 빠른 전개', 'medium': '📖 표준', 'long': '🎯 심화' };
  const styleMap = {
    'semi_realistic_anime': '세미리얼 애니',
    'webtoon_korean': '한국 웹툰풍',
    'classic_watercolor': '클래식 수채화',
    'cyberpunk_noir': '사이버펑크 누아르'
  };

  safelyVal(modeEl, modeMap[state.selectedMode] || '-');
  safelyVal(langEl, langMap[state.selectedLang] || '-');
  safelyVal(lengthEl, lengthMap[state.selectedLength] || '-');
  
  if (styleEl) {
    const styleProfile = state.userDecisions?.visualStyle?.profile || 'semi_realistic_anime';
    safelyVal(styleEl, styleMap[styleProfile] || '-');
  }

  // Entities Count
  if (entitiesEl) {
    const total = state.gameData?.characters?.length || 0;
    safelyVal(entitiesEl, total > 0 ? `${total}개 (주요 인물)` : '-');
  }

  // Stats (Scenes / Images)
  if (statsEl) {
    const scenes = state.gameData?.scenes?.length || 0;
    const images = (state.gameData?.characters?.length || 0) + (state.gameData?.scenes?.length || 0);
    if (scenes > 0) {
      safelyVal(statsEl, `${scenes}개 장면 / 약 ${images}장`);
    } else {
      safelyVal(statsEl, '-');
    }
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
  return new Promise(resolve => {
    setTimeout(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
      resolve();
    }, 600);
  });
}

/**
 * 작업을 진행 중임을 나타내는 로딩 카드를 표시합니다.
 */
export function setWorkflowLoading(message = "인공지능이 서사를 분석하고 있습니다...") {
  const cardArea = $('wf-card-area');
  if (!cardArea) return;

  cardArea.innerHTML = `
    <div class="wf-card wf-loading-card">
      <div class="wf-loading-spinner"></div>
      <div class="wf-loading-msg">${message}</div>
    </div>
  `;
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
/**
 * Step 0: 도서 선택 카드 (대화형 개편)
 */
async function renderBookSelectCard(container, data, resolve) {
  const { FEATURED_BOOKS } = data;

  // 1단계: 소스 선택
  async function showSourceSelect() {
    container.innerHTML = `
      <div class="wf-card-h">📖 시작할 방법을 골라주세요</div>
      <div class="wf-btn-grid">
        <div class="wf-btn-card" id="btn-wf-upload">
          <span class="icon">📁</span>
          <span class="label">파일 업로드</span>
        </div>
        <div class="wf-btn-card" id="btn-wf-browse">
          <span class="icon">🏛</span>
          <span class="label">고전 도서 탐색</span>
        </div>
      </div>
    `;

    container.querySelector('#btn-wf-upload').onclick = () => showUploadZone();
    container.querySelector('#btn-wf-browse').onclick = () => showGenreSelect();
  }

  // 1.5단계: 장르 및 추천 선택 (NEW)
  function showGenreSelect() {
    container.innerHTML = `
      <div class="wf-card-h">🔍 어떤 이야기를 찾으시나요?</div>
      <p style="font-size:12px; color:var(--ink2); margin-bottom:1.5rem;">취향에 맞는 테마를 선택하거나 직접 검색해보세요.</p>
      
      <div class="wf-option-list">
        <div class="wf-option-item" data-genre="recommended">
          <div class="wf-option-icon">✨</div>
          <div class="wf-option-main">
            <div class="wf-option-title">AI 추천 도서</div>
            <div class="wf-option-desc">가장 인기 있는 클래식 입문서들을 추천합니다.</div>
          </div>
          <div class="wf-option-arrow">→</div>
        </div>
        <div class="wf-option-item" data-genre="romance">
          <div class="wf-option-icon">🎭</div>
          <div class="wf-option-main">
            <div class="wf-option-title">로맨스 / 클래식</div>
            <div class="wf-option-desc">오만과 편견, 제인 에어 등 감성적인 서사</div>
          </div>
          <div class="wf-option-arrow">→</div>
        </div>
        <div class="wf-option-item" data-genre="mystery">
          <div class="wf-option-icon">🔦</div>
          <div class="wf-option-main">
            <div class="wf-option-title">추리 / 미스터리</div>
            <div class="wf-option-desc">셜록 홈즈, 드라큘라 등 긴장감 넘치는 전개</div>
          </div>
          <div class="wf-option-arrow">→</div>
        </div>
        <div class="wf-option-item" data-genre="adventure">
          <div class="wf-option-icon">⚔️</div>
          <div class="wf-option-main">
            <div class="wf-option-title">모험 / 판타지</div>
            <div class="wf-option-desc">모비 딕, 이상한 나라의 앨리스 등 역동적인 세계</div>
          </div>
          <div class="wf-option-arrow">→</div>
        </div>
        <div class="wf-option-item" data-genre="search">
          <div class="wf-option-icon">🔍</div>
          <div class="wf-option-main">
            <div class="wf-option-title">직접 검색</div>
            <div class="wf-option-desc">제목이나 작가를 직접 입력해서 찾기</div>
          </div>
          <div class="wf-option-arrow">→</div>
        </div>
      </div>

      <div class="wf-actions">
        <button class="btn-wf-sm" id="btn-wf-back">← 뒤로</button>
      </div>
    `;

    container.querySelectorAll('.wf-option-item').forEach(item => {
      item.onclick = () => {
        const genre = item.dataset.genre;
        if (genre === 'search') showSearchOrFeatured(null);
        else showSearchOrFeatured(genre);
      };
    });

    container.querySelector('#btn-wf-back').onclick = showSourceSelect;
  }

  // 2-A: 업로드 존 (기존 동일)
  function showUploadZone() {
    container.innerHTML = `
      <div class="wf-card-h">📁 로컬 파일 업로드</div>
      <div class="wf-option-group">
        <div class="wf-drop-zone" id="wf-drop-zone" style="margin-top:0.5rem; padding: 3rem 2rem;">
          <span class="icon" style="font-size: 2.5rem; display:block; margin-bottom:1rem;">📤</span>
          <div class="txt" style="font-size:14px; font-weight:500;">EPUB 파일을 여기에 놓으세요</div>
        </div>
        <input type="file" id="wf-file-input" accept=".epub" style="display:none">
      </div>
      <div class="wf-actions">
        <button class="btn-wf-sm" id="btn-wf-back">← 뒤로</button>
      </div>
    `;

    const dropZone = container.querySelector('#wf-drop-zone');
    const fileInput = container.querySelector('#wf-file-input');
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (file) resolve({ type: 'upload', file });
    };
    container.querySelector('#btn-wf-back').onclick = showSourceSelect;
  }

  // 2-B: 검색 또는 추천 도서 (필터 추가 개편)
  function showSearchOrFeatured(genreFilter = null) {
    container.innerHTML = `
      <div class="wf-card-h">🏛 고전 도서 탐색</div>
      <div class="wf-search-box" style="margin-bottom:1.5rem;">
        <input type="text" id="wf-gb-search" placeholder="보고 싶은 도서의 제목이나 작가를 입력하세요..." class="field-input">
        <button class="btn-wf-sm" id="btn-gb-search">찾기</button>
      </div>
      
      <div class="field-label" id="list-header">추천 도서</div>
      <div class="wf-option-list" id="wf-book-list" style="max-height: 280px;">
        <!-- 리스트 아이템 동적 삽입 -->
      </div>
      
      <div class="wf-actions">
        <button class="btn-wf-sm" id="btn-wf-back">← 뒤로</button>
      </div>
    `;

    const listContainer = container.querySelector('#wf-book-list');
    const listHeader = container.querySelector('#list-header');
    
    function renderPremiumList(books) {
      if (books.length === 0) {
        listContainer.innerHTML = '<div style="padding:2rem; text-align:center; opacity:0.5; font-size:13px;">해당하는 도서가 없습니다</div>';
        return;
      }

      listContainer.innerHTML = books.map(b => `
        <div class="wf-option-item" data-id="${b.id}">
          <div class="wf-option-icon">📖</div>
          <div class="wf-option-main">
            <div class="wf-option-title">${b.title}</div>
            <div class="wf-option-desc">${b.author}</div>
          </div>
          <div class="wf-option-arrow">→</div>
        </div>
      `).join('');

      listContainer.querySelectorAll('.wf-option-item').forEach(item => {
        item.onclick = () => {
          const book = books.find(x => String(x.id) === String(item.dataset.id));
          resolve({ type: 'gutenberg', book });
        };
      });
    }

    // 초기 리스트 필터링
    let filtered = FEATURED_BOOKS;
    if (genreFilter && genreFilter !== 'recommended') {
      filtered = FEATURED_BOOKS.filter(b => b.category === genreFilter);
      const genreNames = { romance: '로맨스', mystery: '추리/미스터리', adventure: '모험/판타지' };
      listHeader.textContent = `${genreNames[genreFilter] || genreFilter} 도서 목록`;
    } else if (genreFilter === 'recommended') {
      listHeader.textContent = '✨ AI 추천 도서';
      filtered = [...FEATURED_BOOKS].sort(() => 0.5 - Math.random()).slice(0, 5);
    }

    renderPremiumList(filtered);

    container.querySelector('#btn-gb-search').onclick = async () => {
      const query = container.querySelector('#wf-gb-search').value.trim();
      if (!query) return;
      
      listContainer.innerHTML = '<div style="padding:2rem; text-align:center; opacity:0.5; font-size:13px;">AI가 도서관에서 찾는 중...</div>';
      listHeader.textContent = `'${query}' 검색 결과`;

      try {
        const { searchGutenberg } = await import('./gutenberg.js');
        const { results } = await searchGutenberg(query, 14);
        if (results && results.length > 0) {
          const mapped = results.map(r => ({
            id: r.id, title: r.title, author: r.authors?.[0]?.name || 'Unknown'
          }));
          renderPremiumList(mapped);
        } else {
          listContainer.innerHTML = '<div style="padding:2rem; text-align:center; opacity:0.5; font-size:13px;">검색 결과가 없습니다</div>';
        }
      } catch(e) {
        listContainer.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--red); font-size:12px;">검색 실패</div>';
      }
    };

    container.querySelector('#btn-wf-back').onclick = showGenreSelect;
  }

  showSourceSelect();
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
  
  // 초기 셋업: 'trash' 타입을 가진 항목들은 기본적으로 제외 목록에 넣음
  let excludedIds = new Set(currentEntities.filter(e => e.type === 'trash' || e.importance === 'T').map(e => e.id));

  function updateList() {
    // 그룹화 로직
    const major = currentEntities.filter(e => ['person_major', 'person_minor'].includes(e.type) && e.importance !== 'T');
    const others = currentEntities.filter(e => ['group', 'location', 'object'].includes(e.type) && e.importance !== 'T');
    const trash = currentEntities.filter(e => e.type === 'trash' || e.importance === 'T' || e.type === 'unknown');

    const renderRow = (e) => {
      const isExcluded = excludedIds.has(e.id);
      return `
        <div class="wf-entity-row ${isExcluded ? 'excluded' : ''}" data-id="${e.id}">
          <div class="wf-entity-main">
            <div class="wf-entity-name">
              ${e.canonical_name || e.name || e.id}
              <span class="wf-entity-type-badge">${e.type}</span>
            </div>
            <div class="wf-entity-aliases">${Array.isArray(e.aliases) ? e.aliases.join(', ') : (e.aliases || '')}</div>
          </div>
          <div class="wf-entity-actions">
            ${isExcluded 
              ? `<button class="btn-wf-sm" data-action="restore">복구</button>`
              : `<button class="btn-wf-sm danger" data-action="exclude">제외</button>`
            }
          </div>
        </div>
      `;
    };

    container.innerHTML = `
      <div class="wf-card-h">👥 등장인물 및 엔티티 정제</div>
      <p style="font-size:12px; color:var(--ink2); margin-bottom:1.5rem;">
        작품에서 식별된 요소들입니다. 성격에 맞는 그룹으로 분류했습니다. 불필요한 노이즈나 워터마크는 <b>제외</b>해 주세요.
      </p>

      <div class="wf-entity-sections">
        ${major.length > 0 ? `
          <div class="wf-entity-section">
            <div class="field-label">주요 인물 (${major.length})</div>
            <div class="wf-entity-list">${major.map(renderRow).join('')}</div>
          </div>
        ` : ''}

        ${others.length > 0 ? `
          <div class="wf-entity-section" style="margin-top:1.5rem;">
            <div class="field-label">배경 및 기타 요소 (${others.length})</div>
            <div class="wf-entity-list">${others.map(renderRow).join('')}</div>
          </div>
        ` : ''}

        ${trash.length > 0 ? `
          <div class="wf-entity-section" style="margin-top:1.5rem;">
            <div class="field-label" style="color:var(--red);">불필요 항목 감지 (${trash.length})</div>
            <div class="wf-entity-list trash-list">${trash.map(renderRow).join('')}</div>
          </div>
        ` : ''}
      </div>

      <div class="wf-actions">
        <button class="btn-wf-primary" id="btn-wf-confirm">구성 완료 →</button>
      </div>
    `;

    container.querySelectorAll('.btn-wf-sm').forEach(btn => {
      btn.onclick = () => {
        const id = btn.closest('.wf-entity-row').dataset.id;
        if (btn.dataset.action === 'exclude') excludedIds.add(id);
        else excludedIds.delete(id);
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
    { id: 'semi_realistic_anime', name: '세미리얼 애니', desc: '현대적이고 깔끔한 화풍', img: 'https://images.unsplash.com/photo-1580477667995-2b94f01c9516?q=80&w=400&auto=format&fit=crop' },
    { id: 'webtoon_korean', name: '한국 웹툰풍', desc: '대조가 명확하고 화려한 스타일', img: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=400&auto=format&fit=crop' },
    { id: 'classic_watercolor', name: '클래식 수채화', desc: '고전 소설에 어울리는 부드러운 화풍', img: 'https://images.unsplash.com/photo-1549490349-8643362247b5?q=80&w=400&auto=format&fit=crop' },
    { id: 'cyberpunk_noir', name: '사이버펑크 누아르', desc: '강렬한 조명과 어두운 분위기', img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=400&auto=format&fit=crop' }
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
      <button class="btn-wf-primary" id="btn-wf-confirm">스타일 확정 및 마스터 생성 →</button>
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
 * 최종 계획 확인 카드 (리딩 플랜 점검)
 */
function renderPlanConfirmCard(container, data, resolve) {
  const { sceneCount, characterCount } = data;

  container.innerHTML = `
    <div class="wf-card-h">🗺️ 리딩 플랜 최종 확인</div>
    <div style="background:var(--paper2); padding:1.5rem; border-radius:12px; margin-bottom:1.5rem;">
      <div style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:1rem;">
        <span style="color:var(--ink3); font-size:13px;">생성 모드</span>
        <span style="font-weight:700; color:var(--ink);">${state.selectedMode === 'adventure' ? '⚔ 서사 액션' : '🎭 비주얼 노벨'}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:1rem;">
        <span style="color:var(--ink3); font-size:13px;">전개 밀도</span>
        <span style="font-weight:700; color:var(--ink);">${sceneCount}개 장면 구성</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:1rem; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:1rem;">
        <span style="color:var(--ink3); font-size:13px;">핵심 인물</span>
        <span style="font-weight:700; color:var(--ink);">${characterCount}명 마스터 포트레이트</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:var(--ink3); font-size:13px;">시각 스타일</span>
        <span style="font-weight:700; color:var(--gold);">${state.userDecisions?.visualStyle?.profile === 'webtoon_korean' ? '한국 웹툰풍' : '세미리얼 애니'}</span>
      </div>
    </div>
    <div class="wf-actions">
      <button class="btn-wf-primary" id="btn-wf-confirm">리딩 생성 시작 →</button>
      <button class="btn-wf-secondary" id="btn-wf-cancel" style="margin-top:0.5rem; background:none; border:none; color:var(--ink3); cursor:pointer; font-size:12px;">취소하고 처음으로</button>
    </div>
  `;

  container.querySelector('#btn-wf-confirm').onclick = () => resolve(true);
  container.querySelector('#btn-wf-cancel').onclick = () => resolve(false);
}
