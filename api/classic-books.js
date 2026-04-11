export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const featuredBooks = [
      { id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen', lang: 'en', category: 'romance' },
      { id: 84, title: 'Frankenstein', author: 'Mary Shelley', lang: 'en', category: 'horror' },
      { id: 2701, title: 'Moby Dick', author: 'Herman Melville', lang: 'en', category: 'adventure' },
      { id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', lang: 'en', category: 'mystery' },
      { id: 11, title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', lang: 'en', category: 'fantasy' },
      { id: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', lang: 'en', category: 'classic' },
      { id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens', lang: 'en', category: 'historical' },
      { id: 1952, title: 'The Yellow Wallpaper', author: 'Charlotte Perkins Gilman', lang: 'en', category: 'short' },
      { id: 244, title: 'A Study in Scarlet', author: 'Arthur Conan Doyle', lang: 'en', category: 'mystery' },
      { id: 46, title: 'A Christmas Carol', author: 'Charles Dickens', lang: 'en', category: 'short' }
    ];

    // 현재 목록의 해시 또는 버전을 생성하여 클라이언트가 변경 사항을 감지할 수 있게 함
    const version = Buffer.from(JSON.stringify(featuredBooks)).toString('base64').substring(0, 16);

    return res.status(200).json({
      version,
      books: featuredBooks,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('Classic Books API Error:', e);
    return res.status(500).json({ error: '목록을 불러오는데 실패했습니다.' });
  }
}
