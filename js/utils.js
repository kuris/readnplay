// 유틸리티 함수 모음
export const $ = id => document.getElementById(id);

export function ensureString(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    // 중첩된 객체(예: {ko: '제목'}) 대응
    return val.ko || val.text || val.name || val.title || JSON.stringify(val);
  }
  return String(val);
}

/**
 * 말뭉치가 잘린 JSON을 최대한 복구합니다 (중괄호/대괄호 닫기)
 */
export function repairJson(json) {
  let cleaned = json.trim();
  // 마크다운 코드 블록 제거
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(json)?/g, '').replace(/```/g, '').trim();
  }
  // 유효하지 않은 제어 문자 제거
  cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, " ");

  let stack = [];
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    
    if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
    if (char === '}' || char === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
    }
  }
  
  let repaired = cleaned;
  if (inString) repaired += '"';
  while (stack.length > 0) repaired += stack.pop();
  return repaired;
}

export function getStringHash(str) {
  let hash = 0;
  // 텍스트 전체를 해싱하면 비용이 크므로 앞부분 10,000자만 사용
  const target = str.slice(0, 10000);
  for (let i = 0; i < target.length; i++) {
    hash = ((hash << 5) - hash) + target.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export function chunkTextIntoSegments(chapters, maxChars) {
  const segments = [];
  let currentSegment = '';
  for (const chapter of chapters) {
    if (currentSegment.length + chapter.length < maxChars) {
      currentSegment += '\n\n' + chapter;
    } else {
      if (currentSegment) segments.push(currentSegment);
      currentSegment = chapter;
    }
  }
  if (currentSegment) segments.push(currentSegment);
  return segments;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function log(msg, cls = '') {
  const el = $('log');
  if (!el) {
    console.log(`[Log] ${msg}`);
    return;
  }
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = msg;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
}
