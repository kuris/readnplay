import fs from 'fs';
import path from 'path';

// 임시 서버 캐싱 처리 (개발 환경 및 /tmp 쓰기 지원 서버리스용)
const FILE_PATH = path.join('/tmp', 'readplay_characters.json');

export default async function handler(req, res) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // JSON 파일 읽기 헬퍼
  const readData = () => {
    try {
      if (fs.existsSync(FILE_PATH)) {
        return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      }
    } catch (e) {
      console.error('File read error:', e);
    }
    return {};
  };

  // JSON 파일 쓰기 헬퍼
  const writeData = (data) => {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
  };

  if (req.method === 'GET') {
    const { bookId } = req.query;
    if (!bookId) return res.status(400).json({ error: 'bookId is required' });

    const data = readData();
    if (data[bookId]) {
      return res.status(200).json({ characters: data[bookId] });
    } else {
      return res.status(404).json({ message: 'Not found' });
    }
  }

  if (req.method === 'POST') {
    const { bookId, characters } = req.body;
    if (!bookId || !characters) return res.status(400).json({ error: 'bookId and characters are required' });

    const data = readData();
    data[bookId] = characters;
    writeData(data);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
