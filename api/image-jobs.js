import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.rnp_SUPABASE_URL,
  process.env.rnp_SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Supabase DB 기반 작업 큐 핸들러
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!process.env.rnp_SUPABASE_URL || !process.env.rnp_SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Missing Supabase Credentials' });
    }

    // --- CASE 1: 작업 생성 (POST) ---
    if (req.method === 'POST') {
      const { prompt, sdUrl, metadata } = req.body;
      const id = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      
      const newJob = {
        id,
        prompt: prompt || 'no prompt',
        sd_url: sdUrl || '',
        metadata: metadata || {},
        status: 'pending',
        result_url: null,
        created_at: new Date().toISOString()
      };
      
      const { error } = await supabase.from('image_jobs').insert([newJob]);
      if (error) throw error;
      
      return res.status(201).json(newJob);
    }

    // --- CASE 2: 작업 조회 (GET) ---
    if (req.method === 'GET') {
      const { status, id } = req.query;
      
      if (id) {
        const { data, error } = await supabase
          .from('image_jobs')
          .select('*')
          .eq('id', id)
          .single();
          
        if (error || !data) return res.status(404).json({ error: 'Job not found' });
        return res.status(200).json(data);
      }

      if (status) {
        let query = supabase.from('image_jobs').select('*').eq('status', status);
        
        if (status === 'pending') {
          // 가장 오래된 것 하나만 반환 (FIFO)
          query = query.order('created_at', { ascending: true }).limit(1);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        return res.status(200).json(status === 'pending' ? (data[0] || null) : data);
      }

      return res.status(400).json({ error: 'Status or ID required' });
    }

    // --- CASE 3: 상태 업데이트 (PATCH) ---
    if (req.method === 'PATCH') {
      const { id, status, resultUrl, error: jobError } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'ID and status required' });

      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };
      if (resultUrl !== undefined) updateData.result_url = resultUrl;
      if (jobError !== undefined) updateData.error = jobError;

      const { data, error } = await supabase
        .from('image_jobs')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (e) {
    console.error('Supabase Jobs API Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
