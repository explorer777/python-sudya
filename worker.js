import { loadPyodide } from './pyodide-lib.js';

let py = null;
const base = new URL('./', import.meta.url).href;
const ready = (async () => {
  py = await loadPyodide({ indexURL: base, stdLibURL: base + 'python_stdlib.wasm' });
  postMessage({ type: 'ready', version: py.version });
})().catch(e => { postMessage({ type: 'fail', message: String(e && e.message || e) }); throw e; });

onmessage = async (e) => {
  await ready;
  const { id, code, stdin } = e.data;
  // ВАЖЛИВО: режим stdin() зі строкою обрізає рядок до 4096 символів, тому читаємо через read(buffer)
  let text = String(stdin).replace(/\r/g, '');
  if (text !== '' && !text.endsWith('\n')) text += '\n';
  const data = new TextEncoder().encode(text);
  let pos = 0;
  const out = [];
  py.setStdin({ read: (buf) => { const k = Math.min(buf.length, data.length - pos); if (k > 0) buf.set(data.subarray(pos, pos + k), 0); pos += k; return k; } });
  py.setStdout({ batched: s => out.push(s) });
  py.setStderr({ batched: s => out.push(s) });
  const g = py.globals.get('dict')();
  g.set('__name__', '__main__');
  let res;
  try {
    py.runPython(code, { globals: g });
    try { py.runPython('import sys\nsys.stdout.flush()'); } catch (_) {}
    res = { id, ok: true, out: out.join('\n') };
  } catch (err) {
    res = { id, ok: false, out: out.join('\n'), err: String(err && err.message || err) };
  } finally {
    g.destroy();
  }
  postMessage(res);
};
