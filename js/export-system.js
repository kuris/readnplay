import { state } from './state.js';
import { log } from './utils.js';

/**
 * 게임의 모든 기록을 ZIP 파일로 패키징하여 다운로드합니다.
 */
export async function downloadGameZip() {
  const btn = document.getElementById('btn-zip-export');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '📦 패키징 중...';
    btn.disabled = true;
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder("readplay_export");
    
    folder.file("game_data.json", JSON.stringify(state.gameData, null, 2));
    
    const imgFolder = folder.folder("images");
    if (state.gameData.characters) {
      log('이미지 패키징 중...', 'warn');
      const fetchPromises = state.gameData.characters.map(async (char) => {
        if (char.avatar_url) {
          try {
            const res = await fetch(char.avatar_url);
            const blob = await res.blob();
            const ext = char.avatar_url.split('.').pop().split('?')[0] || 'jpg';
            char.temp_ext = ext;
            imgFolder.file(`${char.id}.${ext}`, blob);
          } catch (e) {
            console.error(`Failed to fetch image for ${char.name}`, e);
          }
        }
      });
      await Promise.all(fetchPromises);
    }

    const viewerHtml = `<!DOCTYPE html>...`; // (추후 긴 문자열은 별도 템플릿 처리 가능하나 일단 원본 유지)
    // 원본의 viewerHtml 로직을 그대로 가져오되 state와 연동
    folder.file("index.html", generateViewHtml());

    log('ZIP 파일 생성 중...');
    const content = await zip.generateAsync({type:"blob"});
    const safeTitle = (state.gameData.title || 'game').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `READPLAY_${safeTitle}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    
    if (btn) btn.innerHTML = '✅ 다운로드 완료';
    setTimeout(() => {
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }, 3000);
  } catch (err) {
    console.error(err);
    alert('ZIP 생성 중 오류가 발생했습니다.');
    if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
  }
}

function generateViewHtml() {
    // 원본 index.html에 있던 뷰어 템플릿 복제
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${state.gameData.title_ko || state.gameData.title} - READPLAY 독서 기록</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #fdfaf6; color: #1a1714; }
    h1 { border-bottom: 2px solid #b8860b; padding-bottom: 10px; }
    .scene { background: #fff; border: 1px solid #e0d8cc; border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
    .scene-header { background: #1a1714; color: #f2e9dc; padding: 8px 15px; font-size: 13px; }
    .scene-body { padding: 20px; line-height: 1.8; }
    .character-list { display: flex; gap: 15px; margin: 20px 0; flex-wrap: wrap; }
    .char-card { text-align: center; font-size: 12px; width: 80px; }
    .char-card img { width: 60px; height: 60px; border-radius: 50%; border: 2px solid #b8860b; object-fit: cover; }
  </style>
</head>
<body>
  <h1>${state.gameData.title_ko || state.gameData.title}</h1>
  <p>모드: ${state.selectedMode} | 생성일: ${new Date().toLocaleDateString()}</p>
  
  <div class="character-list">
    ${(state.gameData.characters || []).map(c => `
      <div class="char-card">
        <img src="images/${c.id}.${c.temp_ext || 'jpg'}" onerror="this.src='https://via.placeholder.com/60'">
        <div style="margin-top:5px; font-weight:bold;">${c.name}</div>
      </div>
    `).join('')}
  </div>

  <h2>플레이 기록</h2>
  ${state.gameData.scenes.map((s, idx) => `
    <div class="scene">
      <div class="scene-header">SCENE ${idx + 1} - ${s.id}</div>
      <div class="scene-body">
        ${s.narrative || ''}
        ${s.script ? s.script.map(l => `<p><strong>${l.speaker}:</strong> ${l.text}</p>`).join('') : ''}
      </div>
    </div>
  `).join('')}
</body>
</html>`;
}

export function saveGameAsHTML() {
  const title = state.gameData.title_ko || state.gameData.title || state.bookTitle;
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
  const modeLabel = { adventure: '주인공 빙의', quiz: '독해 퀴즈', study: '기술 학습', visual_novel: '비주얼 노벨' }[state.gameData.mode] || state.gameData.mode;
  const scoreHTML = (state.gameData.mode === 'quiz' || state.score > 0)
    ? `<div class="score-badge">${state.score}점</div>` : '';

  const scenesHTML = state.gameData.scenes.map((scene) => {
    const ko = scene.narrative || '';
    const en = scene.en_narrative || '';
    const hasKo = ko.trim().length > 0;
    const hasEn = en.trim().length > 0;
    const hasBoth = hasKo && hasEn;

    const choicesHTML = (scene.choices || []).map((c, ci) => {
      const koText = c.text || '';
      const enText = c.en_text || '';
      return `
        <div class="choice-row">
          ${koText ? `<span class="lang-tag ko-tag">KO</span><span class="choice-text">${koText}</span>` : ''}
          ${enText ? `<span class="lang-tag en-tag">EN</span><span class="choice-text en-text">${enText}</span>` : ''}
        </div>`;
    }).join('');

    const quizHTML = scene.quiz ? `
      <div class="scene-quiz">
        <span class="lang-tag quiz-tag">QUIZ</span> ${scene.quiz.question}
        <div class="quiz-choices">${(scene.quiz.choices || []).map((ch, i) =>
          `<span class="quiz-opt">${'①②③④'[i]} ${ch}</span>`).join('')}
        </div>
      </div>` : '';

    return `
    <div class="scene-card">
      <div class="scene-header">
        <span>SCENE ${scene.id}</span>
        <span class="scene-ctx-label">${scene.context || ''}</span>
      </div>
      <div class="scene-body">
        ${hasKo ? `
          <div class="lang-block">
            <div class="lang-block-head"><span class="lang-tag ko-tag">한국어</span></div>
            <div class="scene-text">${ko}</div>
          </div>` : ''}
        ${hasEn ? `
          <div class="lang-block">
            <div class="lang-block-head"><span class="lang-tag en-tag">English</span></div>
            <div class="scene-text en-text">${en}</div>
          </div>` : ''}
        ${hasBoth ? `
          <div class="lang-block bilingual-block">
            <div class="lang-block-head"><span class="lang-tag bi-tag">한/영 병행</span></div>
            <div class="bilingual-grid">
              <div class="scene-text">${ko}</div>
              <div class="scene-text en-text">${en}</div>
            </div>
          </div>` : ''}
        ${scene.original_excerpt ? `<div class="scene-orig">"${scene.original_excerpt}"</div>` : ''}
        ${choicesHTML ? `<div class="choices-section"><div class="choices-label">선택지</div>${choicesHTML}</div>` : ''}
        ${quizHTML}
      </div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — READPLAY 완독 기록</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --ink: #1a1714; --ink2: #4a4540; --ink3: #8a837a;
  --paper: #f5f0e8; --paper2: #ede8de; --paper3: #e3ddd2;
  --gold: #b8860b; --gold-light: #f0d060; --green: #1a5c3a;
  --border: rgba(26,23,20,0.15); --border2: rgba(26,23,20,0.25);
  --ff-serif: 'Playfair Display', Georgia, serif;
  --ff-mono: 'IBM Plex Mono', monospace;
  --radius: 4px;
}
body {
  background: var(--paper); color: var(--ink);
  font-family: var(--ff-mono); min-height: 100vh;
  background-image: repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(26,23,20,0.04) 28px);
}
.page { max-width: 680px; margin: 0 auto; padding: 3rem 1.5rem; }
.complete-banner {
  text-align: center; padding: 2rem 1rem;
  border-bottom: 1px solid var(--border2); margin-bottom: 2.5rem;
  position: relative;
}
.complete-banner::after {
  content: '◆'; position: absolute; bottom: -0.6rem; left: 50%;
  transform: translateX(-50%); background: var(--paper);
  padding: 0 0.75rem; color: var(--gold); font-size: 12px;
}
.badge {
  display: inline-block; background: var(--ink); color: var(--gold-light);
  font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.2em;
  text-transform: uppercase; padding: 4px 12px; border-radius: 20px;
  margin-bottom: 1rem;
}
.book-title {
  font-family: var(--ff-serif); font-size: 2rem;
  color: var(--ink); margin-bottom: 0.4rem; line-height: 1.2;
}
.meta { font-size: 11px; color: var(--ink3); letter-spacing: 0.08em; margin-bottom: 1rem; }
.score-badge {
  font-family: var(--ff-serif); font-size: 2.5rem;
  color: var(--gold); font-weight: 600; margin-top: 1rem;
}
.section-label {
  font-size: 10px; color: var(--ink3); letter-spacing: 0.2em;
  text-transform: uppercase; margin-bottom: 1rem;
  padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);
}
.scene-card {
  border: 1px solid var(--border2); border-radius: var(--radius);
  overflow: hidden; margin-bottom: 1rem; background: var(--paper2);
}
.scene-header {
  background: var(--ink); color: var(--gold-light);
  font-size: 10px; letter-spacing: 0.2em; padding: 6px 14px;
  display: flex; justify-content: space-between;
}
.scene-ctx-label { color: var(--ink3); font-size: 10px; }
.scene-body { padding: 0; }
.scene-text {
  font-family: var(--ff-serif); font-size: 14px; line-height: 1.9;
  color: var(--ink); padding: 0.75rem 1.25rem;
}
.scene-orig {
  font-family: var(--ff-serif); font-style: italic; font-size: 12px;
  color: var(--ink2); border-left: 3px solid var(--gold);
  padding: 0.5rem 1rem; margin: 0 1rem 1rem; opacity: 0.8;
}
.scene-quiz {
  font-size: 11px; color: var(--ink3); padding: 0.75rem 1.25rem; background: rgba(139,32,32,0.04); border-top: 1px solid var(--border);
}
.footer {
  text-align: center; margin-top: 3rem; padding-top: 2rem;
  border-top: 1px solid var(--border2); font-size: 10px;
  color: var(--ink3); letter-spacing: 0.1em;
}
.lang-block { padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border); }
.lang-tag {
  display: inline-block; font-size: 9px; letter-spacing: 0.12em;
  text-transform: uppercase; padding: 2px 8px; border-radius: 10px;
  font-family: var(--ff-mono); font-weight: 500;
}
.ko-tag { background: rgba(26,92,58,0.12); color: #1a5c3a; }
.en-tag { background: rgba(26,23,20,0.08); color: var(--ink2); }
.bi-tag { background: rgba(184,134,11,0.12); color: var(--gold); }
.quiz-tag { background: rgba(139,32,32,0.12); color: #8b2020; }
.bilingual-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.en-text { font-style: italic; color: var(--ink2); }
.choices-section { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border); background: var(--paper3); }
.choices-label { font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--ink3); margin-bottom: 0.5rem; }
.choice-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 5px 0; border-bottom: 1px dashed var(--border); }
.choice-row:last-child { border-bottom: none; }
.choice-text { font-size: 12px; color: var(--ink); }
.quiz-choices { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 0.5rem; }
.quiz-opt { font-size: 11px; color: var(--ink2); background: var(--paper3); padding: 3px 10px; border-radius: 4px; }
</style>
</head>
<body>
<div class="page">
  <div class="complete-banner">
    <div class="badge">✦ READPLAY — 게임 완료</div>
    <div class="book-title">${title}</div>
    <div class="meta">${modeLabel} · ${state.gameData.scenes.length}씬 완료</div>
    ${scoreHTML}
  </div>
  <div class="section-label">플레이 기록 — 전체 ${state.gameData.scenes.length}씬</div>
  ${scenesHTML}
  <div class="footer">READPLAY — Generated on ${new Date().toLocaleDateString('ko-KR')}</div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `READPLAY_${safeTitle}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveGameAsText() {
  const title = state.gameData.title_ko || state.gameData.title || state.bookTitle;
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
  const modeLabel = { adventure: '주인공 빙의', quiz: '독해 퀴즈', study: '기술 학습', visual_novel: '비주얼 노벨' }[state.gameData.mode] || state.gameData.mode;
  const date = new Date().toLocaleDateString('ko-KR');

  let txt = `══════════════════════════════════════\n`;
  txt += `  READPLAY — 완독 기록\n`;
  txt += `  ${title}\n`;
  txt += `  모드: ${modeLabel} | 씬: ${state.gameData.scenes.length}개 | 날짜: ${date}\n`;
  if (state.score > 0) txt += `  최종 점수: ${state.score}점\n`;
  txt += `══════════════════════════════════════\n\n`;

  state.gameData.scenes.forEach((scene) => {
    txt += `[SCENE ${scene.id}] ${scene.context || ''}\n`;
    txt += `${'─'.repeat(40)}\n`;
    if (scene.narrative) txt += `▶ ${scene.narrative}\n`;
    if (scene.en_narrative) txt += `▶ ${scene.en_narrative}\n`;
    if (scene.original_excerpt) txt += `\n"${scene.original_excerpt}"\n`;
    if (scene.choices?.length) {
      txt += `\n선택지:\n`;
      scene.choices.forEach((c, ci) => {
        const risk = c.risk_level === 'high' ? '★★★' : c.risk_level === 'low' ? '★☆☆' : '★★☆';
        txt += `  ${ci + 1}. ${c.text || ''}`;
        if (c.risk_level) txt += ` [${risk}]`;
        if (c.score_impact) txt += ` (${c.score_impact > 0 ? '+' : ''}${c.score_impact}점)`;
        txt += `\n`;
      });
    }
    if (scene.quiz) {
      txt += `\n퀴즈: ${scene.quiz.question}\n`;
      (scene.quiz.choices || []).forEach((ch, ci) => txt += `  ${'①②③④'[ci]} ${ch}\n`);
    }
    txt += `\n`;
  });

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `READPLAY_${safeTitle}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function shareResults() {
  const shareText = `📖 READPLAY로 "${state.gameData.title_ko || state.gameData.title || state.bookTitle}" 완독!\n` +
    `${state.gameData.mode === 'quiz' ? `점수: ${state.score}점` : '인터랙티브 독서 완료'}\n` +
    `#READPLAY #인터랙티브독서 #AI독서`;
  
  if (navigator.share) {
    navigator.share({ title: 'READPLAY 완독', text: shareText, url: window.location.href });
  } else {
    navigator.clipboard.writeText(shareText);
    alert('결과가 클립보드에 복사되었습니다!');
  }
}

