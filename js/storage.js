import { state } from './state.js';
import { $ } from './utils.js';

/**
 * 게임 진행 상황을 로컬 스토리지에 저장합니다.
 */
export function saveProgress() {
  if (!state.gameData) return;
  const saveData = {
    gameData: state.gameData,
    curIdx: state.curIdx,
    score: state.score,
    bookTitle: state.bookTitle,
    selectedMode: state.selectedMode,
    selectedLang: state.selectedLang,
    timestamp: Date.now()
  };
  localStorage.setItem('readplay_save', JSON.stringify(saveData));
}

/**
 * 로컬 스토리지에서 진행 상황을 불러옵니다.
 */
export function loadProgress() {
  const saved = localStorage.getItem('readplay_save');
  if (!saved) return false;
  try {
    const data = JSON.parse(saved);
    // 7일이 지난 세션은 무효화
    if (Date.now() - data.timestamp > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem('readplay_save');
      return false;
    }
    state.gameData = data.gameData;
    state.curIdx = data.curIdx;
    state.score = data.score;
    state.bookTitle = data.bookTitle;
    state.selectedMode = data.selectedMode;
    state.selectedLang = data.selectedLang;
    return true;
  } catch(e) { return false; }
}

/**
 * 저장된 세션을 삭제합니다.
 */
export function clearProgress() {
  localStorage.removeItem('readplay_save');
  const contSec = $('continue-section');
  if (contSec) contSec.style.display = 'none';
}

/**
 * 업로드된 EPUB 파일을 처리하여 텍스트를 추출합니다.
 */
export async function handleFile(file) {
  state.bookTitle = file.name.replace(/\.epub$/i, '');
  const fileNameLabel = $('file-name-label');
  if (fileNameLabel) fileNameLabel.textContent = file.name;
  const fileBadge = $('file-badge');
  if (fileBadge) fileBadge.classList.add('show');
  
  try {
    const zip = await JSZip.loadAsync(file);
    const chapters = [];
    zip.forEach((path, zf) => {
      if (!zf.dir && /\.(html|xhtml|htm)$/i.test(path)) {
        chapters.push({
          path: path,
          promise: zf.async('string').then(html => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('script,style,nav,aside').forEach(el => el.remove());
            return doc.body ? doc.body.innerText.replace(/\s+/g, ' ').trim() : '';
          })
        });
      }
    });
    const parts = await Promise.all(chapters.map(c => c.promise));
    const validParts = parts.filter(t => t.length > 100);
    state.epubText = validParts.join('\n\n');
    clearProgress(); // 새로운 파일을 올리면 기존 세션 초기화
    
    if (window.checkReady) window.checkReady();
  } catch(e) { 
    alert('epub 파싱 실패: ' + e.message); 
  }
}
