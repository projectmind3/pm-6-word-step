import { client, fail, validateIdentity } from './_lib/data.mjs';

function csvField(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(res, identity, rows) {
  const headers = ['英単語', '日本語の意味', '中国語の意味', '発音', '例文', '学習状態'];
  const lines = [headers, ...rows.map((row) => [
    row.english,
    row.japanese,
    row.chinese,
    row.phonetic,
    row.example,
    Number(row.learned) === 1 ? '学習済み' : '未学習'
  ])].map((line) => line.map(csvField).join(','));
  const date = new Date().toISOString().slice(0, 10);
  const filename = `word-step-${identity}-backup-${date}.csv`;
  return res.status(200)
    .setHeader('Content-Type', 'text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    .end(`\uFEFF${lines.join('\r\n')}\r\n`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'method not allowed');
  const { identity } = req.query ?? {};
  if (!validateIdentity(identity)) return fail(res, 400, 'identity must be dad, mom, or uu');
  try {
    const result = await client.execute({
      sql: `SELECT dw.word_id, MAX(dw.learned) AS learned, w.english, w.japanese, w.chinese, w.phonetic, w.example
        FROM daily_words AS dw
        JOIN words AS w ON w.id = dw.word_id
        WHERE dw.identity = ?
      GROUP BY dw.word_id, w.english, w.japanese, w.chinese, w.phonetic, w.example
        ORDER BY MIN(dw.study_date), MIN(dw.position), dw.word_id`,
      args: [identity]
    });
    if (!result.rows.length) return res.status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .end(JSON.stringify({ empty: true, message: 'このユーザーには保存済みの単語がありません。' }));
    return csvResponse(res, identity, result.rows);
  } catch (error) {
    return fail(res, 500, 'unable to create backup');
  }
}
