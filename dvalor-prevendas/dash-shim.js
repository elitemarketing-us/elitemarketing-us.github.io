// Motor mínimo que imita a API `dash` do tipo Dashboard do claude.ai, para o painel rodar no GitHub Pages.
// Lê os CSVs de data/<id>.csv listados em window.DV_DATASETS e roda calcs e drawings do index.html sem mudança.
(function () {
  const raw = {};      // id -> {status, data, columns}
  const calcs = {};    // id -> {inputs, fn}
  const draws = [];    // {name, fn | {mount, update, unmount}}
  const made = new WeakMap();
  const onDataFns = [];
  let params = Object.assign({}, window.DV_PARAMS || {});
  let ready = false;
  let ver = 0;
  const cache = {};

  const parse = (txt) => {
    const rows = d3.csvParseRows(txt.replace(/\r\n?/g, '\n'));
    const head = rows.shift() || [];
    const data = rows.filter((r) => !(r.length === 1 && !(r[0] || '').trim())).map((r) => {
      const o = {};
      head.forEach((h, i) => { const v = (r[i] ?? '').trim(); o[h] = v === '' ? null : v; });
      return o;
    });
    data.columns = head;
    return {status: 'ok', data, columns: head};
  };

  const calcData = (id) => {
    const c = calcs[id];
    const key = id + '|' + ver + '|' + JSON.stringify(params);
    if (cache[key]) return cache[key];
    const ins = c.inputs.map((i) => dash.data(i));
    if (ins.some((x) => x.status !== 'ok')) return {status: 'loading', data: null, columns: [], refreshing: false, truncated: false, meta: []};
    let out;
    try {
      const v = c.fn(...ins.map((x) => x.data));
      const rows = Array.isArray(v);
      out = {status: 'ok', data: v, columns: rows && v[0] ? Object.keys(v[0]) : [], refreshing: false, truncated: false, meta: []};
    } catch (e) {
      console.error('calc', id, e);
      out = {status: 'error', data: null, message: String(e), columns: [], refreshing: false, truncated: false, meta: []};
    }
    cache[key] = out;
    return out;
  };

  const visivel = (el) => !el.closest('[hidden]');

  const runDraw = (d) => {
    document.querySelectorAll(`[data-draw="${d.name}"]`).forEach((el) => {
      if (!visivel(el)) return;
      try {
        if (typeof d.fn === 'function') d.fn(el);
        else {
          if (!made.has(el)) made.set(el, d.fn.mount ? d.fn.mount(el) : undefined);
          if (d.fn.update) d.fn.update(el, made.get(el));
        }
      } catch (e) { console.error('draw', d.name, e); }
    });
  };

  let agendado = false;
  const redraw = () => {
    if (!ready || agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      onDataFns.forEach((f) => { try { f(); } catch (e) { console.error('onData', e); } });
      draws.forEach(runDraw);
    });
  };

  window.dash = {
    data(id) {
      if (calcs[id]) return calcData(id);
      const r = raw[id];
      if (!r) return {status: 'missing', data: [], columns: [], refreshing: false, truncated: false, meta: []};
      return Object.assign({refreshing: false, truncated: false, meta: [], message: ''}, r);
    },
    calc(id, spec) { calcs[id] = spec; },
    loader() {},
    draw(name, fn) {
      if (fn === undefined) { draws.filter((d) => d.name === name).forEach(runDraw); return; }
      draws.push({name, fn});
    },
    onData(fn) { onDataFns.push(fn); if (ready) fn(); },
    params() { return Object.assign({}, params); },
    setParams(p) {
      Object.entries(p).forEach(([k, v]) => { if (v === null || v === undefined) delete params[k]; else params[k] = v; });
      redraw();
    },
    resetParams() { params = Object.assign({}, window.DV_PARAMS || {}); redraw(); },
    setLink(name) { try { history.replaceState(null, '', name ? '#' + name : location.pathname + location.search); } catch (e) {} },
    refresh() {},
    colors: ['var(--dv-c1, #6e5a96)', 'var(--dv-c2, #a99bc4)', 'var(--dv-c3, #3f6e8c)', 'var(--dv-c4, #c98a3c)', 'var(--dv-c5, #5a8a5a)', 'var(--dv-c6, #b0505a)'],
  };

  const carregar = async () => {
    const ids = window.DV_DATASETS || [];
    ids.forEach((id) => { raw[id] = {status: 'loading', data: [], columns: []}; });
    await Promise.all(ids.map(async (id) => {
      try {
        const r = await fetch(`data/${id}.csv?v=${window.DV_VERSAO || ''}`, {cache: 'no-store'});
        raw[id] = r.ok ? parse(await r.text()) : {status: 'error', data: [], columns: [], message: 'HTTP ' + r.status};
      } catch (e) { raw[id] = {status: 'error', data: [], columns: [], message: String(e)}; }
    }));
    ver++;
    ready = true;
    redraw();
  };

  document.addEventListener('DOMContentLoaded', () => {
    carregar();
    new MutationObserver((ms) => { if (ms.some((m) => m.attributeName === 'hidden')) redraw(); })
      .observe(document.body, {attributes: true, subtree: true, attributeFilter: ['hidden']});
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(redraw, 150); });
  });
})();
