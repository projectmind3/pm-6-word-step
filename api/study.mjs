import { client, fail, getDailyWords, requestBody, sendJson, validateDate, validateIdentity } from './_lib/data.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method not allowed');
  const body = requestBody(req);
  if (!body || !validateIdentity(body.identity) || !validateDate(body.date)) return fail(res, 400, 'identity and date are required');
  if (!Array.isArray(body.words) || body.words.length !== 10) return fail(res, 400, 'words must contain exactly 10 items');
  const learned = body.words.map((item) => {
    const id = item?.id ?? item?.wordId;
    if (!item || typeof item !== 'object' || typeof item.learned !== 'boolean' || (typeof id !== 'number' && typeof item.word !== 'string')) return null;
    return { id: typeof id === 'number' ? id : null, word: typeof item.word === 'string' ? item.word : null, learned: item.learned };
  });
  if (learned.some((item) => item === null)) return fail(res, 400, 'each word needs an id or word and a boolean learned field');
  if (new Set(learned.map((item) => item.id ?? item.word)).size !== 10) return fail(res, 400, 'words must be unique');
  try {
    const daily = await getDailyWords(body.identity, body.date);
    const known = new Map(daily.flatMap((item) => [[Number(item.id), item], [item.english, item]]));
    if (learned.some((item) => !known.has(item.id ?? item.word))) return fail(res, 400, 'words must belong to the requested day');
    const completedAt = new Date().toISOString();
    await client.batch([
      ...learned.map((item) => ({
        sql: 'UPDATE daily_words SET learned = ? WHERE identity = ? AND study_date = ? AND word_id = ?',
        args: [item.learned ? 1 : 0, body.identity, body.date, Number(known.get(item.id ?? item.word).id)]
      })),
      {
        sql: 'INSERT INTO study_days (identity, study_date, checked_in, completed_at) VALUES (?, ?, 1, ?) ON CONFLICT(identity, study_date) DO UPDATE SET checked_in = 1, completed_at = excluded.completed_at',
        args: [body.identity, body.date, completedAt]
      }
    ], 'write');
    return sendJson(res, 200, { identity: body.identity, date: body.date, checkedIn: true, completedAt });
  } catch (error) { return fail(res, 500, 'unable to save study record'); }
}
