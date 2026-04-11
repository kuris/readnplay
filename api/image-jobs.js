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
    const { blobs } = await list();
    const existingBlob = blobs.find(b => b.pathname === JOBS_FILENAME);
    let jobs = [];

    if (existingBlob) {
      const resp = await fetch(existingBlob.url);
      jobs = await resp.json();
    }

    // --- CASE 1: 작업 생성 (POST) ---
    if (req.method === 'POST') {
      const { prompt, sdUrl, metadata } = req.body;
      const newJob = {
        id: 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        prompt,
        sdUrl,
        metadata: metadata || {},
        status: 'pending', // pending, processing, done, failed
        resultUrl: null,
        createdAt: new Date().toISOString()
      };
      
      jobs.push(newJob);
      await saveJobs(jobs);
      return res.status(201).json(newJob);
    }

    // --- CASE 2: 작업 조회 (GET) ---
    if (req.method === 'GET') {
      const { status, id } = req.query;
      
      // 특정 ID 조회
      if (id) {
        const job = jobs.find(j => j.id === id);
        return job ? res.status(200).json(job) : res.status(404).json({ error: 'Job not found' });
      }

      // 상태별 조회 (주로 워커가 pending을 가져갈 때 사용)
      if (status) {
        const filtered = jobs.filter(j => j.status === status);
        // 처리 효율을 위해 pending인 경우 가장 오래된 하나만 반환 가능
        return res.status(200).json(status === 'pending' ? (filtered[0] || null) : filtered);
      }

      // 전체 목록 (최근 50개만)
      return res.status(200).json(jobs.slice(-50));
    }

    // --- CASE 3: 작업 업데이트 (PATCH) ---
    if (req.method === 'PATCH') {
      const { id, status, resultUrl, error } = req.body;
      const index = jobs.findIndex(j => j.id === id);
      
      if (index === -1) return res.status(404).json({ error: 'Job not found' });
      
      jobs[index] = { 
        ...jobs[index], 
        status: status || jobs[index].status,
        resultUrl: resultUrl || jobs[index].resultUrl,
        error: error || jobs[index].error,
        updatedAt: new Date().toISOString()
      };

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
    addRandomSuffix: false // 파일명 고정
  });
}
