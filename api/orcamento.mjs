import { createHash, timingSafeEqual } from 'node:crypto';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const digest = value => createHash('sha256').update(value).digest();
const path = 'pessoal/orcamento.json';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const secret = process.env.PRUMO_OWNER_KEY?.trim();
  if (!secret || !timingSafeEqual(digest(req.headers.authorization || ''), digest('Bearer ' + secret))) {
    return res.status(401).end();
  }
  try {
    if (req.method === 'GET') {
      const file = await get(path, { access: 'private', useCache: false });
      if (!file) return res.json({ rows: [], revision: null });
      return res.json({ rows: await new Response(file.stream).json(), revision: file.blob.etag });
    }
    if (req.method !== 'PUT') return res.status(405).end();
    const { rows, revision } = req.body || {};
    if (!Array.isArray(rows) || !(revision === null || typeof revision === 'string')) return res.status(400).end();
    const result = await put(path, JSON.stringify(rows), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false,
      ...(revision ? { ifMatch: revision } : { allowOverwrite: false })
    });
    return res.json({ revision: result.etag });
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError || /already exists/i.test(e.message)) return res.status(409).end();
    return res.status(503).end();
  }
}
