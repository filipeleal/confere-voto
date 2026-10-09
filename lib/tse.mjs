import { BusyError } from './resources.mjs';
import { createLimiter } from './concurrency.mjs';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

export const BASE = 'https://resultados.tse.jus.br/oficial';
const isOfficial = value => value === 'o' || value === 'O';
export const UFS = 'ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to zz'.split(' ');
export function uf(value) { if (!UFS.includes(value)) throw new Error('UF inválida'); return value; }
export function digits(value, size) { if (!new RegExp(`^\\d{1,${size}}$`).test(value)) throw new Error('Código inválido'); return value.padStart(size, '0'); }
export function sectionsURL(state) { return `${BASE}/ele2026/arquivo-urna/3220/config/${uf(state)}/${state}-p003220-cs.json`; }
export function auxiliaryURL(state, city, zone, section) {
  const u = uf(state), m = digits(city, 5), z = digits(zone, 4), s = digits(section, 4);
  return `${BASE}/ele2026/arquivo-urna/3220/dados/${u}/${m}/${z}/${s}/p003220-${u}-m${m}-z${z}-s${s}-aux.json`;
}
export const resultURL = `${BASE}/ele2026/6257/dados/br/br-c0001-e006257-u.json`;
export function normalizeResult(raw) {
  if (!isOfficial(raw.f) || raw.ele !== '6257' || raw.t !== '1') throw new Error('Eleição ou ambiente inesperado');
  const office = raw.carg?.find(c => c.cd === '1');
  if (!office || !raw.s || !raw.v) throw new Error('Formato de resultado inesperado');
  const count = value => { if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Contagem inválida'); return Number(value); };
  return {
    generatedAt: `${raw.dg} ${raw.hg}`, totalizedAt: `${raw.dt} ${raw.ht}`, final: raw.tf === 's',
    sections: count(raw.s.st), expectedSections: count(raw.s.ts), votes: count(raw.v.tv), blank: count(raw.v.vb), null: count(raw.v.tvn),
    candidates: office.agr.flatMap(a => a.par.flatMap(p => p.cand.map(c => ({ number: c.n, name: c.nmu, party: p.sg, votes: count(c.vap), percent: c.pvap, voteStatus: c.dvt })))).sort((a,b) => b.votes-a.votes)
  };
}
export function bulletinLinks(raw, source) {
  if (!isOfficial(raw.f) || !Array.isArray(raw.hashes)) throw new Error('Arquivo auxiliar inválido');
  return raw.hashes.flatMap(h => {
    if (!/^[a-zA-Z0-9_-]+$/.test(h.hash)) throw new Error('Identificador de arquivo inválido');
    return h.arq.filter(a => a.tp === 'bu').map(a => {
      if (!/^[a-zA-Z0-9_.-]+$/.test(a.nm) || a.nm.includes('..')) throw new Error('Nome de arquivo inválido');
      return { name: a.nm, status: h.st, receivedAt: `${h.dr} ${h.hr}`, url: `${source.slice(0, source.lastIndexOf('/'))}/${h.hash}/${a.nm}` };
    });
  });
}

// Até 25 consultas em voo, partidas espaçadas, cache e pausa após bloqueio.
export function createTSEClient({concurrency=25, maxPending=100, interval=50, fetchImpl=fetch}={}) {
const cache = new Map();
const pending = new Map();
const schedule = createLimiter(concurrency);
let starts = Promise.resolve(), blockedUntil = 0;
const fetchJSON = (url, options = {}) => fetchResource(url, false, options);
const fetchBinary = url => fetchResource(url, true);
function fetchResource(url, binary, options = {}) {
  if (!url.startsWith(`${BASE}/ele2026/`)) throw new Error('Origem de dados não permitida');
  const key = `${binary}:${!!options.fresh}:${url}`;
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.time < 300_000) return Promise.resolve(hit.value);
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= maxPending) return Promise.reject(new BusyError());
  const job = schedule(async () => {
    const turn = starts;
    starts = turn.then(() => new Promise(resolve => setTimeout(resolve, interval)));
    await turn;
    if (Date.now() < blockedUntil) throw new Error('Consulta ao TSE temporariamente pausada. Tente mais tarde.');
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), redirect: 'error', headers: options.fresh ? {'Cache-Control':'no-cache'} : {} });
    if (!response.ok) {
      if ([403,429].includes(response.status)) blockedUntil = Date.now() + 660_000;
      if (response.status === 404) blockedUntil = Date.now() + 60_000;
      throw new Error(`TSE respondeu HTTP ${response.status}. Dados não disponíveis nesta consulta.`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (binary && bytes.length > 5_000_000) throw new Error('BU excede limite de tamanho');
    const data = binary ? null : JSON.parse(bytes.toString('utf8'));
    if (!binary && !isOfficial(data.f)) throw new Error('Dados fora do ambiente oficial');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const fetchedAt = new Date().toISOString();
    await mkdir('data/snapshots', { recursive: true });
    const path = `data/snapshots/${sha256}.${binary ? 'dat' : 'json'}`;
    await writeFile(path, bytes);
    await writeFile(`data/snapshots/${sha256}.meta.json`, JSON.stringify({ url, fetchedAt, sha256 }, null, 2));
    const value = { data, source: url, fetchedAt, sha256, path };
    cache.set(key, { time: Date.now(), value });
    if (cache.size > 150) cache.delete(cache.keys().next().value);
    return value;
  });
  pending.set(key, job);
  job.finally(() => pending.delete(key)).catch(() => {});
  return job;
}

return {fetchJSON, fetchBinary};
}
const collectionClient = createTSEClient();
export const {fetchJSON, fetchBinary} = collectionClient;
export const publicTSE = createTSEClient({concurrency:4, maxPending:20, interval:200});
