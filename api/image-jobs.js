import { list, put, del } from '@vercel/blob';

const JOBS_PREFIX = 'jobs/';

/**
 * 분산형 작업 큐 핸들러 (개별 파일 방식)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ error: 'Missing BLOB_READ_WRITE_TOKEN' });
    }

    // --- CASE 1: 작업 생성 (POST) ---
    if (req.method === 'POST') {
      const { prompt, sdUrl, metadata } = req.body;
      const id = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const newJob = {
        id,
        prompt: prompt || 'no prompt',
        sdUrl: sdUrl || '',
        metadata: metadata || {},
        status: 'pending',
        resultUrl: null,
        createdAt: new Date().toISOString()
      };
      
      // 개별 파일 생성: jobs/job_ID_pending.json
      await put(`${JOBS_PREFIX}${id}_pending.json`, JSON.stringify(newJob, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true
      });
      
      return res.status(201).json(newJob);
    }

    // --- CASE 2: 작업 조회 (GET) ---
    if (req.method === 'GET') {
      const { status, id } = req.query;
      
      // 특정 ID 조회
      if (id) {
        const { blobs } = await list({ prefix: `${JOBS_PREFIX}${id}_` });
        if (blobs.length === 0) return res.status(404).json({ error: 'Job not found' });
        
        // 상태 우선순위: done > processing > pending
        const priority = { 'done.json': 3, 'processing.json': 2, 'pending.json': 1, 'failed.json': 0 };
        const sortedBlobs = blobs.sort((a, b) => {
          const statusA = a.pathname.split('_').pop();
          const statusB = b.pathname.split('_').pop();
          return (priority[statusB] || 0) - (priority[statusA] || 0);
        });

        const blob = sortedBlobs[0];
        const resp = await fetch(`${blob.url}?t=${Date.now()}`);
        const job = await resp.json();
        return res.status(200).json(job);
      }

      // 상태별 조회 (워커가 pending 작업을 찾는 용도 등)
      if (status) {
        const { blobs } = await list({ prefix: JOBS_PREFIX });
        const filteredBlobs = blobs.filter(b => b.pathname.endsWith(`_${status}.json`));
        
        if (status === 'pending') {
          if (filteredBlobs.length === 0) return res.status(200).json(null);
          // 가장 오래된 작업 우선 반환 (Lexicographical order of job_TIMESTAMP)
          const resp = await fetch(`${filteredBlobs[0].url}?t=${Date.now()}`);
          const job = await resp.json();
          return res.status(200).json(job);
        }
        
        // 목록 전체 반환
        return res.status(200).json(filteredBlobs.map(b => ({ id: b.pathname.split('_')[1], url: b.url })));
      }

      return res.status(200).json({ message: 'Status or ID required' });
    }

    // --- CASE 3: 상태 업데이트 (PATCH) ---
    if (req.method === 'PATCH') {
      const { id, status, resultUrl, error } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'ID and status required' });

      // 1. 기존 상태 파일 찾기
      const { blobs } = await list({ prefix: `${JOBS_PREFIX}${id}_` });
      if (blobs.length === 0) return res.status(404).json({ error: 'Job not found for update' });

      const oldBlob = blobs[0];
      const resp = await fetch(`${oldBlob.url}?t=${Date.now()}`);
      const job = await resp.json();

      // 2. 데이터 업데이트
      job.status = status;
      if (resultUrl !== undefined) job.resultUrl = resultUrl;
      if (error !== undefined) job.error = error;
      job.updatedAt = new Date().toISOString();

      // 3. 새로운 상태 파일 생성
      await put(`${JOBS_PREFIX}${id}_${status}.json`, JSON.stringify(job, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true
      });

      // 4. 이전 상태 파일 삭제 (상태가 변경된 경우에만)
      const oldStatus = oldBlob.pathname.split('_').pop().replace('.json', '');
      if (oldStatus !== status) {
        await del(oldBlob.url);
      }

      return res.status(200).json(job);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (e) {
    console.error('Distributed Jobs API Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
