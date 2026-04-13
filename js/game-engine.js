import { state } from './state.js';
import { $, ensureString, log } from './utils.js';
import { showScreen, updateLangTabs, updateBackdrop, animateScore, showRelationshipPopup, applyBackdrop } from './ui-manager.js';
import { saveProgress, clearProgress, saveToGallery } from './storage.js';
import { safeFetchImagen } from './api-service.js';
import { buildDrawThingsPrompt } from './prompt-engine.js';

export function startGame() {
  state.score = 0;
  state.curIdx = 0;
  state.activeLang = 'ko';
  state.characterRelationships = {};
  state.gameStartTime = Date.now();
  
  // 리더 전용 초기화
  state.isSourceVisible = false;
  state.activeSidePanel = null;
  
  document.body.classList.add('mode-vn'); // 리더는 항상 시네마틱 모드 기반
  document.body.classList.remove('is-ending');
  
  const rawTitle = state.selectedLang === 'en' ? state.gameData.title : (state.gameData.title_ko || state.gameData.title);
  const titleEl = $('g-title');
  if (titleEl) titleEl.textContent = ensureString(rawTitle || state.bookTitle);
  
  // 리더 상호작용 바인딩
  initReaderControls();
  
  showScreen('game');
  setTimeout(() => {
    renderScene();
    saveToGallery().catch(e => console.warn('Early save failed:', e));
  }, 100);
}

/**
 * 리더 대시보드 컨트롤 이벤트 바인딩
 */
function initReaderControls() {
  const btnInfo = $('btn-side-info');
  const btnChars = $('btn-side-chars');
  const btnTime = $('btn-side-time');
  const btnClose = $('btn-close-side');
  const btnSource = $('btn-toggle-source');

  if (btnInfo) btnInfo.onclick = () => toggleSidePanel('info');
  if (btnChars) btnChars.onclick = () => toggleSidePanel('characters');
  if (btnTime) btnTime.onclick = () => toggleSidePanel('timeline');
  if (btnClose) btnClose.onclick = () => toggleSidePanel(null);
  
  if (btnSource) {
    btnSource.onclick = () => {
      state.isSourceVisible = !state.isSourceVisible;
      btnSource.classList.toggle('active', state.isSourceVisible);
      renderScene(); // 다시 렌더링하여 뷰 교체
    };
  }
}

/**
 * 사이드 패널 토글 및 렌더링
 */
function toggleSidePanel(type) {
  const panel = $('reader-side-panel');
  const btns = {
    info: $('btn-side-info'),
    characters: $('btn-side-chars'),
    timeline: $('btn-side-time')
  };

  if (state.activeSidePanel === type || type === null) {
    state.activeSidePanel = null;
    panel.classList.remove('active');
    Object.values(btns).forEach(b => b?.classList.remove('active'));
    return;
  }

  state.activeSidePanel = type;
  panel.classList.add('active');
  Object.entries(btns).forEach(([k, b]) => b?.classList.toggle('active', k === type));
  
  renderSidePanelContent(type);
}

function renderSidePanelContent(type) {
  const title = $('sp-title');
  const content = $('sp-content');
  const scene = state.gameData.scenes[state.curIdx];

  if (type === 'info') {
    title.textContent = '장면 정보';
    content.innerHTML = `
      <div class="meta-card">
        <div class="meta-label">Title</div>
        <div class="meta-value">${scene.title}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Setting</div>
        <div class="meta-value">${scene.setting || '정보 없음'}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Time Context</div>
        <div class="meta-value">${scene.time_context || '현재'}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Narrative Role</div>
        <div class="meta-value">${scene.narrative_function || '-'}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Emotions</div>
        <div>
          ${(scene.emotion_tags || []).map(t => `<span class="emotion-tag">${t}</span>`).join('')}
        </div>
      </div>
    `;
  } else if (type === 'characters') {
    title.textContent = '인물 사전';
    const participants = (state.gameData.characters || []).filter(c => 
      (scene.participants || []).includes(c.id) || (scene.current_characters || []).includes(c.id)
    );
    content.innerHTML = participants.map(c => `
      <div class="char-info-card" style="background:var(--paper2); padding:1rem; border-radius:10px; margin-bottom:1rem; border:1px solid var(--border)">
        <div style="display:flex; gap:12px; align-items:center; margin-bottom:8px;">
          <img src="${c.avatar_url}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid var(--gold)">
          <div>
            <div style="font-weight:700; font-size:14px;">${c.canonical_name || c.name}</div>
            <div style="font-size:10px; color:var(--ink3);">${c.aliases?.join(', ') || ''}</div>
          </div>
        </div>
        <div style="font-size:12px; color:var(--ink2); line-height:1.5;">${c.role_summary || c.summary || ''}</div>
      </div>
    `).join('') || '<p style="font-size:12px; color:var(--ink3); text-align:center;">이 장면에 등장하는 주요 인물이 없습니다.</p>';
  } else if (type === 'timeline') {
    title.textContent = '스토리 타임라인';
    content.innerHTML = state.gameData.scenes.map((s, i) => `
      <div class="tl-item ${i === state.curIdx ? 'current' : ''}" onclick="window.jumpToScene(${i})">
        <div class="tl-num">SCENE ${i + 1}</div>
        <div class="tl-title">${s.title}</div>
      </div>
    `).join('');
  }
}

window.jumpToScene = (idx) => {
  state.curIdx = idx;
  renderScene();
  if (state.activeSidePanel) renderSidePanelContent(state.activeSidePanel);
};

export function renderCharacterPanel() {
  const cont = $('character-panel');
  if (!cont || !state.gameData.characters) return;
  const charsWithImage = state.gameData.characters.filter(c => c.avatar_url);
  cont.innerHTML = charsWithImage.map(char => {
    const rel = state.characterRelationships[char.id] || 0;
    const displayRel = Math.max(0, Math.min(100, (rel + 100) / 2));
    return `
      <div class="char-card" id="char-card-${char.id}" data-char="${char.id}">
        <div class="char-avatar">
          <img src="${char.avatar_url}">
        </div>
        <div class="char-name">${ensureString(char.name)}</div>
        <div class="char-rel-bar">
          <div class="char-rel-fill" style="width: ${displayRel}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

export function renderScene() {
  if (!state.gameData || !state.gameData.scenes) {
    log('오류: 게임 데이터가 손상되었습니다. 다시 시도해 주세요.', 'err');
    showScreen('setup');
    return;
  }
  console.log(`[Engine] Rendering Scene ${state.curIdx + 1}`);
  const scene = state.gameData.scenes[state.curIdx];
  if (!scene) { 
    showEnding(); 
    return; 
  }
  
  saveProgress();
  
  // 0. 화면 가시성 통합 관리 (Visibility Heartbeat)
  const currentMode = state.gameData.mode || state.selectedMode || 'adventure';
  document.body.classList.toggle('mode-vn', currentMode === 'visual_novel');
  
  const advArea = $('adventure-area');
  const quizArea = $('quiz-area');
  const endingArea = $('ending-area');
  const gameScreen = $('screen-game');
  
  console.log(`[Diagnostic] Mode: ${currentMode}, BodyClasses: ${document.body.className}`);
  
  if (gameScreen) {
    gameScreen.style.setProperty('display', 'block', 'important');
    gameScreen.style.setProperty('opacity', '1', 'important');
    gameScreen.style.zIndex = '10000';
    console.log(`[Diagnostic] GameScreen styles: display=${gameScreen.style.display}, opacity=${gameScreen.style.opacity}`);
  }

  if (advArea) {
    advArea.style.setProperty('display', 'block', 'important');
    advArea.style.setProperty('opacity', '1', 'important');
    advArea.style.zIndex = '20000';
    const rect = advArea.getBoundingClientRect();
    console.log(`[Diagnostic] AdvArea: ${rect.width}x${rect.height} at pos(${rect.top},${rect.left})`);
  }

  // 0.1 브라우저 리플로우 강제 유도 (화면 깨움)
  void document.body.offsetHeight;

  const sceneEl = $('g-scene'); 
  if (quizArea) quizArea.style.display = 'none';
  if (endingArea) endingArea.style.display = 'none';

  // 안전장치: 현재 화면이 game이 아니면 강제 전환
  if (document.getElementById('screen-game') && !document.getElementById('screen-game').classList.contains('active')) {
    showScreen('game');
  }

  const total = state.gameData.scenes.length;
  const progFill = $('g-prog');
  if (progFill) progFill.style.width = Math.round(((state.curIdx + 1) / total) * 100) + '%';
  const chapEl = $('g-chap');
  if (chapEl) chapEl.textContent = (state.curIdx + 1) + ' / ' + total;
  const chapLabel = $('g-chapter-label');
  if (chapLabel) chapLabel.textContent = 'scene ' + ensureString(scene.id);
  const scoreEl = $('g-score');
  if (scoreEl) scoreEl.textContent = state.score;
  const ctxEl = $('g-context');
  if (ctxEl) ctxEl.textContent = ensureString(scene.context);

  // Cinematic Backdrop Update
  if (state.selectedMode === 'visual_novel' && scene.bg_keyword) {
    handleBackdropUpdate(scene.bg_keyword);
  }

  const speakerTag = $('speaker-tag');
  if (speakerTag) speakerTag.classList.remove('show');

  // 상호작용 초기화: 이전 씬이나 다른 모드에서의 설정을 리셋
  if (advArea) {
    advArea.onclick = null;
    advArea.style.cursor = 'default';
    advArea.style.pointerEvents = 'auto';
  }
  const choicesList = $('g-choices');
  if (choicesList) choicesList.style.display = 'flex';

  if (state.selectedMode === 'visual_novel' && (scene.script || scene.narrative)) {
    // scene.script가 없으면 narrative를 단일 스크립트로 변환하여 페이징 혜택을 받게 함
    if (!scene.script || scene.script.length === 0) {
      scene.script = [{ speaker: 'narrator', text: scene.narrative }];
    }
    // 🎭 비주얼 노벨 모드: 스텝 바이 스텝 (클릭 시 한 줄씩)
    if (sceneEl) sceneEl.innerHTML = '';
    let step = 0;
    let subStep = 0;
    let currentChunks = [];

    // 텍스트 분할 함수 (helper)
    const splitText = (text, maxLength = 180) => {
      if (!text) return [];
      const chunks = [];
      let temp = text;
      while (temp.length > 0) {
        if (temp.length <= maxLength) {
          chunks.push(temp);
          break;
        }
        let splitIdx = temp.lastIndexOf('.', maxLength);
        if (splitIdx < maxLength * 0.7) splitIdx = temp.lastIndexOf(' ', maxLength);
        if (splitIdx < maxLength * 0.5) splitIdx = maxLength;
        chunks.push(temp.substring(0, splitIdx).trim());
        temp = temp.substring(splitIdx).trim();
      }
      return chunks;
    };
    
    // 선택지 숨김
    if (choicesList) choicesList.style.display = 'none';

    const renderStep = () => {
      
      // 현재 대사의 남은 페이지가 있는지 확인
      if (currentChunks.length > 0 && subStep < currentChunks.length) {
        const chunk = currentChunks[subStep];
        if (sceneEl) sceneEl.innerHTML = `<div class="dialogue-line fadein">${chunk}</div>`;
        subStep++;
        return;
      }

      // 다음 스테이지로 이동
      if (currentChunks.length > 0 && subStep >= currentChunks.length) {
        step++;
        subStep = 0;
        currentChunks = [];
      }

      if (step >= scene.script.length) {
        const hasChoices = scene.choices && scene.choices.length > 0;
        if (hasChoices) {
          if (choicesList) {
            choicesList.style.display = 'flex';
          }
          if (advArea) {
            advArea.onclick = null;
            advArea.style.cursor = 'default';
            advArea.style.pointerEvents = 'none'; 
          }
        } else {
          // 선택지가 없는 경우 (마지막 장면이거나 단순 전개인 경우)
          // 한 번 더 클릭하면 다음으로 넘어가도록 유도
          const sceneEl = $('g-scene');
          if (sceneEl && !sceneEl.querySelector('.next-hint')) {
            const hint = document.createElement('div');
            hint.className = 'next-hint fadein';
            hint.style = 'font-size:12px; margin-top:10px; opacity:0.6; text-align:right; color:var(--gold);';
            hint.innerHTML = '클릭하여 계속... ▾';
            sceneEl.appendChild(hint);
          }
          
          if (advArea) {
            advArea.onclick = () => {
              state.curIdx++;
              renderScene();
            };
          }
        }
        return;
      }
      
      const line = scene.script[step];
      const text = ensureString(line.content || line.text || '');
      currentChunks = splitText(text);
      subStep = 0;
      
      // 첫 번째 페이지 렌더링
      const firstChunk = currentChunks[subStep] || '';
      const char = (state.gameData.characters || []).find(c => String(c.id) === String(line.speaker));
      const name = ensureString(char ? char.name : (line.speaker === 'narrator' ? '' : line.speaker));
      
      if (line.speaker !== 'narrator' && speakerTag) {
        speakerTag.textContent = name;
        speakerTag.classList.add('show');
      } else if (speakerTag) {
        speakerTag.classList.remove('show');
      }
      
      // 렌더링
      if (sceneEl) {
        const chunk = currentChunks[subStep] || '';
        const isNextPage = subStep < currentChunks.length - 1;
        
        // 원문 보기 모드일 경우 대사 영역 업데이트 방식 변경
        if (state.isSourceVisible) {
          const sv = $('source-viewer');
          const svBody = $('sv-body');
          if (sv) sv.style.display = 'block';
          if (svBody) svBody.textContent = scene.source_excerpt || '원문 정보를 가져오지 못했습니다.';
          if (sceneEl) sceneEl.style.display = 'none';
        } else {
          const sv = $('source-viewer');
          if (sv) sv.style.display = 'none';
          if (sceneEl) {
            sceneEl.style.display = 'block';
            sceneEl.innerHTML = `
              <div class="dialogue-line fadein ${line.speaker === 'narrator' ? 'is-narrator' : ''}">
                <span>${chunk}</span>
                ${isNextPage ? '<div style="font-size:12px; margin-top:10px; opacity:0.5; text-align:right;">▼</div>' : ''}
              </div>
            `;
          }
        }
      }
      subStep++;

      // 얼굴 이미지 처리 (첫 페이지에서만 또는 매 페이지 업데이트)
      const portraitArea = $('vn-portrait-area');
      if (portraitArea) {
        // 🎞️ 통합 장면(Scene) 이미지가 있을 경우 초상화 영역에 스타일 클래스 부여
        portraitArea.classList.toggle('is-scenic', !!scene.image_data);
        
        const char = (state.gameData.characters || []).find(c => String(c.id) === String(line.speaker));
        const avatarUrl = char ? (char.avatar_url || '') : '';
        
        if (avatarUrl) {
          portraitArea.style.display = 'flex';
          portraitArea.innerHTML = `<img src="${avatarUrl}" class="fadein" onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1f1f1f&fontFamily=Arial&fontSize=40&textColor=ffffff'">`;
          portraitArea.classList.remove('dim');
        } else if (line.speaker === 'narrator') {
          portraitArea.style.display = 'block';
          portraitArea.classList.add('dim');
        } else if (line.speaker !== 'system') {
          // 캐릭터 이미지가 없을 때 실루엣/이니셜 표시
          portraitArea.style.display = 'flex';
          portraitArea.innerHTML = `
            <div class="silhouette-placeholder fadein">
              <img src="https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1f1f1f&fontFamily=Arial&fontSize=40&textColor=ffffff" style="opacity: 0.6">
              <div class="placeholder-name">${name}</div>
            </div>
          `;
          portraitArea.classList.remove('dim');
        } else {
          portraitArea.style.display = 'none';
          portraitArea.innerHTML = '';
          portraitArea.classList.remove('dim');
        }
      }
    };

    if (advArea) {
      advArea.style.cursor = 'pointer';
      advArea.style.pointerEvents = 'auto'; // 새 장면 시작 시 클릭 활성화
      advArea.onclick = renderStep;
    }
    
    // 첫번째 대사 즉시 출력
    renderStep();
  } else {
    // ⚔️ 일반 모드들 Fallback (비주얼 노벨 모드는 위에서 script 통합 처리됨)
    const ko = scene.narrative || '';
    const en = scene.en_narrative || '';
    
    if (state.activeLang === 'bi' && ko && en) {
      if (sceneEl) sceneEl.innerHTML = `
        <div class="bilingual-scene">
          <div class="bi-col"><span class="bi-col-label">KO</span>${ko}</div>
          <div class="bi-col"><span class="bi-col-label">EN</span>${en}</div>
        </div>`;
    } else if (state.gameData.mode === 'study') {
      let narrative = state.activeLang === 'en' ? (en || ko) : ko;
      narrative = narrative.replace(/### (.*)/g, '<h3 style="font-size:1.1rem;margin:1.2rem 0 0.6rem;color:var(--gold)">$1</h3>')
                          .replace(/\*\*(.*)\*\*/g, '<strong style="color:var(--gold)">$1</strong>')
                          .replace(/`(.*)`/g, '<code style="background:var(--paper3);padding:2px 4px;border-radius:3px;font-family:var(--ff-mono);font-size:13px">$1</code>');
      if (sceneEl) sceneEl.innerHTML = narrative.replace(/\n/g, '<br>');
    } else {
      if (sceneEl) sceneEl.textContent = state.activeLang === 'en' ? (en || ko) : ko;
    }
  }

  if (state.activeSidePanel) renderSidePanelContent(state.activeSidePanel);

  // 비주얼 노벨 모드: 현재 씬 등장 캐릭터 하이라이트
  if (state.selectedMode === 'visual_novel' && scene.current_characters) {
    document.querySelectorAll('.char-card').forEach(card => {
      const cid = card.dataset.char;
      card.classList.toggle('active-in-scene', scene.current_characters.includes(cid));
    });
  }

  // [Reader] 원문 보기 초기화 (불필요한 기능 제거)

  if (currentMode === 'quiz' || (currentMode === 'study' && scene.quiz)) {
    if (quizArea) quizArea.style.display = 'block';
    renderQuiz(scene);
  } else if (currentMode === 'adventure' || currentMode === 'visual_novel') {
    if (advArea) {
      advArea.style.display = 'block';
      advArea.style.opacity = '1';
    }
    renderChoices(scene);
  } else if (currentMode === 'study') {
    if (advArea) {
      advArea.style.display = 'block';
      advArea.style.opacity = '1';
    }
    const cont = $('g-choices');
    if (cont) {
      cont.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.textContent = '다음 개념으로 →';
      btn.addEventListener('click', () => { state.curIdx++; renderScene(); });
      cont.appendChild(btn);
    }
  }
}

async function handleBackdropUpdate(keyword) {
  const scene = state.gameData.scenes[state.curIdx];
  let finalPrompt = "";
  let finalNegativePrompt = "";

  if (scene && scene.image_data) {
    // 🎭 비주얼 노벨 모드에서는 배경 자리에 인물과 상황이 포함된 '통합 장면'을 생성합니다.
    const mode = (state.selectedMode === 'visual_novel') ? 'scene' : 'backdrop';
    const drawPrompt = buildDrawThingsPrompt(scene.image_data, mode);
    finalPrompt = drawPrompt.prompt;
    finalNegativePrompt = drawPrompt.negative_prompt;
  } else {
    // Legacy Fallback
    finalPrompt = `${keyword}, cinematic landscape view, high-quality environmental concept art, detailed scenery, wide shot, looking into the distance, (strictly NO people, NO humans, NO characters), empty landscape, professional gaming background style, masterpiece`;
    finalNegativePrompt = "low quality, blurry, bad hands, extra fingers, text, watermark";
  }

  let url = `https://loremflickr.com/1280/720/${encodeURIComponent(keyword || 'landscape')}/all`;
  
  try {
    const data = await safeFetchImagen({
      prompt: finalPrompt,
      negativePrompt: finalNegativePrompt,
      aspectRatio: "16:9",
      numImages: 1
    });
    
    if (data) {
      const base64 = data.imageBinary || (data.images && data.images[0]);
      if (base64) {
        url = `data:image/jpeg;base64,${base64}`;
      }
    }
  } catch (e) {
    console.warn('Background generation failed', e);
  }
  
  applyBackdrop(url);
}

export function renderChoices(scene) {
  const cont = $('g-choices');
  if (!cont) return;
  cont.innerHTML = '';
  
  const choices = scene.choices || [];
  
  // 만약 선택지가 하나도 없다면 '다음 장면으로' 기본 버튼 생성
  if (choices.length === 0) {
    const btn = document.createElement('button');
    btn.className = 'choice choice-progression';
    btn.innerHTML = '<div class="choice-main">다음 장면으로 이동 →</div>';
    btn.onclick = () => { state.curIdx++; renderScene(); };
    cont.appendChild(btn);
    return;
  }

  choices.forEach(c => {
    const btn = document.createElement('button');
    const type = c.type || 'progression'; // 기본값은 진행
    btn.className = `choice choice-${type}`;
    
    const choiceContent = state.activeLang === 'en' ? (c.en_text || c.text) : c.text;
    btn.innerHTML = `<div class="choice-main">${type === 'exploration' ? '🔍 ' : ''}${choiceContent}</div>`;

    btn.addEventListener('click', () => {
      if (type === 'exploration') {
        const lowerText = choiceContent.toLowerCase();
        if (lowerText.includes('인물') || lowerText.includes('character')) toggleSidePanel('characters');
        else if (lowerText.includes('배경') || lowerText.includes('setting') || lowerText.includes('정보')) toggleSidePanel('info');
        else if (lowerText.includes('원문') || lowerText.includes('source')) {
          state.isSourceVisible = true;
          const btnSource = $('btn-toggle-source');
          if (btnSource) btnSource.classList.add('active');
          renderScene();
        } else {
          toggleSidePanel('info');
        }
      } else {
        cont.querySelectorAll('.choice').forEach(b => b.disabled = true);
        const out = document.createElement('div');
        out.className = 'outcome';
        const outcomeText = (state.activeLang === 'en' ? (c.en_outcome || c.outcome) : c.outcome) || '다음 장면으로 이동합니다.';
        out.innerHTML = `<span>→</span> ${outcomeText}`;
        cont.appendChild(out);
        
        setTimeout(() => {
          if (c.is_game_over) { showGameOver(outcomeText); return; }
          const rawNext = c.next ? c.next - 1 : state.curIdx + 1;
          state.curIdx = Math.max(rawNext, state.curIdx + 1);
          renderScene();
        }, 1000);
      }
    });
    cont.appendChild(btn);
  });
}

export function renderQuiz(scene) {
  const quiz = scene.quiz;
  if (!quiz) { 
    setTimeout(() => { state.curIdx++; renderScene(); }, 400); 
    return; 
  }
  const qText = $('q-text');
  if (qText) qText.textContent = quiz.question;
  const qRes = $('q-result');
  if (qRes) qRes.textContent = '';
  const cont = $('q-choices');
  if (!cont) return;
  cont.innerHTML = '';
  const choices = Array.isArray(quiz.choices) ? quiz.choices : [];
  if (choices.length === 0) {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = '확인했습니다 (계속하기) →';
    btn.addEventListener('click', () => {
      state.curIdx++;
      renderScene();
    });
    cont.appendChild(btn);
    return;
  }

  choices.forEach((ch, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = ['①','②','③','④'][i] + ' ' + ch;
    btn.addEventListener('click', () => {
      cont.querySelectorAll('.choice').forEach(b => b.disabled = true);
      const res = $('q-result');
      if (i === quiz.answer) {
        animateScore(10);
        if (res) {
          res.className = 'q-result-good';
          res.textContent = '✓ 정답! ' + (quiz.explanation || '');
        }
      } else {
        if (res) {
          res.className = 'q-result-bad';
          res.textContent = '✗ 오답. 정답: ' + (quiz.choices[quiz.answer] || '') + '  ' + (quiz.explanation || '');
        }
      }
      setTimeout(() => {
        state.curIdx = scene.next ? scene.next - 1 : state.curIdx + 1;
        renderScene();
      }, 2200);
    });
    cont.appendChild(btn);
  });
}

export function showGameOver(reason) {
  const advArea = $('adventure-area');
  const quizArea = $('quiz-area');
  if (advArea) advArea.style.display = 'none';
  if (quizArea) quizArea.style.display = 'none';
  const endArea = $('ending-area');
  if (endArea) endArea.style.display = 'grid';
  const progFill = $('g-prog');
  if (progFill) progFill.style.width = '100%';
  const ctxEl = $('g-context');
  if (ctxEl) ctxEl.textContent = '✗ GAME OVER';
  const sceneEl = $('g-scene');
  if (sceneEl) sceneEl.textContent = reason;
  
  const endTitle = $('ending-title');
  if (endTitle) endTitle.textContent = '게임 오버';
  const endSub = $('ending-sub');
  if (endSub) endSub.textContent = '다른 선택을 해보세요';
  const endScore = $('ending-score');
  if (endScore) {
    endScore.textContent = state.score + '점';
    endScore.style.display = 'block';
  }
  const endScoreLabel = $('ending-score-label');
  if (endScoreLabel) {
    endScoreLabel.textContent = '실패 점수';
    endScoreLabel.style.display = 'block';
  }

  injectFeedbackButtons();
}

export function showEnding() {
  // 진행 상황 삭제 전 히스토리에 기록 (엔딩 도달 기념)
  import('./storage.js').then(m => m.saveToHistory());
  
  clearProgress();
  document.body.classList.add('is-ending');

  // 모든 게임 구역 숨기기
  const hideList = [
    'adventure-area', 'quiz-area', 'game-masthead', 'progress-rail', 
    'lang-pill', 'character-panel', 'vn-portrait-area', 
    'orig-toggle', 'orig-box', 'landscape-prompt'
  ];
  hideList.forEach(id => {
    const el = $(id);
    if (el) el.style.display = 'none';
  });

  // 텍스트 영역 초기화
  const speakerTag = $('speaker-tag');
  if (speakerTag) speakerTag.classList.remove('show');
  const gScene = $('g-scene');
  if (gScene) gScene.innerHTML = '';
  const gChoices = $('g-choices');
  if (gChoices) gChoices.innerHTML = '';

  // 엔딩 영역 표시
  const endArea = $('ending-area');
  if (endArea) {
    endArea.style.display = 'grid';
    showFinalRelationships();
  }
  
  const progFill = $('g-prog');
  if (progFill) progFill.style.width = '100%';
  const ctxEl = $('g-context');
  if (ctxEl) ctxEl.textContent = '完';
  
  let finalTitle = '완독';
  let finalDesc = state.gameData.title_ko || state.gameData.title || state.bookTitle;

  if (state.selectedMode === 'visual_novel' && state.gameData.endings) {
    const bestEnding = state.gameData.endings.find(e => evaluateEndingCondition(e.condition));
    if (bestEnding) {
      finalTitle = bestEnding.title;
      finalDesc = bestEnding.description;
    }
  }

  const endTitle = $('ending-title');
  if (endTitle) endTitle.textContent = finalTitle;
  const endSub = $('ending-sub');
  if (endSub) endSub.textContent = finalDesc;

  if (state.gameData.mode === 'quiz' || (state.gameData.mode === 'study' && state.score > 0)) {
    const endScore = $('ending-score');
    if (endScore) {
      endScore.textContent = state.score + '점';
      endScore.style.display = 'block';
    }
    const endScoreLabel = $('ending-score-label');
    if (endScoreLabel) {
      endScoreLabel.textContent = '최종 점수';
      endScoreLabel.style.display = 'block';
    }
  }

  injectFeedbackButtons();

  // 스크롤 탑
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function evaluateEndingCondition(condition) {
  if (!condition) return true;
  try {
    const jsCondition = condition.replace(/([a-zA-Z0-9_]+)\s*([><]=?|==|!=)\s*(-?\d+)/g, 
      (match, id, op, val) => `(state.characterRelationships['${id}'] || 0) ${op} ${val}`);
    return eval(jsCondition);
  } catch(e) {
    console.error('Ending evaluation error:', e);
    return false;
  }
}

export function showFinalRelationships() {
  const endArea = $('ending-area');
  if (!endArea) return;
  const oldFinal = endArea.querySelector('.final-relationships');
  if (oldFinal) oldFinal.remove();

  const html = `
    <div class="final-relationships">
      <div class="fr-title">최종 인물 관계도</div>
      <div class="fr-grid">
        ${state.gameData.characters
          .filter(f => !f.name.includes('나')) // 플레이어 본인은 리포트에서 제외
          .map(f => {
          const rel = state.characterRelationships[f.id] || 0;
          const statusTxt = rel > 50 ? '운명적' : rel > 10 ? '우호적' : rel < -50 ? '적대적' : rel < -10 ? '냉담함' : '평범함';
          return `
            <div class="fr-card">
              <div class="fr-avatar">
                ${f.avatar_url ? `<img src="${f.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : ''}
              </div>
              <div class="fr-name">${f.name}</div>
              <div class="fr-status">${statusTxt} (${rel})</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  const div = document.createElement('div');
  div.innerHTML = html;
  endArea.appendChild(div.firstElementChild);
}

function injectFeedbackButtons() {
    // 윈도우 객체에 바인딩된 글로벌 함수들 사용 (main.js에서 정의 예정)
    const playTime = Math.round((Date.now() - state.gameStartTime) / 1000 / 60);
    const feedbackHTML = `
      <div class="feedback-inner">
        <div class="feedback-msg">
          ${playTime > 0 ? `${playTime}분 동안의 독서 체험이 어떠셨나요?` : '이번 독서 체험이 어떠셨나요?'}
        </div>
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 2rem;">
          <button class="btn-ghost" onclick="this.textContent='✅ 감사합니다!'; this.disabled=true">😍 최고</button>
          <button class="btn-ghost" onclick="this.textContent='✅ 감사합니다!'; this.disabled=true">😊 좋음</button>
          <button class="btn-ghost" onclick="this.textContent='✅ 감사합니다!'; this.disabled=true">😐 보통</button>
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="btn-start" id="btn-save-html" style="padding: 10px 16px; font-size: 11px; flex:1; min-width:120px;">
            💾 HTML 저장
          </button>
          <button class="btn-ghost" id="btn-save-txt" style="padding: 10px 16px; font-size: 11px; flex:1; min-width:120px;">
            📄 TXT 저장
          </button>
          <button class="btn-ghost" id="btn-share-results" style="padding: 10px 16px; font-size: 11px; flex:1; min-width:120px;">
            🔗 공유
          </button>
        </div>
        <div style="margin-top: 1rem;">
             <button class="btn-ghost" id="btn-zip-export" style="width:100%; background: var(--gold); color: #fff;">
                📂 전체 기록 ZIP 다운로드
             </button>
        </div>
        <div style="margin-top: 1.5rem; border-top: 1px dashed var(--border); padding-top: 1rem;">
             <button class="btn-ghost" id="btn-go-home" style="width:100%; border-color: var(--gold); color: var(--gold);">
                🏠 메인 화면으로 돌아가기
             </button>
        </div>
      </div>
    `;
    
    const endArea = $('ending-area');
    if (!endArea) return;
    const wrap = endArea.querySelector('.ending-wrap');
    if (!wrap) return;
    const oldFeedback = wrap.querySelector('.feedback-box');
    if (oldFeedback) oldFeedback.remove();

    const div = document.createElement('div');
    div.className = 'feedback-box fadein';
    div.innerHTML = feedbackHTML;
    wrap.appendChild(div);
    
    // 이벤트 리스너 나중에 바인딩 (main.js)
}
