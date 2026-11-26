import { client, fail, sendJson, validateIdentity } from './_lib/data.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'method not allowed');
  const { identity } = req.query ?? {};
  if (!validateIdentity(identity)) return fail(res, 400, 'identity must be dad, mom, or uu');
  try {
    const [study, tests] = await Promise.all([
      client.execute({ sql: 'SELECT study_date AS date, checked_in AS checkedIn, completed_at AS completedAt FROM study_days WHERE identity = ? AND checked_in = 1 ORDER BY study_date', args: [identity] }),
      client.execute({ sql: 'SELECT identity, study_date AS date, total_questions AS totalQuestions, correct_answers AS correctAnswers, completed_at AS completedAt FROM test_results ORDER BY study_date' })
    ]);
    const studyRows = study.rows.map((row) => ({ date: String(row.date), checkedIn: Boolean(row.checkedIn), completedAt: row.completedAt }));
    const testRows = tests.rows.map((row) => ({ identity: String(row.identity), date: String(row.date), totalQuestions: Number(row.totalQuestions), correctAnswers: Number(row.correctAnswers), completedAt: row.completedAt }));
    const ownTests = testRows.filter((row) => row.identity === identity);
    const dayMap = new Map(studyRows.map((row) => [row.date, { ...row, test: null }]));
    ownTests.forEach((row) => {
      const day = dayMap.get(row.date) || { date: row.date, checkedIn: false, completedAt: null, test: null };
      day.test = { totalQuestions: row.totalQuestions, correctAnswers: row.correctAnswers, completedAt: row.completedAt };
      dayMap.set(row.date, day);
    });
    return sendJson(res, 200, { identity, studyDates: studyRows.map((row) => row.date), testDates: ownTests.map((row) => row.date), days: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)), tests: testRows });
  } catch (error) { return fail(res, 500, 'unable to load progress'); }
}
