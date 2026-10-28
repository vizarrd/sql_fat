/* ============================================================
   SQL Midterm Lab – application shell, renderers, graders
   ============================================================ */
(function () {
  'use strict';
  const Weeks = window.Weeks.sort((a, b) => a.num - b.num);
  const view = document.getElementById('view');
  const side = document.getElementById('side');

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(9).forEach(c => { if (c === null || c === undefined || c === false) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function md(s) {
    const codes = [];
    let t = esc(s).replace(/`([^`]+)`/g, (m, c) => { codes.push('<code>' + c + '</code>'); return '\u0001' + (codes.length - 1) + '\u0002'; });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,:;!?]|$)/g, '$1<i>$2</i>').replace(/\n/g, '<br>');
    return t.replace(/\u0001(\d+)\u0002/g, (m, i) => codes[+i]);
  }
  const mdEl = (s, tag = 'span') => h(tag, { html: md(s) });
  function toast(msg) { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 1800); }
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- storage ---------- */
  const KEY = 'sqlmidterm.v1';
  let S = { q: {}, learn: {}, quiz: {}, theme: null, play: {} };
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(S, JSON.parse(raw)); } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function applyTheme() { if (S.theme) document.documentElement.setAttribute('data-theme', S.theme); else document.documentElement.removeAttribute('data-theme'); }
  applyTheme();

  /* ---------- syntax highlight ---------- */
  const KW = new Set(('SELECT FROM WHERE GROUP BY HAVING ORDER ASC DESC INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER ADD DROP MODIFY COLUMN RENAME TO VIEW INDEX AS AND OR NOT NULL IS IN BETWEEN LIKE ESCAPE EXISTS ANY ALL SOME UNION INTERSECT MINUS EXCEPT JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL ON USING DISTINCT PRIMARY KEY FOREIGN REFERENCES CHECK UNIQUE DEFAULT CONSTRAINT CASCADE TRUNCATE COMMIT ROLLBACK DECLARE BEGIN END IF THEN ELSE ELSIF LOOP WHILE FOR REVERSE EXIT WHEN CASE OPEN FETCH CLOSE CURSOR RETURN PROCEDURE FUNCTION TRIGGER BEFORE AFTER EACH ROW REPLACE EXCEPTION RAISE CONSTANT OUT INOUT NUMBER VARCHAR2 VARCHAR INTEGER INT DATE BOOLEAN CHAR REAL FLOAT NEW OLD REFERENCING INSERTING UPDATING DELETING EXEC EXECUTE CALL OF WITH OPTION READ ONLY SHOW CONTINUE GRANT REVOKE TRUE FALSE DUAL IMMEDIATE').split(' '));
  function highlight(code) {
    return code.replace(/(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([:&]?[A-Za-z_][\w$#]*)(\s*\()?|([\s\S])/g, (m, cm, str, num, id, par, other) => {
      if (cm) return '<span class="cm">' + esc(cm) + '</span>';
      if (str) return '<span class="s">' + esc(str) + '</span>';
      if (num) return '<span class="n">' + num + '</span>';
      if (id) {
        const up = id.toUpperCase().replace(/^[:&]/, '');
        if (/^[:&]/.test(id)) return '<span class="bd">' + esc(id) + '</span>' + (par ? esc(par) : '');
        if (KW.has(up) && !par) return '<span class="k">' + esc(id) + '</span>';
        if (par) return '<span class="fn">' + esc(id) + '</span>' + esc(par);
        return esc(id);
      }
      return esc(other || m);
    });
  }

  /* ---------- engine boot ---------- */
  const ready = (async () => {
    const bin = Uint8Array.from(atob(window.SQLWASM_B64), c => c.charCodeAt(0));
    await Engine.init(window.initSqlJs, bin);
  })();

  /* ---------- result renderers ---------- */
  function tableEl(cols, rows, max = 300) {
    const t = h('table', null,
      h('thead', null, h('tr', null, cols.map(c => h('th', null, c)))),
      h('tbody', null, rows.slice(0, max).map(r => h('tr', null, r.map(v => v === null || v === undefined ? h('td', { class: 'null' }, 'NULL') : h('td', null, String(v)))))));
    return h('div', { class: 'tw' }, t);
  }
  function resultsEl(results) {
    const box = h('div', { class: 'res' });
    results.forEach(r => {
      const sql = (r.sql || '').replace(/\s+/g, ' ');
      if (results.length > 1 && sql) box.append(h('div', { class: 'stmt' }, 'SQL> ' + (sql.length > 110 ? sql.slice(0, 110) + '…' : sql)));
      if (r.error) box.append(h('div', { class: 'err' }, 'ERROR: ' + r.error));
      else if (r.cols) { box.append(tableEl(r.cols, r.rows)); box.append(h('div', { class: 'cnt' }, r.rows.length === 0 ? 'no rows selected' : r.rows.length + (r.rows.length === 1 ? ' row selected.' : ' rows selected.'))); }
      else box.append(h('div', { class: 'msg' }, r.msg));
    });
    return box;
  }
  function plLogEl(log) {
    const box = h('div', { class: 'res' }); let buf = [];
    const flush = () => { if (buf.length) { box.append(h('div', { class: 'plout' }, buf.join('\n'))); buf = []; } };
    log.forEach(l => {
      if (l.type === 'out') buf.push(l.text);
      else { flush(); if (l.type === 'error') box.append(h('div', { class: 'err' }, 'ERROR: ' + l.text)); else if (l.type === 'msg') box.append(h('div', { class: 'msg' }, l.text)); else if (l.type === 'table') { box.append(tableEl(l.cols, l.rows)); box.append(h('div', { class: 'cnt' }, l.rows.length ? l.rows.length + (l.rows.length === 1 ? ' row selected.' : ' rows selected.') : 'no rows selected')); } }
    });
    flush(); return box;
  }

  /* ---------- run helpers ---------- */
  function runSqlScript(setup, code) {
    const db = Engine.create(setup); try { return db.script(code, { keepGoing: false }); } finally { db.close(); }
  }
  function askInput(name) { const v = window.prompt('Program asks for input &' + name + ' :'); return v; }
  function newSession(setup, inputs) {
    const db = Engine.create(setup); const sess = new Plsql.Session(db, { inputs: inputs || null, prompt: askInput }); return { db, sess };
  }
  function runPl(setup, code, inputs) {
    const { db, sess } = newSession(setup, inputs); try { return { log: sess.run(code).log, db, sess }; } catch (e) { return { log: [{ type: 'error', text: e.message }], db, sess }; }
  }
  const logKey = (log) => log.filter(l => l.type !== 'msg').map(l => l.type === 'table' ? 'T:' + JSON.stringify(l.rows) : (l.type === 'error' ? 'E:' : 'O:') + l.text.trim().replace(/\s+/g, ' ').toLowerCase()).join('\n');

  /* ---------- code box ---------- */
  function codeBox(o) {
    const pre = h('pre', { class: 'code', html: highlight(o.code.replace(/^\n/, '').replace(/\s+$/, '')) });
    const out = h('div');
    const box = h('div', { class: 'codebox' });
    const head = h('div', { class: 'cb-h' }, h('span', null, (o.title || (o.lang === 'plsql' ? 'PL/SQL' : 'SQL')).toUpperCase()), h('span', { class: 'sp' }));
    const code = o.code.replace(/^\n/, '').replace(/\s+$/, '');
    head.append(h('button', { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(code); toast('Copied'); } }, 'Copy'));
    if (o.run) {
      head.append(h('button', {
        onclick: async () => {
          await ready; out.innerHTML = '';
          const setup = (o.ds || '') + '\n' + (o.setup || '');
          const r = runPl(setup, code); out.append(h('div', { class: 'cb-out' }, plLogEl(r.log)));
        }
      }, '▶ Run'));
      head.append(h('button', { onclick: () => { S.play.code = code; S.play.ds = o.dsKey || S.play.ds; save(); location.hash = '#/play'; } }, 'Edit ↗'));
    }
    box.append(head, pre);
    if (o.note) box.append(h('div', { class: 'cb-note', html: md(o.note) }));
    box.append(out);
    return box;
  }

  /* ---------- dataset display ---------- */
  function datasetBox(ds, open) {
    const wrap = h('details', { class: 'ds' }); if (open) wrap.setAttribute('open', '');
    wrap.append(h('summary', null, '📦 Schema & sample data – ' + ds.name));
    const inner = h('div', { class: 'in' });
    if (ds.note) inner.append(h('p', { class: 'muted', html: md(ds.note) }));
    const tabs = h('div', { class: 'tabrow' }); const body = h('div');
    let db = null;
    ready.then(() => {
      try { db = Engine.create(ds.sql); } catch (e) { inner.append(h('div', { class: 'err' }, e.message)); return; }
      const tbs = db.tables();
      const show = (name) => { body.innerHTML = ''; const d = db.dump(name); body.append(h('div', { class: 'muted', style: { fontSize: '.85rem', margin: '4px 0' } }, name + ' (' + d.rows.length + ' rows)'), h('div', { class: 'res' }, tableEl(d.cols, d.rows))); [...tabs.children].forEach(b => b.classList.toggle('pri', b.dataset.t === name)); };
      tbs.forEach(t => tabs.append(h('button', { class: 'btn sm', 'data-t': t.name, onclick: () => show(t.name) }, t.name)));
      if (tbs.length) show(tbs[0].name);
      db.close();
    });
    inner.append(tabs, body);
    inner.append(h('details', { style: { marginTop: '12px' } }, h('summary', { class: 'muted', style: { cursor: 'pointer', fontSize: '.88rem' } }, 'Show the CREATE / INSERT script'), codeBox({ code: ds.sql, lang: 'sql', title: 'setup script' })));
    wrap.append(inner); return wrap;
  }

  /* ---------- progress ---------- */
  const qid = (w, q) => w.id + '.' + q.id;
  const isSolved = (w, q) => !!(S.q[qid(w, q)] && S.q[qid(w, q)].s);
  function weekStats(w) {
    const qs = (w.practice || []); const done = qs.filter(q => isSolved(w, q)).length;
    return { done, total: qs.length, pct: qs.length ? Math.round(100 * done / qs.length) : 0 };
  }
  function markSolved(w, q, code) { if (w.id === 'rapid') return; const k = qid(w, q); S.q[k] = Object.assign(S.q[k] || {}, { s: 1, c: code }); save(); renderSide(); }
  function draft(w, q, code) { const k = qid(w, q); S.q[k] = Object.assign(S.q[k] || {}, { c: code }); save(); }
  const getDraft = (w, q) => (S.q[qid(w, q)] || {}).c;

  /* ---------- question cards ---------- */
  function editor(w, q, starter) {
    const ta = h('textarea', { class: 'ed', spellcheck: 'false', rows: Math.max(4, (starter || '').split('\n').length + 1), placeholder: q.placeholder || '-- write your answer here' });
    ta.value = getDraft(w, q) !== undefined ? getDraft(w, q) : (starter || '');
    ta.addEventListener('input', () => draft(w, q, ta.value));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 2; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); ta.dispatchEvent(new CustomEvent('run')); }
    });
    return ta;
  }

  function qShell(w, q, idx, bodyFn) {
    const card = h('div', { class: 'card q' + (isSolved(w, q) ? ' solved' : '') });
    const num = h('div', { class: 'qn' }, String(idx + 1));
    card.append(h('div', { class: 'qh' }, num, h('div', { class: 'qt', html: md(q.q) })));
    const solved = () => { card.classList.add('solved'); };
    bodyFn(card, solved);
    return card;
  }
  function hintAndAnswer(card, q, extra) {
    const area = h('div');
    const row = h('div', { class: 'row', style: { marginTop: '6px' } });
    if (q.hint) row.append(h('button', { class: 'btn sm ghost', onclick: () => { area.querySelector('.hint') ? area.querySelector('.hint').remove() : area.prepend(h('div', { class: 'hint', html: '💡 ' + md(q.hint) })); } }, '💡 Hint'));
    if (q.answer) row.append(h('button', {
      class: 'btn sm ghost', onclick: () => {
        const ex = area.querySelector('.ans'); if (ex) { ex.remove(); return; }
        const a = h('div', { class: 'ans' }, codeBox({ code: q.answer, lang: q.type === 'plsql' ? 'plsql' : 'sql', title: 'model answer' }));
        if (q.explain) a.append(h('div', { class: 'callout note' }, h('span', { class: 'ic' }, '🧠'), h('p', { html: md(q.explain) })));
        area.append(a);
      }
    }, '👁 Model answer'));
    if (extra) row.append(extra);
    card.append(row, area);
  }

  // ---- SQL question ----
  function sqlQuestion(w, q, idx) {
    return qShell(w, q, idx, (card, solved) => {
      const ta = editor(w, q, q.starter); const out = h('div'); const fb = h('div');
      const setup = ((w.dataset && !q.fresh) ? w.dataset.sql : '') + '\n' + (q.setup || '');
      const run = async () => {
        await ready; out.innerHTML = ''; const code = ta.value.trim(); if (!code) return toast('Type a query first');
        try { out.append(resultsEl(runSqlScript(setup, code))); } catch (e) { out.append(h('div', { class: 'err' }, e.message)); }
      };
      ta.addEventListener('run', run);
      const check = async () => {
        await ready; fb.innerHTML = ''; const code = ta.value.trim(); if (!code) return toast('Type a query first');
        let g; try { g = Engine.grade(q, setup, code); } catch (e) { g = { ok: false, feedback: e.message }; }
        out.innerHTML = ''; if (g.results) out.append(resultsEl(g.results));
        if (g.ok) {
          fb.append(h('div', { class: 'fb ok' }, h('b', null, '✅ Correct!'), 'Your result matches the expected output.'));
          markSolved(w, q, code); solved();
          if (q.explain) fb.append(h('div', { class: 'callout note' }, h('span', { class: 'ic' }, '🧠'), h('p', { html: md(q.explain) })));
        } else {
          card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 300);
          fb.append(h('div', { class: 'fb bad' }, h('b', null, g.internal ? '⚠ Internal' : '✗ Not quite yet'), g.feedback || 'Result differs from the expected one.'));
          const cmp = g.verify || (g.expected && { got: g.got, expected: g.expected });
          if (cmp && cmp.got && cmp.expected) {
            fb.append(h('div', { class: 'cols2', style: { marginTop: '10px' } },
              h('div', null, h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'Yours'), h('div', { class: 'res' }, tableEl(cmp.got.cols, cmp.got.rows, 25))),
              h('div', null, h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'Expected'), h('div', { class: 'res' }, tableEl(cmp.expected.cols, cmp.expected.rows, 25)))));
          }
          if (g.probe) fb.append(h('div', { class: 'fb info' }, 'Probe inserts – expected: ' + g.probe.expected.join(', ') + ' | yours: ' + g.probe.got.join(', ')));
        }
      };
      card.append(ta, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: run }, '▶ Run'), h('button', { class: 'btn pri', onclick: check }, '✓ Check answer'), h('span', { class: 'muted', style: { fontSize: '.78rem' } }, 'Ctrl+Enter = run')), fb, out);
      hintAndAnswer(card, q);
    });
  }

  // ---- PL/SQL question ----
  function plQuestion(w, q, idx) {
    return qShell(w, q, idx, (card, solved) => {
      const ta = editor(w, q, q.starter); const out = h('div'); const fb = h('div');
      const setup = ((w.dataset && !q.fresh) ? w.dataset.sql : '') + '\n' + (q.setup || '');
      const full = (code) => code + '\n/\n' + (q.driver || '');
      const run = async () => {
        await ready; out.innerHTML = ''; const code = ta.value.trim(); if (!code) return toast('Write some code first');
        const r = runPl(setup, full(code), q.inputs); out.append(plLogEl(r.log)); if (q.verify) { try { const v = r.db.one(q.verify); out.append(h('div', { class: 'muted', style: { fontSize: '.8rem', marginTop: '8px' } }, 'State of the data afterwards:'), h('div', { class: 'res' }, tableEl(v.cols, v.rows))); } catch (e) { } } r.db.close();
      };
      ta.addEventListener('run', run);
      const applyTest = (code, val) => {
        if (q.testVar === undefined) return code;
        const lit = typeof val === 'string' ? "'" + val.replace(/'/g, "''") + "'" : String(val);
        const re = new RegExp('(\\b' + q.testVar + '\\s+(?:NUMBER|INTEGER|INT|SMALLINT|PLS_INTEGER|REAL|FLOAT|VARCHAR2|CHAR|VARCHAR)\\s*(?:\\([^)]*\\))?\\s*:=\\s*)([^;]+)(;)', 'i');
        return re.test(code) ? code.replace(re, (m, a, b, c) => a + lit + c) : code;
      };
      const check = async () => {
        await ready; fb.innerHTML = ''; const code = ta.value.trim(); if (!code) return toast('Write some code first');
        out.innerHTML = '';
        const tests = q.tests && q.tests.length ? q.tests : [undefined];
        const needs = (q.needs || []).map(n => ({ ok: new RegExp(n.re, n.flags || 'i').test(code), msg: n.msg }));
        const allNeeds = needs.every(n => n.ok);
        let fail = null, shown = null;
        for (const tv of tests) {
          const inputs = Object.assign({}, q.inputs || {}, tv !== undefined && q.testVar ? { [q.testVar]: tv } : {});
          const ref = runPl(setup, full(tv !== undefined ? applyTest(q.answer, tv) : q.answer), inputs);
          const usr = runPl(setup, full(tv !== undefined ? applyTest(code, tv) : code), inputs);
          let refV = null, usrV = null;
          if (q.verify) { try { refV = ref.db.one(q.verify); usrV = usr.db.one(q.verify); } catch (e) { } }
          ref.db.close(); usr.db.close();
          const sameOut = logKey(ref.log) === logKey(usr.log);
          const sameData = !q.verify || (refV && usrV && Engine.sameResult(usrV, refV, true));
          const rec = { tv, ref, usr, refV, usrV, sameOut, sameData };
          if (!shown) shown = rec;
          if (!sameOut || !sameData) { fail = rec; shown = rec; break; }
        }
        out.append(h('div', { class: 'muted', style: { fontSize: '.8rem', margin: '10px 0 2px' } }, 'Your output' + (shown.tv !== undefined ? ' (' + q.testVar + ' = ' + shown.tv + ')' : '') + ':'), plLogEl(shown.usr.log));
        if (!fail && allNeeds) {
          fb.append(h('div', { class: 'fb ok' }, h('b', null, '✅ Correct!'), 'Your program produced the expected output' + (q.verify ? ' and data' : '') + (tests.length > 1 ? ' for all ' + tests.length + ' hidden test values (' + tests.join(', ') + ').' : '.')));
          markSolved(w, q, code); solved();
          if (q.explain) fb.append(h('div', { class: 'callout note' }, h('span', { class: 'ic' }, '🧠'), h('p', { html: md(q.explain) })));
        } else {
          card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 300);
          const f = h('div', { class: 'fb bad' }, h('b', null, '✗ Not quite yet'));
          if (fail) {
            if (fail.usr.log.some(l => l.type === 'error')) f.append('Your program raised an error – read it above. ');
            if (fail.tv !== undefined) f.append(h('div', { html: md('Failed for **' + q.testVar + ' = ' + fail.tv + '**. The checker re-runs your program with other values – keep the declaration line `' + q.testVar + ' … := …;` so it can be replaced, and don\'t hard-code the answer.') }));
            if (!fail.sameOut) { f.append(h('div', null, 'Expected output:')); }
          }
          fb.append(f);
          if (fail && !fail.sameOut) fb.append(h('div', { class: 'plout' }, fail.ref.log.filter(l => l.type !== 'msg').map(l => l.type === 'table' ? '[table] ' + JSON.stringify(l.rows) : (l.type === 'error' ? 'ERROR: ' : '') + l.text).join('\n') || '(no output)'));
          if (fail && !fail.sameData && fail.refV && fail.usrV) fb.append(h('div', { class: 'cols2' }, h('div', null, h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'Your data'), h('div', { class: 'res' }, tableEl(fail.usrV.cols, fail.usrV.rows, 25))), h('div', null, h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'Expected data'), h('div', { class: 'res' }, tableEl(fail.refV.cols, fail.refV.rows, 25)))));
          if (!allNeeds) fb.append(h('ul', { class: 'chk' }, needs.map(n => h('li', { class: n.ok ? '' : 'no' }, n.msg))));
        }
      };
      card.append(ta, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: run }, '▶ Run'), h('button', { class: 'btn pri', onclick: check }, '✓ Check answer'), h('span', { class: 'muted', style: { fontSize: '.78rem' } }, 'Ctrl+Enter = run')), fb, out);
      hintAndAnswer(card, q);
    });
  }

  // ---- write (pattern-checked) ----
  function writeQuestion(w, q, idx) {
    return qShell(w, q, idx, (card, solved) => {
      const ta = editor(w, q, q.starter); const fb = h('div');
      const check = () => {
        fb.innerHTML = ''; const code = ta.value.trim(); if (!code) return toast('Write something first');
        const res = q.needs.map(n => ({ ok: new RegExp(n.re, n.flags || 'i').test(code), msg: n.msg }));
        const ok = res.every(r => r.ok);
        fb.append(h('div', { class: 'fb ' + (ok ? 'ok' : 'bad') }, h('b', null, ok ? '✅ Looks right!' : '✗ Missing something'), ok ? 'All the required parts are there. Compare with the model answer to be sure about the exact syntax.' : 'Check the list below.'), h('ul', { class: 'chk' }, res.map(r => h('li', { class: r.ok ? '' : 'no' }, r.msg))));
        if (ok) { markSolved(w, q, code); solved(); if (q.explain) fb.append(h('div', { class: 'callout note' }, h('span', { class: 'ic' }, '🧠'), h('p', { html: md(q.explain) }))); }
      };
      ta.addEventListener('run', check);
      card.append(ta, h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: check }, '✓ Check answer'), h('span', { class: 'muted', style: { fontSize: '.78rem' } }, 'Checked by pattern – Oracle-only syntax can\'t run in the browser')), fb);
      hintAndAnswer(card, q);
    });
  }

  // ---- MCQ ----
  function mcqQuestion(w, q, idx, solvedCb) {
    return qShell(w, q, idx, (card, solved) => {
      if (q.code) card.append(codeBox({ code: q.code, lang: q.lang || 'sql', title: q.lang === 'plsql' ? 'PL/SQL' : 'SQL' }));
      const box = h('div', { class: 'mcq' }); let done = false;
      const fb = h('div');
      const order = q.shuffle === false ? q.opts.map((_, i) => i) : shuffle(q.opts.map((_, i) => i));
      order.forEach((oi, pos) => {
        const b = h('button', { class: 'opt', onclick: () => {
          if (done) return; const right = oi === q.a;
          b.classList.add(right ? 'right' : 'wrong');
          if (!right) { const rb = box.children[order.indexOf(q.a)]; rb && rb.classList.add('right'); }
          [...box.children].forEach(x => x.classList.add('dis')); done = true;
          fb.append(h('div', { class: 'fb ' + (right ? 'ok' : 'bad') }, h('b', null, right ? '✅ Correct' : '✗ Not quite'), h('span', { html: md(q.why || '') })));
          if (right) { markSolved(w, q, ''); solved(); }
          solvedCb && solvedCb(right);
        } }, h('span', { class: 'l' }, 'ABCD'[pos]), h('span', { html: md(q.opts[oi]) }));
        box.append(b);
      });
      card.append(box, fb);
    });
  }

  // ---- fill in the blanks ----
  function fillQuestion(w, q, idx) {
    return qShell(w, q, idx, (card, solved) => {
      const parts = q.code.replace(/^\n/, '').split(/___(\d+)___/); const inputs = [];
      const pre = h('pre', { class: 'code' });
      parts.forEach((p, i) => {
        if (i % 2 === 0) pre.append(h('span', { html: highlight(p) }));
        else { const inp = h('input', { type: 'text', 'data-i': p, spellcheck: 'false' }); inputs.push(inp); pre.append(inp); }
      });
      const fb = h('div');
      const check = () => {
        let all = true;
        inputs.forEach(inp => {
          const alts = q.blanks[+inp.dataset.i - 1]; const v = inp.value.trim().toLowerCase().replace(/\s+/g, ' ');
          const ok = alts.some(a => a.toLowerCase() === v); inp.className = ok ? 'good' : 'badi'; if (!ok) all = false;
        });
        fb.innerHTML = '';
        if (all) { fb.append(h('div', { class: 'fb ok' }, h('b', null, '✅ All blanks correct'), q.explain ? h('span', { html: md(q.explain) }) : '')); markSolved(w, q, ''); solved(); }
        else fb.append(h('div', { class: 'fb bad' }, h('b', null, '✗ Some blanks are wrong'), 'Red = wrong. Use the hint or reveal.'));
      };
      const reveal = () => { inputs.forEach(inp => { inp.value = q.blanks[+inp.dataset.i - 1][0]; }); check(); };
      card.append(h('div', { class: 'fillcode' }, pre), h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: check }, '✓ Check'), h('button', { class: 'btn sm ghost', onclick: reveal }, '👁 Reveal')), fb);
      if (q.hint) card.append(h('div', { class: 'hint', html: '💡 ' + md(q.hint) }));
    });
  }

  // ---- build (order the lines) ----
  function buildQuestion(w, q, idx) {
    return qShell(w, q, idx, (card, solved) => {
      const lines = q.lines.map((t, i) => ({ t, i })).concat((q.extra || []).map((t, i) => ({ t, i: -1 - i })));
      let pool = shuffle(lines), chosen = [];
      const poolEl = h('div', { class: 'col' }), outEl = h('div', { class: 'col' }); const fb = h('div');
      const draw = () => {
        poolEl.innerHTML = ''; outEl.innerHTML = '';
        pool.forEach(l => poolEl.append(h('button', { class: 'ln', onclick: () => { pool = pool.filter(x => x !== l); chosen.push(l); draw(); } }, l.t)));
        chosen.forEach(l => outEl.append(h('button', { class: 'ln', 'data-i': l.i, onclick: () => { chosen = chosen.filter(x => x !== l); pool.push(l); draw(); } }, l.t)));
      };
      draw();
      const check = () => {
        fb.innerHTML = ''; const kids = [...outEl.children];
        if (chosen.length !== q.lines.length || chosen.some(l => l.i < 0)) { fb.append(h('div', { class: 'fb bad' }, h('b', null, 'Use exactly the lines needed'), 'Some lines are missing – or a decoy line is included. Pool lines: click to add; click on the right to remove.')); return; }
        let ok = true; chosen.forEach((l, k) => { const good = l.i === k; kids[k].classList.add(good ? 'good' : 'bad'); if (!good) ok = false; });
        if (ok) { fb.append(h('div', { class: 'fb ok' }, h('b', null, '✅ Perfect order'), q.explain ? h('span', { html: md(q.explain) }) : '')); markSolved(w, q, ''); solved(); }
        else fb.append(h('div', { class: 'fb bad' }, h('b', null, '✗ Order is off'), 'Green lines are in the right place; red ones are not.'));
      };
      card.append(h('div', { class: 'build' }, h('div', null, h('h4', null, 'Pool – click a line to add'), poolEl), h('div', null, h('h4', null, 'Your program'), outEl)),
        h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: check }, '✓ Check order'), h('button', { class: 'btn sm ghost', onclick: () => { pool = shuffle(lines); chosen = []; fb.innerHTML = ''; draw(); } }, 'Reset')), fb);
      if (q.hint) card.append(h('div', { class: 'hint', html: '💡 ' + md(q.hint) }));
    });
  }

  // ---- normalization calc question ----
  function calcQuestion(w, q, idx) {
    return qShell(w, q, idx, (card, solved) => {
      const R = q.R, fds = Norm.parseFDs(q.fds);
      card.append(h('div', { class: 'callout note' }, h('span', { class: 'ic' }, '📐'), h('p', { html: md('R(' + R.split('').join(', ') + ')   F = { ' + fds.map(f => f.l + ' → ' + f.r).join(',  ') + ' }') })));
      const fb = h('div'); let ans;
      if (q.kind === 'bool') {
        const sel = h('select', { class: 'sel' }, h('option', { value: '' }, 'choose…'), h('option', { value: 'yes' }, 'Yes'), h('option', { value: 'no' }, 'No'));
        ans = () => sel.value; card.append(sel);
      } else {
        const inp = h('input', { class: 'inp', style: { maxWidth: '360px' }, placeholder: q.kind === 'keys' ? 'e.g. AB, CD' : 'e.g. ABCD' });
        ans = () => inp.value; card.append(inp);
      }
      const truth = () => q.solve(R, fds, Norm);
      const check = () => {
        fb.innerHTML = ''; const v = ans(); if (!v) return toast('Enter an answer');
        const t = truth(); let ok;
        if (q.kind === 'bool') ok = (v === 'yes') === t;
        else if (q.kind === 'keys') { const got = v.split(/[,;\s]+/).filter(Boolean).map(Norm.uniq).sort().join('|'); ok = got === t.slice().sort().join('|'); }
        else ok = Norm.uniq(v) === Norm.uniq(t);
        fb.append(h('div', { class: 'fb ' + (ok ? 'ok' : 'bad') }, h('b', null, ok ? '✅ Correct' : '✗ Not quite'), ok ? '' : 'Re-check using the closure steps.'));
        if (ok) { markSolved(w, q, v); solved(); }
        if (q.worked) fb.append(h('div', { class: 'callout note' }, h('span', { class: 'ic' }, '🧠'), h('p', { html: md(q.worked) })));
      };
      card.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn pri', onclick: check }, '✓ Check'), h('button', { class: 'btn sm ghost', onclick: () => { const t = truth(); fb.innerHTML = ''; fb.append(h('div', { class: 'fb info' }, 'Answer: ' + (q.kind === 'bool' ? (t ? 'Yes' : 'No') : q.kind === 'keys' ? t.join(', ') : t)), q.worked ? h('div', { class: 'callout note' }, h('span', { class: 'ic' }, '🧠'), h('p', { html: md(q.worked) })) : ''); } }, '👁 Show answer')), fb);
      if (q.hint) card.append(h('div', { class: 'hint', html: '💡 ' + md(q.hint) }));
    });
  }

  function questionEl(w, q, idx) {
    switch (q.type) {
      case 'sql': return sqlQuestion(w, q, idx);
      case 'plsql': return plQuestion(w, q, idx);
      case 'write': return writeQuestion(w, q, idx);
      case 'mcq': return mcqQuestion(w, q, idx);
      case 'fill': return fillQuestion(w, q, idx);
      case 'build': return buildQuestion(w, q, idx);
      case 'calc': return calcQuestion(w, q, idx);
    }
    return h('div', null, 'unknown question type ' + q.type);
  }

  /* ---------- lesson renderer ---------- */
  const ICON = { tip: '💡', trap: '⚠️', exam: '🎯', note: '📝' };
  function blockEl(w, b) {
    switch (b.k) {
      case 'h': return h('h2', null, b.t);
      case 'h3': return h('h3', null, b.t);
      case 'p': return h('p', { html: md(b.t) });
      case 'list': return h(b.ordered ? 'ol' : 'ul', null, b.items.map(i => h('li', { html: md(i) })));
      case 'code': return codeBox({ code: b.t, lang: b.lang || 'sql', run: b.run !== false && !b.static, note: b.note, title: b.title, ds: (w.dataset && !b.fresh) ? w.dataset.sql : '', dsKey: w.id, setup: b.setup });
      case 'callout': return h('div', { class: 'callout ' + b.kind }, h('span', { class: 'ic' }, ICON[b.kind]), h('p', { html: md(b.t) }));
      case 'table': return h('div', { class: 'tbl' }, h('table', null, h('thead', null, h('tr', null, b.head.map(x => h('th', null, x)))), h('tbody', null, b.rows.map(r => h('tr', null, r.map(c => h('td', { html: md(String(c)) })))))));
      case 'cmp': return h('div', { class: 'cmp' }, [b.a, b.b].map(x => h('div', null, h('b', null, x.title), h('span', { html: md(x.t) }))));
      case 'flow': { const f = h('div', { class: 'flow' }); b.steps.forEach((s, i) => { if (i) f.append(h('em', null, '→')); f.append(h('span', null, s)); }); return f; }
      case 'normlab': return normLabEl(b.preset);
    }
    return h('div');
  }
  function lessonView(w) {
    const root = h('div', { class: 'lesson' });
    if (w.tldr) root.append(h('div', { class: 'tldr' }, h('b', { class: 't' }, 'In 30 seconds'), h('ul', null, w.tldr.map(t => h('li', { html: md(t) })))));
    w.lesson.forEach(b => root.append(blockEl(w, b)));
    const done = !!S.learn[w.id];
    root.append(h('div', { class: 'row', style: { marginTop: '34px' } },
      h('button', { class: 'btn pri', onclick: () => { S.learn[w.id] = 1; save(); renderSide(); location.hash = '#/w/' + w.num + '/practice'; } }, 'Got it – go to the lab sheet →'),
      h('button', { class: 'btn', onclick: () => { location.hash = '#/w/' + w.num + '/quiz'; } }, 'Quick quiz first'),
      done ? h('span', { class: 'chip ok' }, '✓ lesson read') : null));
    return root;
  }

  function practiceView(w) {
    const root = h('div');
    const sheet = h('div', { class: 'card sheet' });
    sheet.append(h('div', { class: 'chip acc' }, w.lab || ('Lab sheet ' + w.num)), h('h2', { style: { marginTop: '8px' } }, w.sheetTitle || w.title),
      w.scenario ? h('p', { class: 'muted', html: md(w.scenario) }) : null);
    if (w.dataset) sheet.append(datasetBox(w.dataset, false));
    sheet.append(h('div', { class: 'guide', html: '<b>Lab-sheet rules (real exam/lab):</b> suffix every table with the last 4 digits of your reg. no. (e.g. <code>emp_1021</code>) · insert 4–5 rows so no query returns “No rows found” · submit a PDF with screenshots of tables, records, and queries with output. <i>In this sandbox tables are created for you, so just write the queries.</i>' }));
    root.append(sheet);
    const st = weekStats(w);
    const prog = h('div', { class: 'row', style: { margin: '8px 2px 0' } }, h('b', null, st.done + ' / ' + st.total + ' solved'), h('div', { class: 'bar', style: { flex: 1, minWidth: '120px' } }, h('i', { style: { width: st.pct + '%' } })));
    root.append(prog);
    w.practice.forEach((q, i) => root.append(questionEl(w, q, i)));
    return root;
  }

  function quizView(w) {
    const root = h('div'); const qs = w.quiz || []; let right = 0, answered = 0;
    const score = h('div', { class: 'card score', style: { display: 'none' } });
    root.append(h('p', { class: 'muted' }, 'Instant feedback. Answers are shuffled each visit. Aim for ' + qs.length + '/' + qs.length + '.'));
    qs.forEach((q0, i) => {
      const q = Object.assign({ type: 'mcq', id: 'z' + (q0.id || i) }, q0);
      root.append(mcqQuestion(w, q, i, (ok) => {
        answered++; if (ok) right++;
        if (answered === qs.length) { score.style.display = 'flex'; score.innerHTML = ''; score.append(h('div', { class: 'big' }, right + '/' + qs.length), h('div', null, h('b', null, right === qs.length ? 'Perfect! 🎉' : right >= qs.length * .7 ? 'Solid.' : 'Review the lesson, then retry.'), h('div', { class: 'muted' }, 'Use the lab sheet next – coding is what the exam tests.')), h('button', { class: 'btn', onclick: render }, 'Retry')); S.quiz[w.id] = Math.max(S.quiz[w.id] || 0, right); save(); }
      }));
    });
    root.append(score); return root;
  }

  function weekPage(num, tab) {
    const w = Weeks.find(x => x.num === num); if (!w) return h('div', null, 'Not found');
    const root = h('div');
    const st = weekStats(w);
    root.append(h('div', { class: 'whead' }, h('div', { class: 'num' }, 'Week ' + w.num + ' · ' + (w.lab || '')), h('h1', null, w.title), h('p', { class: 'muted', style: { margin: '0 0 8px', maxWidth: '70ch' }, html: md(w.summary) }),
      h('div', { class: 'row' }, h('span', { class: 'chip' }, '⏱ ' + (w.time || '~30 min')), h('span', { class: 'chip ' + (st.done === st.total && st.total ? 'ok' : '') }, st.done + '/' + st.total + ' lab questions'), S.learn[w.id] ? h('span', { class: 'chip ok' }, '✓ lesson read') : null)));
    const t = (k, label) => h('a', { href: '#/w/' + w.num + (k === 'learn' ? '' : '/' + k), class: tab === k ? 'on' : '' }, label);
    root.append(h('div', { class: 'tabs' }, t('learn', '📖 Learn'), t('practice', '🧪 Lab sheet'), t('quiz', '⚡ Quick quiz')));
    root.append(tab === 'practice' ? practiceView(w) : tab === 'quiz' ? quizView(w) : lessonView(w));
    const idx = Weeks.indexOf(w);
    root.append(h('div', { class: 'row', style: { marginTop: '40px', justifyContent: 'space-between' } },
      idx > 0 ? h('a', { class: 'btn', href: '#/w/' + Weeks[idx - 1].num }, '← Week ' + Weeks[idx - 1].num) : h('span'),
      idx < Weeks.length - 1 ? h('a', { class: 'btn', href: '#/w/' + Weeks[idx + 1].num }, 'Week ' + Weeks[idx + 1].num + ' →') : h('span')));
    return root;
  }

  /* ---------- home ---------- */
  function homePage() {
    const root = h('div');
    const total = Weeks.reduce((a, w) => a + (w.practice || []).length, 0), done = Weeks.reduce((a, w) => a + weekStats(w).done, 0);
    root.append(h('div', { class: 'hero' }, h('h1', null, 'SQL Midterm Lab'), h('p', null, 'Eleven weeks of DBMS lab material, cut down to what you actually need: a fast lesson, then lab-sheet style practice where your SQL and PL/SQL really run and get checked.'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/w/' + (Weeks.find(w => !weekStats(w).total || weekStats(w).done < weekStats(w).total) || Weeks[0]).num }, done ? 'Continue where you left off →' : 'Start with Week 1 →'), h('a', { class: 'btn line', href: '#/play' }, 'Open playground'))));
    root.append(h('div', { class: 'steps3' },
      h('div', null, h('b', null, '1 · Learn (5–10 min)'), h('span', { class: 'muted' }, 'Short lesson: the idea, the template, the exam traps. Every code box is runnable.')),
      h('div', null, h('b', null, '2 · Lab sheet'), h('span', { class: 'muted' }, 'Same format as your PDFs: schema + data + numbered questions. Run, check, hint, reveal.')),
      h('div', null, h('b', null, '3 · Quick quiz'), h('span', { class: 'muted' }, 'Concept traps (NULL, HAVING vs WHERE, BEFORE vs AFTER…) in 2 minutes.'))));
    root.append(h('div', { class: 'row', style: { margin: '18px 0 4px', justifyContent: 'space-between' } }, h('h2', { style: { margin: 0 } }, 'Weekly plan'), h('span', { class: 'muted' }, done + ' / ' + total + ' lab questions solved')));
    const g = h('div', { class: 'grid' });
    Weeks.forEach(w => {
      const st = weekStats(w);
      g.append(h('a', { class: 'card wcard', href: '#/w/' + w.num }, h('div', { class: 'num' }, 'Week ' + w.num + (w.lab ? ' · ' + w.lab : '')), h('h3', null, w.title), h('p', { html: md(w.blurb || w.summary) }), h('div', { class: 'row', style: { marginTop: '4px' } }, h('span', { class: 'chip' }, '⏱ ' + (w.time || '30 min')), S.learn[w.id] ? h('span', { class: 'chip ok' }, '✓ read') : null, st.total && st.done === st.total ? h('span', { class: 'chip ok' }, '✓ lab done') : null), h('div', { class: 'bar' }, h('i', { style: { width: st.pct + '%' } }))));
    });
    root.append(g);
    root.append(h('h2', null, 'Tools'));
    root.append(h('div', { class: 'grid' },
      toolCard('#/sqlplus', '🖥️ SQL*Plus terminal', 'The black SQL> screen from the lab PC: line numbers, / to run, SET, COLUMN, DESC, SPOOL, & variables. Log in as any user – your tables are saved.'),
      toolCard('#/play', '⌨️ Playground', 'Free SQL + PL/SQL console. Pick any week\'s database, run anything, reset anytime.'),
      toolCard('#/norm', '📐 Normalization lab', 'Closure, candidate keys, BCNF/3NF, lossless-join checker – with working shown.'),
      toolCard('#/rapid', '⚡ Rapid-fire', 'Endless random concept questions from all weeks. Build a streak.'),
      toolCard('#/cheat', '📋 Cheat sheet', 'All syntax on one page + Oracle vs sandbox differences.')));
    root.append(h('div', { class: 'row', style: { marginTop: '28px' } }, h('button', { class: 'btn sm ghost', onclick: () => { if (confirm('Reset all progress and saved answers?')) { S.q = {}; S.learn = {}; S.quiz = {}; save(); render(); renderSide(); } } }, 'Reset progress')));
    return root;
  }
  const toolCard = (href, t, p) => h('a', { class: 'card wcard', href }, h('h3', null, t), h('p', null, p));

  /* ---------- playground ---------- */
  let playDB = null, playSess = null, playKey = null;
  function playPage() {
    const root = h('div');
    const dsList = Weeks.filter(w => w.dataset).map(w => ({ key: w.id, name: 'Wk ' + w.num + ' – ' + w.dataset.name, sql: w.dataset.sql }));
    dsList.push({ key: 'empty', name: 'Empty database', sql: '' });
    const cur = S.play.ds && dsList.find(d => d.key === S.play.ds) ? S.play.ds : 'w4';
    root.append(h('h1', null, 'Playground'), h('p', { class: 'muted', style: { maxWidth: '70ch' } }, 'Run any SQL or PL/SQL (blocks, procedures, functions, cursors, triggers). Data persists between runs until you hit Reset. ', h('b', null, 'Ctrl+Enter'), ' runs.'));
    const sel = h('select', { class: 'sel' }, dsList.map(d => h('option', { value: d.key, selected: d.key === cur }, d.name)));
    const schema = h('div', { class: 'schema' }); const out = h('div'); const ta = h('textarea', { class: 'ed', rows: 12, spellcheck: 'false' });
    ta.value = S.play.code || "SELECT bname, SUM(amount) AS total\nFROM deposit\nGROUP BY bname\nORDER BY total DESC;";
    ta.style.minHeight = '220px';
    ta.addEventListener('input', () => { S.play.code = ta.value; save(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 2; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    });
    const reset = async () => {
      await ready; if (playDB) playDB.close(); const d = dsList.find(x => x.key === sel.value);
      playDB = Engine.create(d.sql); playSess = new Plsql.Session(playDB, { prompt: askInput }); playKey = sel.value; S.play.ds = sel.value; save(); refresh(); out.innerHTML = '';
    };
    const refresh = () => {
      schema.innerHTML = ''; const tbs = playDB.tables();
      if (!tbs.length) schema.append(h('span', { class: 'muted' }, 'No tables yet – CREATE one!'));
      tbs.forEach(t => schema.append(h('div', { class: 'tb', title: 'click to SELECT *', onclick: () => { ta.value = 'SELECT * FROM ' + t.name + ';'; run(); } }, t.type === 'view' ? '👁 ' : '▦ ', h('b', null, t.name))));
    };
    const run = async () => {
      await ready; if (!playDB || playKey !== sel.value) await reset();
      out.innerHTML = ''; const r = playSess.run(ta.value); out.append(plLogEl(r.log)); refresh();
    };
    sel.addEventListener('change', reset);
    root.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Database:'), sel, h('button', { class: 'btn sm', onclick: reset }, '↺ Reset data')));
    root.append(h('div', { style: { margin: '10px 0' } }, schema), ta, h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: run }, '▶ Run'), h('button', { class: 'btn', onclick: () => { ta.value = ''; S.play.code = ''; save(); out.innerHTML = ''; } }, 'Clear')), out);
    root.append(h('div', { class: 'callout note', style: { marginTop: '18px' } }, h('span', { class: 'ic' }, '📝'), h('p', { html: md('**Sandbox notes:** runs on SQLite with an Oracle-style layer (VARCHAR2, NUMBER, MINUS, ANY/ALL, NVL, SYSDATE, DESC, DUAL, `/` terminators). `ALTER TABLE … MODIFY / DROP CONSTRAINT` is Oracle-only and can\'t execute here. Oracle-style date literals such as `\'01-JAN-06\'` and `TO_DATE(…)` work. PL/SQL is a study simulator, not real Oracle.') })));
    ready.then(reset);
    return root;
  }

  /* ---------- normalization lab ---------- */
  function normLabEl(preset) {
    preset = preset || { R: 'ABCD', fds: 'AB->C; BC->D; CD->A', X: 'AB' };
    const box = h('div', { class: 'card', style: { padding: '18px 20px', margin: '14px 0' } });
    const R = h('input', { class: 'inp', value: preset.R }), F = h('textarea', { class: 'inp', rows: 3, style: { fontFamily: 'var(--mono)' } }); F.value = preset.fds;
    const X = h('input', { class: 'inp', value: preset.X || 'AB' }); const D = h('input', { class: 'inp', placeholder: 'e.g. ABC, ACD', value: preset.D || 'ABC, ACD' });
    const out = h('div', { style: { marginTop: '12px' } });
    const get = () => { const r = Norm.uniq(R.value); const fds = Norm.parseFDs(F.value); if (!r) throw new Error('Enter attributes of R'); fds.forEach(f => { if (![...f.l + f.r].every(a => r.includes(a))) throw new Error('FD ' + f.l + '→' + f.r + ' uses an attribute not in R'); }); return { r, fds }; };
    const set = (s) => h('span', { class: 'setch' }, '{' + s.split('').join(', ') + '}');
    const wrapErr = (fn) => () => { out.innerHTML = ''; try { fn(); } catch (e) { out.append(h('div', { class: 'fb bad' }, e.message)); } };
    const doClosure = wrapErr(() => {
      const { r, fds } = get(); const x = Norm.uniq(X.value); const tr = []; const c = Norm.closure(x, fds, tr);
      out.append(h('div', null, h('b', null, 'Closure of '), set(x), h('b', null, ' = '), set(c), Norm.isSuperkey(x, r, fds) ? h('span', { class: 'chip ok', style: { marginLeft: '8px' } }, 'superkey') : h('span', { class: 'chip warn', style: { marginLeft: '8px' } }, 'not a superkey')));
      out.append(h('div', { class: 'trace', style: { marginTop: '8px' } }, tr.map((t, i) => h('div', null, (i ? 'step ' + i + ': ' : '') + t.why + '  ⇒ ', set(t.set)))));
    });
    const doKeys = wrapErr(() => {
      const { r, fds } = get(); const ks = Norm.candidateKeys(r, fds); const prime = Norm.uniq(ks.join(''));
      out.append(h('div', null, h('b', null, 'Candidate keys: '), ks.map(k => set(k))), h('div', { class: 'muted', style: { margin: '6px 0' } }, 'Prime attributes: ' + (prime || '–') + '   ·   Non-prime: ' + (Norm.uniq([...r].filter(a => !prime.includes(a)).join('')) || '–')));
      const rows = Norm.closureTable(r, fds).filter(x => x.X.length <= 3);
      out.append(h('div', { class: 'tbl' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'X'), h('th', null, 'X⁺'), h('th', null, 'superkey?'))), h('tbody', null, rows.map(x => h('tr', null, h('td', null, x.X), h('td', null, x.plus), h('td', null, x.plus.length === r.length ? '✔' : '')))))));
    });
    const doNF = wrapErr(() => {
      const { r, fds } = get(); const ks = Norm.candidateKeys(r, fds); const v = Norm.bcnfViolations(r, fds); const nf3 = Norm.is3NF(r, fds);
      out.append(h('div', null, h('b', null, 'Candidate keys: '), ks.map(k => set(k))));
      out.append(h('div', { class: 'fb ' + (v.length ? 'bad' : 'ok'), style: { marginTop: '8px' } }, h('b', null, v.length ? 'Not in BCNF' : 'In BCNF ✔'), v.length ? v.map(f => h('div', null, f.l + ' → ' + f.r + ': LHS ' + f.l + ' is not a superkey (closure ' + Norm.closure(f.l, fds) + ')')) : 'Every FD has a superkey on its left side.'));
      out.append(h('div', { class: 'fb ' + (nf3 ? 'ok' : 'bad') }, h('b', null, nf3 ? 'In 3NF ✔' : 'Not in 3NF'), nf3 ? 'For each FD X→A: X is a superkey OR A is a prime attribute.' : 'Some FD has a non-superkey LHS and a non-prime RHS attribute.'));
    });
    const doDecomp = wrapErr(() => {
      const { r, fds } = get(); const res = Norm.bcnfDecompose(r, fds);
      if (!res.steps.length) { out.append(h('div', { class: 'fb ok' }, 'Already in BCNF – nothing to decompose.')); return; }
      res.steps.forEach((s, i) => out.append(h('div', { class: 'callout note' }, h('span', { class: 'ic' }, String(i + 1)), h('p', null, 'Split ', set(s.split), ' on violating FD ', h('b', null, s.fd.l + ' → ' + s.fd.r), ' into ', set(s.R1), ' (= X⁺ ∩ R) and ', set(s.R2), ' (= X ∪ rest).'))));
      out.append(h('div', null, h('b', null, 'Final BCNF relations: '), res.relations.map(x => set(x))));
      const ch = Norm.chase(r, fds, res.relations), pr = Norm.preserved(r, fds, res.relations);
      out.append(h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'chip ' + (ch.lossless ? 'ok' : 'warn') }, ch.lossless ? 'lossless join ✔' : 'lossy'), h('span', { class: 'chip ' + (pr.preserved ? 'ok' : 'warn') }, pr.preserved ? 'dependency preserving ✔' : 'FDs lost: ' + pr.lost.map(f => f.l + '→' + f.r).join(', '))));
      out.append(h('div', { class: 'muted', style: { fontSize: '.85rem', marginTop: '6px' } }, 'BCNF decomposition is always lossless but not always dependency-preserving. Different violating-FD choices can give different (equally valid) answers.'));
    });
    const doDec = wrapErr(() => {
      const { r, fds } = get(); const rels = D.value.split(/[,;\s]+/).filter(Boolean).map(Norm.uniq);
      if (rels.length < 2) throw new Error('Give at least two relations, e.g. ABC, ACD');
      if (Norm.uniq(rels.join('')) !== r) throw new Error('The relations must together cover all attributes of R');
      const ch = Norm.chase(r, fds, rels), pr = Norm.preserved(r, fds, rels);
      out.append(h('div', { class: 'row' }, h('span', { class: 'chip ' + (ch.lossless ? 'ok' : 'warn') }, ch.lossless ? 'lossless join ✔' : 'LOSSY join ✗'), h('span', { class: 'chip ' + (pr.preserved ? 'ok' : 'warn') }, pr.preserved ? 'dependency preserving ✔' : 'FDs not preserved: ' + pr.lost.map(f => f.l + '→' + f.r).join(', '))));
      if (rels.length === 2) { const inter = rels[0].split('').filter(a => rels[1].includes(a)).join(''); const cl = Norm.closure(inter, fds); out.append(h('p', null, 'Quick test (2 relations): R1 ∩ R2 = ', set(inter), ', its closure is ', set(cl), ' → ', (r.split('').every(a => cl.includes(a)) || rels.some(x => x.split('').every(a => cl.includes(a)))) ? 'it determines R1 or R2, so lossless.' : 'it does not determine R1 or R2, so NOT lossless.')); }
      out.append(h('div', { class: 'tbl' }, h('table', { style: { fontFamily: 'var(--mono)' } }, h('thead', null, h('tr', null, ch.attrs.map(a => h('th', null, a)))), h('tbody', null, ch.table.map(row => h('tr', null, ch.attrs.map(a => h('td', null, row[a]))))))), h('div', { class: 'muted', style: { fontSize: '.82rem' } }, 'Chase table: a row of all “a” symbols means lossless.'));
    });
    box.append(h('h3', { style: { marginTop: 0 } }, '📐 Normalization lab'),
      h('div', { class: 'kv' }, h('label', null, 'Attributes of R'), R), h('div', { class: 'kv' }, h('label', null, 'FDs (one per line / ;)'), F), h('div', { class: 'kv' }, h('label', null, 'Closure of X ='), X), h('div', { class: 'kv' }, h('label', null, 'Check decomposition'), D),
      h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: doClosure }, 'Closure X⁺'), h('button', { class: 'btn', onclick: doKeys }, 'Candidate keys'), h('button', { class: 'btn', onclick: doNF }, 'BCNF / 3NF?'), h('button', { class: 'btn', onclick: doDecomp }, 'Decompose to BCNF'), h('button', { class: 'btn', onclick: doDec }, 'Check decomposition')), out);
    return box;
  }
  function normPage() {
    const root = h('div'); root.append(h('h1', null, 'Normalization lab'), h('p', { class: 'muted', style: { maxWidth: '70ch' } }, 'Type any relation and FDs (e.g. ', h('code', null, 'AB->C; D->E'), '). Every answer shows its working so you can copy the method onto the exam paper.'));
    root.append(normLabEl());
    root.append(h('h2', null, 'Random drill'), randomDrill()); return root;
  }
  function randomDrill() {
    const box = h('div'); const gen = () => {
      box.innerHTML = ''; const p = Norm.randomProblem(); const w = { id: 'drill', num: 0 };
      const mk = (id, text, kind, solve, hint) => ({ id, type: 'calc', q: text, R: p.R, fds: p.fdText, kind, solve, hint });
      const x = p.fds[0].l + (p.R.replace(new RegExp('[' + p.fds[0].l + ']', 'g'), '')[0] || '');
      const qs = [mk('d' + Math.random(), 'Find the closure of **' + x + '**.', 'set', (R, f, N) => N.closure(x, f), 'Start with the set, keep applying any FD whose left side is inside it.'),
        mk('d' + Math.random(), 'List **all candidate keys**.', 'keys', (R, f, N) => N.candidateKeys(R, f), 'Attributes never on a right-hand side must be in every key.'),
        mk('d' + Math.random(), 'Is R in **BCNF**?', 'bool', (R, f, N) => N.isBCNF(R, f), 'Every FD’s left side must be a superkey.')];
      qs.forEach((q, i) => box.append(calcQuestion(w, q, i)));
      box.append(h('button', { class: 'btn', onclick: gen }, '🎲 New problem'));
    };
    gen(); return box;
  }

  /* ---------- rapid fire ---------- */
  function rapidPage() {
    const root = h('div'); const pool = [];
    Weeks.forEach(w => (w.quiz || []).forEach((q, i) => pool.push({ w, q: Object.assign({ type: 'mcq', id: 'r' + i }, q) })));
    root.append(h('h1', null, 'Rapid-fire'), h('p', { class: 'muted' }, 'Random concept questions from every week. Streak resets on a miss.'));
    let streak = 0, best = 0; const stage = h('div'); const bar = h('div', { class: 'row', style: { margin: '10px 0' } });
    const next = () => {
      stage.innerHTML = ''; const it = pool[Math.floor(Math.random() * pool.length)];
      const q = Object.assign({}, it.q, { id: 'rf' + Math.random() });
      stage.append(h('div', { class: 'chip acc', style: { marginBottom: '6px' } }, 'Week ' + it.w.num + ' · ' + it.w.title));
      stage.append(mcqQuestion({ id: 'rapid' }, q, 0, (ok) => { streak = ok ? streak + 1 : 0; best = Math.max(best, streak); upd(); stage.append(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn pri', onclick: next }, 'Next →'))); }));
    };
    const upd = () => { bar.innerHTML = ''; bar.append(h('span', { class: 'chip acc' }, '🔥 streak ' + streak), h('span', { class: 'chip' }, 'best ' + best)); };
    upd(); root.append(bar, stage); next(); return root;
  }

  /* ---------- cheat sheet ---------- */
  function cheatPage() {
    const root = h('div'); root.append(h('h1', null, 'Cheat sheet'), h('p', { class: 'muted' }, 'Everything on one page. Skim before the exam.'));
    root.append(h('h2', null, 'Clause order (the one everyone forgets)'), codeBox({ code: 'SELECT   columns / expressions / aggregates\nFROM     tables (JOINs)\nWHERE    row filter            -- no aggregates here\nGROUP BY columns\nHAVING   group filter          -- aggregates allowed\nORDER BY columns [ASC|DESC]    -- last, can use aliases', lang: 'sql', run: false }));
    root.append(h('div', { class: 'flow' }, ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'ORDER BY'].map((s, i) => [i ? h('em', null, '→') : null, h('span', null, s)]).flat()), h('p', { class: 'muted' }, 'Logical execution order – this is why WHERE can’t see aggregates and ORDER BY can see aliases.'));
    Weeks.forEach(w => {
      if (!w.cheat) return;
      root.append(h('h2', null, 'Week ' + w.num + ' · ' + w.title));
      const code = w.cheat.map(c => (c[0] ? '-- ' + c[0] + '\n' : '') + c[1]).join('\n\n');
      root.append(codeBox({ code, lang: w.num >= 8 ? 'plsql' : 'sql', run: false }));
    });
    root.append(h('h2', null, 'Oracle ↔ this sandbox'));
    root.append(blockEl({}, { k: 'table', head: ['Oracle (exam)', 'Sandbox here'], rows: [['`VARCHAR2`, `NUMBER(p,s)`', 'accepted as-is'], ['`MINUS`', 'rewritten to `EXCEPT`'], ['`> ALL (…)`, `= ANY (…)`', 'rewritten behind the scenes'], ['`SYSDATE`, `FROM DUAL`, `NVL`', 'supported'], ['`ALTER TABLE … MODIFY`, `DROP CONSTRAINT`', 'not executable → practised as “write” questions'], ['Date literal `\'01-JAN-06\'`', 'use ISO `\'2006-01-01\'` here (or `TO_DATE` in Oracle)'], ['PL/SQL', 'study simulator (blocks, procs, funcs, cursors, triggers)']] }));
    return root;
  }

  /* ---------- sidebar & router ---------- */
  function renderSide() {
    const route = parse();
    side.innerHTML = '';
    side.append(h('div', { class: 'brand', onclick: () => { location.hash = '#/'; } }, h('i', null, '⛁'), 'SQL Midterm Lab'));
    const nav = h('div', { class: 'nav' });
    nav.append(h('a', { href: '#/', class: route.p === 'home' ? 'on' : '' }, h('span', { class: 'wn' }, '⌂'), 'Home'));
    nav.append(h('div', { class: 'nav-h' }, 'Weekly plan'));
    Weeks.forEach(w => {
      const st = weekStats(w); const done = st.total && st.done === st.total;
      nav.append(h('a', { href: '#/w/' + w.num, class: route.p === 'w' && route.n === w.num ? 'on' : '' }, h('span', { class: 'wn' }, w.num), w.nav || w.title, h('span', { class: 'dot' + (done ? ' done' : '') }, done ? '✓' : (st.done ? st.done + '/' + st.total : ''))));
    });
    nav.append(h('div', { class: 'nav-h' }, 'Tools'));
    [['#/sqlplus', 'sqlplus', '▮', 'SQL*Plus terminal'], ['#/play', 'play', '⌨', 'Playground'], ['#/norm', 'norm', '📐', 'Normalization lab'], ['#/rapid', 'rapid', '⚡', 'Rapid-fire'], ['#/cheat', 'cheat', '📋', 'Cheat sheet']].forEach(([href, p, ic, t]) => nav.append(h('a', { href, class: route.p === p ? 'on' : '' }, h('span', { class: 'wn' }, ic), t)));
    side.append(nav);
    side.append(h('div', { class: 'side-foot' }, h('button', { class: 'btn sm', onclick: () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!S.theme && matchMedia('(prefers-color-scheme: dark)').matches); S.theme = dark ? 'light' : 'dark'; save(); applyTheme(); } }, '🌓 Theme')));
  }
  function parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!parts.length) return { p: 'home' };
    if (parts[0] === 'w') return { p: 'w', n: +parts[1], tab: parts[2] || 'learn' };
    return { p: parts[0] };
  }
  function render() {
    const r = parse(); view.innerHTML = '';
    let el;
    try {
      el = r.p === 'home' ? homePage() : r.p === 'w' ? weekPage(r.n, r.tab) : r.p === 'play' ? playPage() : r.p === 'sqlplus' ? SqlPlus.page({ Weeks }) : r.p === 'norm' ? normPage() : r.p === 'rapid' ? rapidPage() : r.p === 'cheat' ? cheatPage() : homePage();
    } catch (e) { el = h('div', { class: 'fb bad' }, 'Render error: ' + e.message); console.error(e); }
    view.append(el); window.scrollTo(0, 0); renderSide(); side.classList.remove('open');
  }
  window.addEventListener('hashchange', render);
  document.getElementById('menu').addEventListener('click', () => side.classList.toggle('open'));
  view.append(h('p', { class: 'muted' }, 'Loading SQL engine…'));
  ready.then(render, (e) => { view.innerHTML = ''; view.append(h('div', { class: 'fb bad' }, 'Could not start the SQL engine: ' + e.message)); });
  window.__app = { Weeks, S, Engine, Plsql };
})();
