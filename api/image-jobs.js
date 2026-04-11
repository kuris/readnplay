import { list, put } from '@vercel/blob';

const JOBS_FILENAME = 'readplay-jobs-queue.json';

/**
 * 작업을 관리하는 메인 핸들러
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Vercel Blob 토큰 체크 추가
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('Missing BLOB_READ_WRITE_TOKEN in Environment Variables');
      return res.status(500).json({ error: '서버 설정 오류: BLOB_READ_WRITE_TOKEN이 부족합니다.', stage: 'token_check' });
    }

    let blobs;
    try {
      const listRes = await list();
      blobs = listRes.blobs;
    } catch (listErr) {
       console.error('Blob List Error:', listErr);
       return res.status(500).json({ error: 'Blob 목록 조회 실패', details: listErr.message, stage: 'list_blobs' });
    }

    const existingBlob = blobs.find(b => b.pathname === JOBS_FILENAME);
    let jobs = [];

    if (existingBlob) {
      try {
        const fetchUrl = `${existingBlob.url}?t=${Date.now()}`;
        const resp = await fetch(fetchUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        jobs = Array.isArray(data) ? data : [];
      } catch (jsonErr) {
        console.error('Jobs JSON Fetch/Parse Error:', jsonErr);
        // JSON 파싱 실패 시 빈 배열로 시작 (중요 데이터 유실 방지는 차후 과제)
        jobs = [];
      }
    }

    // --- CASE 1: 작업 생성 (POST) ---
    if (req.method === 'POST') {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: '잘못된 요청 본문입니다.', stage: 'body_check' });
      }

      const { prompt, sdUrl, metadata } = body;
      const newJob = {
        id: 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        prompt: prompt || 'no prompt',
        sdUrl: sdUrl || '',
        metadata: metadata || {},
        status: 'pending',
        resultUrl: null,
        createdAt: new Date().toISOString()
      };
      
      jobs.push(newJob);
      try {
        await saveJobs(jobs);
        return res.status(201).json(newJob);
      } catch (saveErr) {
        console.error('Save Jobs Error:', saveErr);
        return res.status(500).json({ error: '작업 데이터 저장 실패', details: saveErr.message, stage: 'save_jobs' });
      }
    }

    // --- CASE 2: 작업 조회 (GET) ---
    if (req.method === 'GET') {
      const { status, id } = req.query;
      
      // 특정 ID 조회
      if (id) {
        const job = jobs.find(j => j.id === id);
        if (!job) {
          return res.status(404).json({ 
            error: 'Job not found', 
            jobId: id,
            totalJobs: jobs.length,
            message: '작업이 아직 동기화되지 않았을 수 있습니다. 잠시 후 다시 시도하세요.'
          });
        }
        return res.status(200).json(job);
      }

      // 상태별 조회 (워커용)
      if (status) {
        const filtered = jobs.filter(j => j.status === status);
        return res.status(200).json(status === 'pending' ? (filtered[0] || null) : filtered);
      }

      return res.status(200).json(jobs.slice(-50));
    }

    // --- CASE 3: 작업 업데이트 (PATCH) ---
    if (req.method === 'PATCH') {
      const { id, status, resultUrl, error } = req.body;
      const index = jobs.findIndex(j => j.id === id);
      
      if (index === -1) return res.status(404).json({ error: 'Job not found' });
      
      // 명시적으로 전달된 값만 업데이트
      if (status !== undefined) jobs[index].status = status;
      if (resultUrl !== undefined) jobs[index].resultUrl = resultUrl;
      if (error !== undefined) jobs[index].error = error;
      jobs[index].updatedAt = new Date().toISOString();

      await saveJobs(jobs);
      return res.status(200).json(jobs[index]);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (e) {
    console.error('Jobs API Error:', e);
    return res.status(500).json({ error: e.message });
  }
}

/**
 * Blob에 작업 목록을 저장합니다 (전체 덮어쓰기 형식)
 */
async function saveJobs(jobs) {
  // 큐가 무한히 커지는 것을 방지 (최근 200개만 유지)
  const trimmed = jobs.slice(-200);
  await put(JOBS_FILENAME, JSON.stringify(trimmed, null, 2), {
    access: 'public',
    addRandomSuffix: false, // 파일명 고정
    allowOverwrite: true    // 덮어쓰기 허용 (필수)
  });
}
