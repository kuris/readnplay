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
      return res.status(500).json({ error: 'Missing Supabase Credentials (URL or Key)' });
    }

    // --- CASE 1: 게임 저장 (POST) ---
    if (req.method === 'POST') {
      const { cacheKey, gameData } = req.body;
      if (!cacheKey || !gameData) return res.status(400).json({ error: 'cacheKey and gameData are required' });
      
      const { error } = await supabase
        .from('game_cache')
        .upsert({ key: cacheKey, data: gameData, updated_at: new Date().toISOString() });
        
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    
    // --- CASE 2: 게임 불러오기 (GET) ---
    if (req.method === 'GET') {
      const { cacheKey } = req.query;
      if (!cacheKey) return res.status(400).json({ error: 'cacheKey is required' });
      
      const { data, error } = await supabase
        .from('game_cache')
        .select('data')
        .eq('key', cacheKey)
        .single();
        
      if (error || !data) return res.status(200).json({ cached: false });
      return res.status(200).json({ cached: true, gameData: data.data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Supabase Game Save Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
