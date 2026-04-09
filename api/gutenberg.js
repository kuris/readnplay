export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id || isNaN(Number(id))) return res.status(400).json({ error: 'Invalid book ID' });

  const bookId = Number(id);
  const formats = [
    `https://www.gutenberg.org/files/${bookId}/${bookId}-0.txt`,
    `https://www.gutenberg.org/files/${bookId}/${bookId}.txt`,
    `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`,
  ];

  for (const url of formats) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'READPLAY/1.0 (educational use)' }
      });
      if (response.ok) {
        const text = await response.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(text);
      }
    } catch (e) {
      continue;
    }
  }

  return res.status(404).json({ error: '책을 불러올 수 없습니다. 다른 도서를 선택해주세요.' });
}
