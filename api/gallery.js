import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.rnp_SUPABASE_URL || process.env.NEXT_PUBLIC_rnp_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.rnp_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_KEY || 'placeholder');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Missing Supabase Credentials' });
    }

    // --- CASE 1: 갤러리 목록 가져오기 (GET) ---
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('readplay_history')
        .select('id, title, mode, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
        
      if (error) throw error;
      return res.status(200).json(data);
    }

    // --- CASE 2: 특정 게임 데이터 조회 (GET + ID) ---
    if (req.method === 'GET' && req.query.id) {
        const { data, error } = await supabase
          .from('readplay_history')
          .select('data')
          .eq('id', req.query.id)
          .single();
          
        if (error) throw error;
        return res.status(200).json(data.data);
    }

    // --- CASE 3: 게임 영구 저장 (POST) ---
    if (req.method === 'POST') {
      const { title, mode, gameData } = req.body;
      if (!title || !gameData) return res.status(400).json({ error: 'title and gameData are required' });
      
      const { data, error } = await supabase
        .from('readplay_history')
        .insert({
          title,
          mode,
          data: gameData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
        
      if (error) throw error;
      return res.status(200).json({ success: true, id: data.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Gallery API Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
