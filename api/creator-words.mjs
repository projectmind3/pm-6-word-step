import { client, fail, sendJson, validateIdentity } from './_lib/data.mjs';

// Use the existing identity picker as the creator authorization boundary.
const CREATOR_IDENTITY = 'dad';

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'method not allowed');
  const { identity } = req.query ?? {};
  if (!validateIdentity(identity)) return fail(res, 400, 'identity must be dad, mom, or uu');
  if (identity !== CREATOR_IDENTITY) return fail(res, 400, 'creator identity required');
  try {
    const result = await client.execute('SELECT id, english, japanese, chinese, phonetic, example FROM words ORDER BY id');
    const words = result.rows.map((word) => ({
      id: Number(word.id),
      english: String(word.english),
      japanese: String(word.japanese),
      chinese: String(word.chinese),
      phonetic: String(word.phonetic),
      example: String(word.example)
    }));
    return sendJson(res, 200, { words, total: words.length });
  } catch (error) {
    return fail(res, 500, 'unable to load creator words');
  }
}
