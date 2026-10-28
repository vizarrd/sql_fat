/* ============================================================
   SQL*Plus terminal – a black console that behaves like SQL*Plus
   on the lab PC: SQL buffer + line numbers, / RUN LIST CHANGE …,
   SET / SHOW / COLUMN / BREAK / COMPUTE, DESC, SPOOL, @scripts,
   & substitution, bind variables, sequences, data dictionary.
   Committed data is saved per user name in localStorage.
   ============================================================ */
(function (G) {
  'use strict';

  /* ---------- storage ---------- */
  const LS = 'sqlplus.v1.';
  const lsGet = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  /* ---------- small helpers ---------- */
  const padL = (s, n, c = ' ') => { s = String(s); return s.length >= n ? s : c.repeat(n - s.length) + s; };
  const padR = (s, n) => { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const MONTH = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const DAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const p2 = (n) => padL(n, 2, '0');
  const VERSION = 'Oracle Database 21c Express Edition Release 21.0.0.0.0 - Production\nVersion 21.3.0.0.0';
  function bannerDate(d) { return cap(DAY[d.getDay()]).slice(0, 3) + ' ' + cap(MON[d.getMonth()]) + ' ' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + ' ' + d.getFullYear(); }
  function tzOff(d) { const o = -d.getTimezoneOffset(); return (o >= 0 ? '+' : '-') + p2(Math.floor(Math.abs(o) / 60)) + ':' + p2(Math.abs(o) % 60); }
  function loginDate(d) { return cap(DAY[d.getDay()]).slice(0, 3) + ' ' + cap(MON[d.getMonth()]) + ' ' + p2(d.getDate()) + ' ' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + ' ' + tzOff(d); }
  const oraToday = () => { const d = new Date(); return p2(d.getDate()) + '-' + MON[d.getMonth()] + '-' + String(d.getFullYear()).slice(2); };
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const isIsoDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(v);
  function isoToOra(v) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? m[3] + '-' + MON[+m[2] - 1] + '-' + m[1].slice(2) : v; }
  const elapsed = (ms) => { const cs = Math.round(ms / 10); return 'Elapsed: ' + p2(Math.floor(cs / 360000)) + ':' + p2(Math.floor(cs / 6000) % 60) + ':' + p2(Math.floor(cs / 100) % 60) + '.' + p2(cs % 100); };

  /* ---------- lexical helpers (strings / quoted names / comments aware) ---------- */
  // split text into segments: c = code, s = 'string', q = "quoted", m = comment
  function segs(s) {
    const out = []; let cur = '', i = 0;
    const push = (t, v) => { if (cur) { out.push({ t: 'c', v: cur }); cur = ''; } out.push({ t, v }); };
    while (i < s.length) {
      const c = s[i], n = s[i + 1];
      if (c === "'") { let j = i + 1; while (j < s.length) { if (s[j] === "'") { if (s[j + 1] === "'") { j += 2; continue; } break; } j++; } push('s', s.slice(i, j + 1)); i = j + 1; continue; }
      if (c === '"') { let j = s.indexOf('"', i + 1); if (j < 0) j = s.length; push('q', s.slice(i, j + 1)); i = j + 1; continue; }
      if (c === '-' && n === '-') { let j = s.indexOf('\n', i); if (j < 0) j = s.length; push('m', s.slice(i, j)); i = j; continue; }
      if (c === '/' && n === '*') { let j = s.indexOf('*/', i + 2); j = j < 0 ? s.length : j + 2; push('m', s.slice(i, j)); i = j; continue; }
      cur += c; i++;
    }
    if (cur) out.push({ t: 'c', v: cur });
    return out;
  }
  const codeMap = (s, fn) => segs(s).map(x => (x.t === 'c' ? fn(x.v) : x.v)).join('');
  // strings/comments blanked (same length) – for searching identifiers
  const maskStr = (s) => segs(s).map(x => (x.t === 'c' ? x.v : x.t === 'q' ? x.v : x.v.replace(/[^\n]/g, ' '))).join('');
  // like maskStr but everything inside parentheses is blanked too – for top-level searches
  function maskTop(s) {
    const m = maskStr(s); let out = '', d = 0;
    for (let i = 0; i < m.length; i++) {
      const ch = m[i];
      if (ch === '(') { out += d ? ' ' : '('; d++; continue; }
      if (ch === ')') { d = Math.max(0, d - 1); out += d ? ' ' : ')'; continue; }
      out += d ? (ch === '\n' ? '\n' : ' ') : ch;
    }
    return out;
  }
  // split on top-level commas → [{text, off}]
  function splitTop(s, off0 = 0) {
    const m = maskTop(s); const out = []; let last = 0;
    for (let i = 0; i <= m.length; i++) if (i === m.length || m[i] === ',') { out.push({ text: s.slice(last, i), off: off0 + last }); last = i + 1; }
    return out;
  }
  function parenContent(s, from = 0) {
    const m = maskStr(s); const o = m.indexOf('(', from); if (o < 0) return null; let d = 0;
    for (let i = o; i < m.length; i++) { if (m[i] === '(') d++; else if (m[i] === ')') { d--; if (!d) return { text: s.slice(o + 1, i), start: o, end: i + 1 }; } }
    return null;
  }
  const idList = (s) => (s || '').split(',').map(x => x.trim().replace(/"/g, '').toLowerCase()).filter(Boolean);
  // find an identifier/word (outside strings) → {line, col} (0-based col)
  function findTok(text, tok, from = 0) {
    if (!tok) return null;
    const m = maskStr(text);
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp((/^\w/.test(tok) ? '(^|[^\\w$#.])' : '()') + '(' + esc + ')' + (/\w$/.test(tok) ? '(?![\\w$#])' : ''), 'ig');
    re.lastIndex = from; const r = re.exec(m); if (!r) return null;
    return posOf(text, r.index + r[1].length);
  }
  function posOf(text, idx) { const before = text.slice(0, idx); const line = before.split('\n').length; return { line, col: idx - before.lastIndexOf('\n') - 1 }; }
  // tokenise command arguments respecting '…' and "…"
  function args(s) { const out = []; const re = /'((?:[^']|'')*)'|"((?:[^"]|"")*)"|(\S+)/g; let m; while ((m = re.exec(s))) out.push(m[1] !== undefined ? { v: m[1].replace(/''/g, "'"), q: true } : m[2] !== undefined ? { v: m[2].replace(/""/g, '"'), q: true } : { v: m[3], q: false }); return out; }
  const unq = (s) => { s = (s || '').trim(); return /^'.*'$|^".*"$/.test(s) ? s.slice(1, -1) : s; };
  function parseType(t) {
    const m = /^\s*([A-Za-z_][\w ]*?)\s*(?:\(\s*(\d+)\s*(?:,\s*(-?\d+)\s*)?(?:byte|char)?\s*\))?\s*$/i.exec(t || '');
    return m ? { base: m[1].toUpperCase().replace(/\s+/g, ' '), size: m[2] ? +m[2] : null, scale: m[3] !== undefined ? +m[3] : null } : { base: (t || '').toUpperCase(), size: null, scale: null };
  }
  function oraType(t) {
    const T = parseType(t); const b = T.base;
    if (!b) return 'VARCHAR2(4000)';
    if (/^(VARCHAR2|VARCHAR|NVARCHAR2|CHARACTER VARYING)$/.test(b)) return (b === 'NVARCHAR2' ? 'NVARCHAR2' : 'VARCHAR2') + '(' + (T.size || 4000) + ')';
    if (/^(CHAR|NCHAR|CHARACTER)$/.test(b)) return (b === 'NCHAR' ? 'NCHAR' : 'CHAR') + '(' + (T.size || 1) + ')';
    if (/^(INT|INTEGER|SMALLINT|BIGINT|TINYINT)$/.test(b)) return 'NUMBER(38)';
    if (/^(NUMBER|NUMERIC|DECIMAL|DEC)$/.test(b)) return T.size ? 'NUMBER(' + T.size + (T.scale ? ',' + T.scale : '') + ')' : 'NUMBER';
    if (b === 'NUM') return 'NUMBER';
    if (b === 'FLOAT' || b === 'DOUBLE' || b === 'DOUBLE PRECISION') return 'FLOAT(' + (T.size || 126) + ')';
    if (b === 'REAL') return 'FLOAT(63)';
    if (b === 'TEXT' || b === 'STRING') return 'VARCHAR2(4000)';
    if (b === 'TIMESTAMP') return 'TIMESTAMP(6)';
    return b + (T.size ? '(' + T.size + (T.scale !== null ? ',' + T.scale : '') + ')' : '');
  }
  const typeKind = (T) => !T || !T.base ? null : /CHAR|CLOB|TEXT|STRING/.test(T.base) ? 'char' : /DATE|TIME/.test(T.base) ? 'date' : /NUM|INT|DEC|FLOAT|REAL|DOUBLE/.test(T.base) ? 'num' : null;

  /* ---------- number formatting ---------- */
  function roundTo(v, d) { const k = Math.pow(10, d); return Math.round((v + Number.EPSILON * Math.sign(v)) * k) / k; }
  function numStr(v) {
    let s = Number.isInteger(v) && Math.abs(v) < 1e21 ? String(v) : String(v);
    if (/e/i.test(s)) { if (Math.abs(v) < 1) s = v.toFixed(20).replace(/0+$/, '').replace(/\.$/, ''); }
    return s.replace(/^(-?)0\./, '$1.');
  }
  function fmtNum(v, w) {
    if (typeof v !== 'number') { const n = Number(v); if (v === '' || isNaN(n)) return String(v); v = n; }
    if (!isFinite(v)) return '~';
    if (!Number.isInteger(v)) v = Number(v.toPrecision(15));
    let s = numStr(v); if (s.length <= w && !/e/i.test(s)) return s;
    const neg = v < 0, ip = Math.trunc(Math.abs(v)); const intLen = (ip === 0 ? 0 : String(ip).length) + (neg ? 1 : 0);
    if (intLen <= w - 2 && Math.abs(v) >= 1e-5) { s = numStr(roundTo(v, w - intLen - 1)); if (s.length <= w) return s; }
    if (intLen <= w && Math.abs(v) >= 1) { s = numStr(Math.round(v)); if (s.length <= w) return s; }
    const digits = w - 6 - (neg ? 1 : 0); if (digits < 0) return '#'.repeat(w);
    s = v.toExponential(digits).toUpperCase().replace(/E([+-])(\d)$/, 'E$10$2');
    return s.length <= w ? s : '#'.repeat(w);
  }
  const isNumModel = (f) => /^(fm)?[$L]?[09,.GDVS]*[09][09,.GD]*(MI|PR|S)?$/i.test(f) && !/^a\d+$/i.test(f);
  function fmtModel(v, f) {
    const width = f.replace(/^fm/i, '').length + 1;
    if (typeof v !== 'number') { const n = Number(v); if (v === '' || isNaN(n)) return String(v); v = n; }
    let fmt = f.replace(/^fm/i, '').replace(/G/gi, ',').replace(/D/gi, '.');
    const dollar = /\$/.test(fmt); fmt = fmt.replace(/\$|L/gi, '').replace(/MI|PR|S$/i, '');
    const dot = fmt.indexOf('.'); const intF = dot < 0 ? fmt : fmt.slice(0, dot); const decF = dot < 0 ? '' : fmt.slice(dot + 1).replace(/[^09]/g, '');
    const nd = decF.length; const a = Math.abs(roundTo(v, nd)); const parts = a.toFixed(nd).split('.');
    let ids = parts[0] === '0' ? '' : parts[0];
    const slots = (intF.match(/[09]/g) || []).length;
    if (ids.length > slots) return '#'.repeat(width);
    let res = '', k = ids.length - 1; const zeroAt = intF.indexOf('0');
    for (let i = intF.length - 1; i >= 0; i--) {
      const c = intF[i];
      if (c === '9' || c === '0') { if (k >= 0) res = ids[k--] + res; else if (zeroAt >= 0 && i >= zeroAt) res = '0' + res; else res = ' ' + res; }
      else if (c === ',') { res = (k >= 0 || (zeroAt >= 0 && i > zeroAt)) ? ',' + res : ' ' + res; }
    }
    res = res.replace(/^ +/, '');
    if (!res && !nd) res = '0';
    let out = res + (nd ? '.' + parts[1] : '');
    if (dollar) out = '$' + out; if (v < 0 && roundTo(v, nd) !== 0) out = '-' + out;
    return padL(out, width);
  }

  /* ---------- date helpers for TO_CHAR / TO_DATE ---------- */
  function parseIso(v) { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v)); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : null; }
  const isoOf = (d, time) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + (time && (d.getHours() || d.getMinutes() || d.getSeconds()) ? ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) : '');
  function dateToChar(d, fmt) {
    let fm = false;
    return fmt.replace(/"([^"]*)"|fm|YYYY|RRRR|YYY|YY|RR|Y|MONTH|Month|month|MON|Mon|mon|MM|DDD|DD|DAY|Day|day|DY|Dy|dy|D|HH24|HH12|HH|MI|SS|AM|PM|A\.M\.|P\.M\.|Q|WW|W|J/g, (t, lit) => {
      if (lit !== undefined) return lit;
      const h = d.getHours();
      switch (t) {
        case 'fm': fm = !fm; return '';
        case 'YYYY': case 'RRRR': return String(d.getFullYear());
        case 'YYY': return String(d.getFullYear()).slice(1);
        case 'YY': case 'RR': return String(d.getFullYear()).slice(2);
        case 'Y': return String(d.getFullYear()).slice(3);
        case 'MONTH': return fm ? MONTH[d.getMonth()] : padR(MONTH[d.getMonth()], 9);
        case 'Month': return fm ? cap(MONTH[d.getMonth()]) : padR(cap(MONTH[d.getMonth()]), 9);
        case 'month': return fm ? MONTH[d.getMonth()].toLowerCase() : padR(MONTH[d.getMonth()].toLowerCase(), 9);
        case 'MON': return MON[d.getMonth()]; case 'Mon': return cap(MON[d.getMonth()]); case 'mon': return MON[d.getMonth()].toLowerCase();
        case 'MM': return fm ? String(d.getMonth() + 1) : p2(d.getMonth() + 1);
        case 'DDD': { const s = new Date(d.getFullYear(), 0, 1); return padL(Math.floor((d - s) / 864e5) + 1, 3, '0'); }
        case 'DD': return fm ? String(d.getDate()) : p2(d.getDate());
        case 'DAY': return fm ? DAY[d.getDay()] : padR(DAY[d.getDay()], 9);
        case 'Day': return fm ? cap(DAY[d.getDay()]) : padR(cap(DAY[d.getDay()]), 9);
        case 'day': return fm ? DAY[d.getDay()].toLowerCase() : padR(DAY[d.getDay()].toLowerCase(), 9);
        case 'DY': return DAY[d.getDay()].slice(0, 3); case 'Dy': return cap(DAY[d.getDay()].slice(0, 3)); case 'dy': return DAY[d.getDay()].slice(0, 3).toLowerCase();
        case 'D': return String(d.getDay() + 1);
        case 'HH24': return p2(h); case 'HH': case 'HH12': return p2(h % 12 || 12);
        case 'MI': return p2(d.getMinutes()); case 'SS': return p2(d.getSeconds());
        case 'AM': case 'PM': return h < 12 ? 'AM' : 'PM'; case 'A.M.': case 'P.M.': return h < 12 ? 'A.M.' : 'P.M.';
        case 'Q': return String(Math.floor(d.getMonth() / 3) + 1);
        case 'WW': { const s = new Date(d.getFullYear(), 0, 1); return p2(Math.floor((d - s) / 864e5 / 7) + 1); }
        case 'W': return String(Math.floor((d.getDate() - 1) / 7) + 1);
        case 'J': return String(Math.floor(d / 864e5) + 2440588);
      }
      return t;
    });
  }
  function charToDate(s, fmt) {
    s = String(s).trim(); if (!fmt) { const iso = Engine.isoFromOracle(s); return iso || (isIsoDate(s) ? s : null); }
    const toks = fmt.toUpperCase().match(/YYYY|RRRR|YY|RR|MONTH|MON|MM|DD|HH24|HH12|HH|MI|SS|AM|PM|[^A-Z]+|[A-Z]+/g) || [];
    let y = 1, mo = 1, d = 1, h = 0, mi = 0, se = 0, pm = null, i = 0;
    for (const t of toks) {
      const take = (re) => { const m = re.exec(s.slice(i)); if (!m) throw new Error('ORA-01861: literal does not match format string'); i += m[0].length; return m[0]; };
      switch (t) {
        case 'YYYY': case 'RRRR': y = +take(/^\d{1,4}/); break;
        case 'YY': case 'RR': { const v = +take(/^\d{1,2}/); y = v < 50 ? 2000 + v : 1900 + v; break; }
        case 'MONTH': { const v = take(/^[A-Za-z]+/).toUpperCase(); mo = MONTH.indexOf(v) + 1 || MON.indexOf(v.slice(0, 3)) + 1; break; }
        case 'MON': mo = MON.indexOf(take(/^[A-Za-z]{3}/).toUpperCase()) + 1; break;
        case 'MM': mo = +take(/^\d{1,2}/); break;
        case 'DD': d = +take(/^\d{1,2}/); break;
        case 'HH24': case 'HH': case 'HH12': h = +take(/^\d{1,2}/); break;
        case 'MI': mi = +take(/^\d{1,2}/); break;
        case 'SS': se = +take(/^\d{1,2}/); break;
        case 'AM': case 'PM': pm = take(/^[AaPp]\.?[Mm]\.?/).toUpperCase()[0] === 'P'; break;
        default: i += Math.min(t.length, s.length - i);
      }
    }
    if (mo < 1 || mo > 12) throw new Error('ORA-01843: not a valid month');
    if (pm !== null) { h = h % 12 + (pm ? 12 : 0); }
    return isoOf(new Date(y, mo - 1, d, h, mi, se), true);
  }

  /* ============================================================ state */
  const DEFAULTS = {
    linesize: 80, pagesize: 14, newpage: 1, numwidth: 10, numformat: '', heading: true, headsep: '|', echo: false, feedback: 6,
    verify: true, timing: false, autocommit: false, serveroutput: false, serverFormat: 'WORD_WRAPPED', serverSize: 'UNLIMITED',
    null: '', sqlprompt: 'SQL> ', defineOn: true, defineChar: '&', escapeOn: false, escapeChar: '\\', concat: '.', colsep: ' ',
    underline: '-', wrap: true, recsep: 'WRAPPED', sqlblanklines: false, termout: true, history: false, historySize: 100, sqlcontinue: '> ', trimspool: false
  };
  let S = null;                 // SET options (per SQL*Plus session)
  let cols = {}, breaks = [], computes = [], ttitle = null, btitle = null;
  let defines = {};             // substitution variables
  let Gs = lsGet('global', null) || {};          // files, recall, history, users
  Gs.files = Gs.files || {}; Gs.recall = Gs.recall || []; Gs.hist = Gs.hist || []; Gs.users = Gs.users || {};
  const saveGlobal = () => lsSet('global', Gs);

  let db = null, sess = null, user = null, U = null;     // connection
  let committed = false, seqDirty = false;
  let buf = { lines: [], cur: 0, plsql: false };         // SQL buffer
  let entry = null, cont = null;                        // statement being typed / hyphen continuation
  let lastErr = null;                                   // for SHOW ERRORS
  let spool = null, timer = null;
  let alive = false, started = false, scriptDepth = 0;
  let weekFiles = {};
  let lastHash = '#/';

  /* ============================================================ UI */
  let ui = null, pending = null; const queue = []; let recallIdx = -1, recallDraft = '';
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function buildUI() {
    const root = el('div', 'spx');
    const bar = el('div', 'spx-bar');
    const ic = el('span', 'spx-ic'); ic.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1" y="2" width="14" height="12" rx="1.5" fill="#c74634"/><path d="M4 6l2.5 2L4 10" stroke="#fff" stroke-width="1.4" fill="none"/><path d="M8 10.5h4" stroke="#fff" stroke-width="1.4"/></svg>';
    const title = el('span', 'spx-t', 'SQL Plus');
    const hint = el('span', 'spx-hint', 'any user-name / password logs in · each user keeps its own saved schema · HELP INDEX lists commands');
    const bMin = el('button', 'spx-b', '\u2013'); bMin.title = 'Back to the site (session stays open)';
    const bMax = el('button', 'spx-b', '\u25A1'); bMax.title = 'Full screen';
    const bX = el('button', 'spx-b spx-x', '\u2715'); bX.title = 'Close window (uncommitted work is rolled back, like closing SQL*Plus)';
    bar.append(ic, title, hint, bMin, bMax, bX);
    const scr = el('div', 'spx-scr'); const out = el('pre', 'spx-out'); const inp = el('pre', 'spx-in');
    scr.append(out, inp);
    const ta = el('textarea', 'spx-ta'); ta.setAttribute('autocomplete', 'off'); ta.setAttribute('autocapitalize', 'off'); ta.setAttribute('autocorrect', 'off'); ta.spellcheck = false; ta.setAttribute('aria-label', 'SQL*Plus input');
    root.append(bar, scr, ta);
    ui = { root, scr, out, inp, ta, hint };
    bMin.onclick = () => leave();
    bMax.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(() => { }); };
    bX.onclick = () => { closeSession(false); leave(); };
    scr.addEventListener('mouseup', () => { if (!String(window.getSelection() || '')) ta.focus({ preventScroll: true }); });
    root.addEventListener('keydown', (e) => { if (e.target !== ta && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !document.querySelector('.spx-np')) ta.focus({ preventScroll: true }); });
    ta.addEventListener('keydown', onKey);
    ta.addEventListener('input', drawInput);
    ta.addEventListener('paste', onPaste);
    ta.addEventListener('focus', () => root.classList.add('focus'));
    ta.addEventListener('blur', () => root.classList.remove('focus'));
    document.addEventListener('selectionchange', () => { if (document.activeElement === ta) drawInput(); });
    root.addEventListener('dragover', (e) => { e.preventDefault(); });
    root.addEventListener('drop', (e) => {
      e.preventDefault();
      [...(e.dataTransfer.files || [])].forEach(f => { const r = new FileReader(); r.onload = () => { putFile(f.name, String(r.result)); flash('Saved ' + f.name + ' – run it with @' + f.name.replace(/\.sql$/i, '')); }; r.readAsText(f); });
    });
  }
  function flash(t) { const h = ui.hint; const old = h.dataset.t || h.textContent; h.dataset.t = old; h.textContent = t; h.classList.add('on'); clearTimeout(flash.t); flash.t = setTimeout(() => { h.textContent = old; h.classList.remove('on'); }, 4000); }
  let scrollQueued = false;
  function scrollEnd() { if (scrollQueued) return; scrollQueued = true; requestAnimationFrame(() => { scrollQueued = false; ui.scr.scrollTop = ui.scr.scrollHeight; }); }
  function print(t) {
    if (t === undefined || t === null || t === '') return;
    if (scriptDepth && !S.termout) { if (spool) spool.text += t; return; }
    ui.out.append(document.createTextNode(t));
    if (spool) spool.text += t;
    if (ui.out.childNodes.length > 3000) { const all = ui.out.textContent; ui.out.textContent = all.slice(-400000); }
    scrollEnd();
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function drawInput() {
    if (!ui) return;
    if (!pending) { ui.inp.innerHTML = ''; return; }
    const v = pending.hidden ? '' : ui.ta.value; const s = pending.hidden ? 0 : ui.ta.selectionStart;
    ui.inp.innerHTML = esc(pending.prompt) + esc(v.slice(0, s)) + '<span class="spx-cur">' + esc(v[s] && v[s] !== '\n' ? v[s] : ' ') + '</span>' + esc(v.slice(s + 1));
    scrollEnd();
  }
  function readLine(prompt, opt) {
    opt = opt || {};
    return new Promise(res => {
      if (queue.length) { const l = queue.shift(); print(prompt + (opt.hidden ? '' : l) + '\n'); if (!opt.hidden) remember(l); res(l); return; }
      pending = { prompt, hidden: !!opt.hidden, res }; recallIdx = -1; drawInput();
    });
  }
  function submit(v) {
    if (!pending) { queue.push(v); ui.ta.value = ''; return; }
    const p = pending; pending = null; ui.ta.value = '';
    print(p.prompt + (p.hidden ? '' : v) + '\n');
    if (!p.hidden) remember(v);
    drawInput(); p.res(v);
  }
  function remember(v) { if (v.trim() && Gs.recall[Gs.recall.length - 1] !== v) { Gs.recall.push(v); if (Gs.recall.length > 300) Gs.recall.shift(); saveGlobal(); } }
  function onKey(e) {
    const ta = ui.ta;
    if (e.key === 'Enter') { e.preventDefault(); submit(ta.value); return; }
    if (e.key === 'Escape') { e.preventDefault(); ta.value = ''; drawInput(); return; }
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; drawInput(); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && pending && !pending.hidden) {
      e.preventDefault(); const R = Gs.recall; if (!R.length) return;
      if (recallIdx === -1) { recallDraft = ta.value; recallIdx = R.length; }
      recallIdx += e.key === 'ArrowUp' ? -1 : 1; if (recallIdx < 0) recallIdx = 0;
      if (recallIdx >= R.length) { recallIdx = -1; ta.value = recallDraft; } else ta.value = R[recallIdx];
      ta.selectionStart = ta.selectionEnd = ta.value.length; drawInput(); return;
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); ui.scr.scrollTop += (e.key === 'PageUp' ? -1 : 1) * ui.scr.clientHeight * 0.9; return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && ta.selectionStart === ta.selectionEnd && !String(window.getSelection() || '')) {
      e.preventDefault(); if (pending) { const p = pending; pending = null; print(p.prompt + (p.hidden ? '' : ta.value) + '^C\n'); ta.value = ''; drawInput(); p.res(null); } return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); ui.out.textContent = ''; return; }
    requestAnimationFrame(drawInput);
  }
  function onPaste(e) {
    const t = (e.clipboardData || window.clipboardData).getData('text'); if (!/\n/.test(t)) return;
    e.preventDefault(); const ta = ui.ta;
    const all = (ta.value.slice(0, ta.selectionStart) + t + ta.value.slice(ta.selectionEnd)).replace(/\r\n?/g, '\n');
    const parts = all.split('\n'); const last = parts.pop();
    ta.value = '';
    const first = parts.shift(); queue.push(...parts);
    if (pending) submit(first); else queue.unshift(first);
    ta.value = last; drawInput();
  }

  /* notepad-style editor for EDIT */
  function notepad(name, text) {
    return new Promise(res => {
      const ov = el('div', 'spx-np'); const win = el('div', 'spx-npw');
      const tb = el('div', 'spx-npt'); tb.append(el('span', null, name + ' - Notepad'), el('span', 'sp'));
      const x = el('button', null, '\u2715'); tb.append(x);
      const menu = el('div', 'spx-npm'); ['File', 'Edit', 'Format', 'View', 'Help'].forEach(m => menu.append(el('span', null, m)));
      const area = el('textarea'); area.value = text; area.spellcheck = false;
      const foot = el('div', 'spx-npf'); const sv = el('button', 'pri', 'Save & close  (Ctrl+S)'); const cn = el('button', null, 'Cancel  (Esc)');
      foot.append(el('span', null, 'Edit, then save – SQL*Plus reloads the file. End a SQL statement with a line containing only /'), sv, cn);
      win.append(tb, menu, area, foot); ov.append(win); ui.root.append(ov);
      const done = (ok) => { ov.remove(); ui.ta.focus({ preventScroll: true }); res(ok ? area.value : null); };
      sv.onclick = () => done(true); cn.onclick = () => done(false); x.onclick = () => done(true);
      area.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); done(false); } if (e.key === 'Tab') { e.preventDefault(); const s = area.selectionStart; area.value = area.value.slice(0, s) + '  ' + area.value.slice(area.selectionEnd); area.selectionStart = area.selectionEnd = s + 2; } });
      setTimeout(() => area.focus(), 0);
    });
  }

  /* ============================================================ files */
  const fileKey = (n) => n.trim().replace(/^.*[\\/]/, '').toLowerCase();
  function withExt(n, ext) { n = n.trim().replace(/^.*[\\/]/, ''); return /\.[A-Za-z0-9]+$/.test(n) ? n : n + '.' + ext; }
  function getFile(n) { const k = fileKey(n); if (Gs.files[k]) return Gs.files[k].text; if (weekFiles[k]) return weekFiles[k].text; return null; }
  function putFile(n, text) { const name = n.trim().replace(/^.*[\\/]/, ''); Gs.files[fileKey(name)] = { name, text, t: Date.now() }; saveGlobal(); }
  function allFiles() { const m = {}; Object.values(weekFiles).forEach(f => { m[f.name.toLowerCase()] = f; }); Object.values(Gs.files).forEach(f => { m[f.name.toLowerCase()] = f; }); return Object.values(m).sort((a, b) => a.name.localeCompare(b.name)); }
  function download(name, text) { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text.replace(/\n/g, '\r\n')], { type: 'text/plain' })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch (e) { } }

  /* ============================================================ connection / persistence */
  const q = (sql, params) => { const st = db.db.prepare(sql); if (params) st.bind(params); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
  const tableExists = (n) => q("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [n]).length > 0;
  const realName = (n) => { const r = q("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)", [n]); return r.length ? r[0].name : null; };
  const tableInfo = (n) => { try { return q("SELECT name, type, \"notnull\" AS nn, pk, dflt_value AS dflt FROM pragma_table_info(?)", [n]); } catch (e) { return []; } };

  function registerFns(raw) {
    const f = (n, fn) => { try { raw.create_function(n, fn); } catch (e) { } };
    f('TO_CHAR', (v, fmt) => {
      if (v === null || v === undefined) return null;
      if (fmt === null || fmt === undefined) return typeof v === 'number' ? numStr(v).replace(/^(-?)\./, '$10.') : String(v);
      if (typeof v === 'number' || (/^-?\d+(\.\d+)?$/.test(String(v)) && !/[YMDHS]/i.test(fmt.replace(/fm/i, '')))) return isNumModel(fmt) ? fmtModel(+v, fmt) : String(v);
      const d = parseIso(v); return d ? dateToChar(d, fmt) : String(v);
    });
    f('TO_DATE', (s, fmt) => (s === null ? null : charToDate(s, fmt)));
    f('ADD_MONTHS', (v, n) => { const d = parseIso(v); if (!d) return null; const day = d.getDate(); const t = new Date(d.getFullYear(), d.getMonth() + n, 1); const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); t.setDate(Math.min(day, last)); return isoOf(t); });
    f('MONTHS_BETWEEN', (a, b) => { const x = parseIso(a), y = parseIso(b); if (!x || !y) return null; return (x.getFullYear() - y.getFullYear()) * 12 + (x.getMonth() - y.getMonth()) + (x.getDate() - y.getDate()) / 31; });
    f('LAST_DAY', (v) => { const d = parseIso(v); return d ? isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)) : null; });
    f('NEXT_DAY', (v, day) => { const d = parseIso(v); if (!d) return null; const i = DAY.findIndex(x => x.startsWith(String(day).toUpperCase().slice(0, 3))); let k = (i - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + k); return isoOf(d); });
    f('SEQ$NEXT', (n) => { const s = U.seqs[String(n).toLowerCase()]; if (!s) throw new Error('ORA-02289: sequence does not exist'); const v = s.cur === null || s.cur === undefined ? s.start : s.cur + s.inc; if (s.max !== null && v > s.max) { if (!s.cycle) throw new Error('ORA-08004: sequence ' + n.toUpperCase() + '.NEXTVAL exceeds MAXVALUE and cannot be instantiated'); s.cur = s.min; } else s.cur = v; s.used = true; seqDirty = true; return s.cur; });
    f('SEQ$CURR', (n) => { const s = U.seqs[String(n).toLowerCase()]; if (!s) throw new Error('ORA-02289: sequence does not exist'); if (!s.used) throw new Error('ORA-08002: sequence ' + n.toUpperCase() + '.CURRVAL is not yet defined in this session'); return s.cur; });
  }

  function snapshot() {
    if (!db || !U) return;
    const raw = db.db;
    const objs = q("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND lower(name) <> 'dual' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, rowid");
    const data = {};
    objs.filter(o => o.type === 'table').forEach(o => { const r = raw.exec('SELECT * FROM "' + o.name + '"'); data[o.name] = r.length ? { cols: r[0].columns, rows: r[0].values } : { cols: [], rows: [] }; });
    U.objs = objs; U.data = data; U.views = db.views || {};
    saveUser();
  }
  let warnedQuota = false;
  function saveUser() {
    if (!U) return;
    const seqs = {}; Object.entries(U.seqs).forEach(([k, s]) => { seqs[k] = Object.assign({}, s, { used: false }); });
    const ok = lsSet('user.' + user, Object.assign({}, U, { seqs }));
    if (!ok && !warnedQuota) { warnedQuota = true; print('SP2-0606: Cannot create file – browser storage is full, recent changes were not saved\n'); }
  }
  function patchRun(raw) {
    const orig = raw.run.bind(raw);
    raw.run = function (sql, p) { if (/^\s*commit\b/i.test(sql)) committed = true; return orig(sql, p); };
  }
  function freshUser() { return { objs: [], data: {}, views: {}, plsql: [], seqs: {}, binds: {}, invalid: {} }; }
  function connect(name) {
    if (db) closeSession(true, true);
    user = name.toUpperCase();
    U = lsGet('user.' + user, null) || freshUser();
    ['plsql', 'objs'].forEach(k => { U[k] = U[k] || []; }); ['data', 'views', 'seqs', 'binds', 'invalid'].forEach(k => { U[k] = U[k] || {}; });
    db = Engine.create('');
    const raw = db.db;
    try { raw.run('COMMIT'); } catch (e) { }
    raw.run('PRAGMA foreign_keys=OFF'); raw.run('BEGIN');
    U.objs.forEach(o => { try { raw.run(o.sql); } catch (e) { } });
    Object.entries(U.data).forEach(([t, d]) => {
      if (!d.cols || !d.cols.length || !d.rows.length) return;
      try { const st = raw.prepare('INSERT INTO "' + t + '" (' + d.cols.map(c => '"' + c + '"').join(',') + ') VALUES (' + d.cols.map(() => '?').join(',') + ')'); d.rows.forEach(r => { try { st.run(r); } catch (e) { } }); st.free(); } catch (e) { }
    });
    raw.run('COMMIT'); raw.run('PRAGMA foreign_keys=ON'); raw.run('BEGIN');
    db.views = U.views;
    registerFns(raw); patchRun(raw);
    sess = new Plsql.Session(db, { prompt: () => null });
    U.plsql.forEach(p => { if (p.invalid) return; try { sess.run(p.src + '\n/'); } catch (e) { } });
    defines._USER = user; defines._CONNECT_IDENTIFIER = 'XE'; defines._PRIVILEGE = user === 'SYS' ? 'AS SYSDBA' : '';
    const prev = Gs.users[user]; Gs.users[user] = { last: Date.now(), created: prev ? prev.created : Date.now() }; saveGlobal();
    committed = false;
    return prev ? prev.last : null;
  }
  function closeSession(commit, quiet) {
    if (!db) return;
    if (commit) { try { db.db.run('COMMIT'); } catch (e) { } snapshot(); }
    else if (seqDirty) saveUser();
    try { db.close(); } catch (e) { }
    db = null; sess = null; U = null;
    if (!quiet) user = null;
  }
  function afterUnit() {
    if (!db) return;
    if (committed) { committed = false; seqDirty = false; snapshot(); }
    else if (seqDirty) { seqDirty = false; saveUser(); }
  }
  function ddlCommit() { try { db.db.run('COMMIT'); } catch (e) { } try { db.db.run('BEGIN'); } catch (e) { } }

  /* ============================================================ data dictionary */
  const DICT_RE = /\b(tab|cat|tabs|cols|obj|seq|dict|dictionary|user_(?:tables|views|objects|tab_columns|tab_cols|constraints|cons_columns|source|procedures|triggers|sequences|indexes|ind_columns|users|catalog)|all_(?:users|tables|objects|views|tab_columns|constraints)|dba_(?:users|tables))\b/i;
  function plsqlObjects() { return U.plsql.map(p => ({ name: p.name.toUpperCase(), type: p.kind.toUpperCase(), status: p.invalid ? 'INVALID' : 'VALID', created: p.created || Date.now(), src: p.src })); }
  function oraDate(t) { const d = new Date(t); return isoOf(d); }
  function buildDict(text) {
    const raw = db.db; const m = maskStr(text);
    const want = new Set(); let r; const re = new RegExp(DICT_RE.source, 'gi'); while ((r = re.exec(m))) want.add(r[1].toLowerCase());
    if (!want.size) return;
    const objs = q("SELECT type, name, tbl_name, sql, rowid AS rid FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND lower(name) <> 'dual' ORDER BY rowid");
    const tables = objs.filter(o => o.type === 'table'), views = objs.filter(o => o.type === 'view');
    const mk = (name, defs, rows) => {
      if (tableExists(name)) return;
      raw.run('DROP TABLE IF EXISTS temp."' + name + '"');
      raw.run('CREATE TEMP TABLE "' + name + '" (' + defs.map(d => d[0] + ' ' + d[1]).join(', ') + ')');
      if (rows.length) { const st = raw.prepare('INSERT INTO temp."' + name + '" VALUES (' + defs.map(() => '?').join(',') + ')'); rows.forEach(x => st.run(x.map(v => (v === undefined ? null : v)))); st.free(); }
    };
    const N = 'VARCHAR2(128)';
    const objRows = () => {
      const out = []; let id = 70000;
      objs.forEach(o => { if (o.type === 'index' && !o.sql) return; out.push([o.name.toUpperCase(), ++id, o.type.toUpperCase(), oraDate(Date.now()), 'VALID']); });
      plsqlObjects().forEach(p => out.push([p.name, ++id, p.type, oraDate(p.created), p.status]));
      Object.keys(U.seqs).forEach(s => out.push([s.toUpperCase(), ++id, 'SEQUENCE', oraDate(Date.now()), 'VALID']));
      return out;
    };
    const colRows = () => {
      const out = [];
      [...tables, ...views].forEach(t => tableInfo(t.name).forEach((c, i) => { const T = parseType(c.type); const ot = oraType(c.type); const base = ot.replace(/\(.*$/, ''); out.push([t.name.toUpperCase(), c.name.toUpperCase(), base, base === 'NUMBER' ? 22 : base === 'DATE' ? 7 : (T.size || 4000), base === 'NUMBER' ? (T.size || null) : null, base === 'NUMBER' ? (T.scale !== null ? T.scale : (T.size ? 0 : null)) : null, c.nn || c.pk ? 'N' : 'Y', i + 1]); }));
      return out;
    };
    const cons = () => { const out = []; tables.forEach(t => constraintsOf(t.name).forEach(c => out.push(Object.assign({ table: t.name }, c)))); return out; };
    if (want.has('tab')) mk('tab', [['TNAME', N], ['TABTYPE', 'VARCHAR2(13)'], ['CLUSTERID', 'NUMBER']], [...tables, ...views].map(t => [t.name.toUpperCase(), t.type.toUpperCase(), null]));
    if (want.has('cat') || want.has('user_catalog')) ['cat', 'user_catalog'].forEach(n => want.has(n) && mk(n, [['TABLE_NAME', N], ['TABLE_TYPE', 'VARCHAR2(11)']], [...tables, ...views].map(t => [t.name.toUpperCase(), t.type.toUpperCase()]).concat(Object.keys(U.seqs).map(s => [s.toUpperCase(), 'SEQUENCE']))));
    ['user_tables', 'tabs', 'all_tables', 'dba_tables'].forEach(n => want.has(n) && mk(n, (n !== 'user_tables' && n !== 'tabs' ? [['OWNER', N]] : []).concat([['TABLE_NAME', N], ['TABLESPACE_NAME', 'VARCHAR2(30)'], ['STATUS', 'VARCHAR2(8)'], ['NUM_ROWS', 'NUMBER']]), tables.map(t => (n !== 'user_tables' && n !== 'tabs' ? [user] : []).concat([t.name.toUpperCase(), 'USERS', 'VALID', q('SELECT COUNT(*) AS c FROM "' + t.name + '"')[0].c]))));
    ['user_views', 'all_views'].forEach(n => want.has(n) && mk(n, (n === 'all_views' ? [['OWNER', N]] : []).concat([['VIEW_NAME', N], ['TEXT_LENGTH', 'NUMBER'], ['TEXT', 'VARCHAR2(4000)']]), views.map(v => { const t = v.sql.replace(/^\s*create\s+view\s+\S+\s*(\([^)]*\))?\s*as\s+/i, ''); return (n === 'all_views' ? [user] : []).concat([v.name.toUpperCase(), t.length, t]); })));
    ['user_objects', 'obj', 'all_objects'].forEach(n => want.has(n) && mk(n, (n === 'all_objects' ? [['OWNER', N]] : []).concat([['OBJECT_NAME', N], ['OBJECT_ID', 'NUMBER'], ['OBJECT_TYPE', 'VARCHAR2(23)'], ['CREATED', 'DATE'], ['STATUS', 'VARCHAR2(7)']]), objRows().map(x => (n === 'all_objects' ? [user] : []).concat(x))));
    ['user_tab_columns', 'user_tab_cols', 'cols', 'all_tab_columns'].forEach(n => want.has(n) && mk(n, (n === 'all_tab_columns' ? [['OWNER', N]] : []).concat([['TABLE_NAME', N], ['COLUMN_NAME', N], ['DATA_TYPE', 'VARCHAR2(128)'], ['DATA_LENGTH', 'NUMBER'], ['DATA_PRECISION', 'NUMBER'], ['DATA_SCALE', 'NUMBER'], ['NULLABLE', 'VARCHAR2(1)'], ['COLUMN_ID', 'NUMBER']]), colRows().map(x => (n === 'all_tab_columns' ? [user] : []).concat(x))));
    ['user_constraints', 'all_constraints'].forEach(n => want.has(n) && mk(n, [['OWNER', N], ['CONSTRAINT_NAME', N], ['CONSTRAINT_TYPE', 'VARCHAR2(1)'], ['TABLE_NAME', N], ['SEARCH_CONDITION', 'VARCHAR2(4000)'], ['R_OWNER', N], ['R_CONSTRAINT_NAME', N], ['DELETE_RULE', 'VARCHAR2(9)'], ['STATUS', 'VARCHAR2(8)']], cons().map(c => { const rc = c.type === 'R' ? refConstraint(c) : null; return [user, c.name.toUpperCase(), c.type, c.table.toUpperCase(), c.cond || null, rc ? user : null, rc ? rc.toUpperCase() : null, c.type === 'R' ? (c.rule ? c.rule.toUpperCase().replace(/\s+/, ' ') : 'NO ACTION') : null, 'ENABLED']; })));
    if (want.has('user_cons_columns')) { const rows = []; cons().forEach(c => c.cols.forEach((col, i) => rows.push([user, c.name.toUpperCase(), c.table.toUpperCase(), col.toUpperCase(), c.type === 'C' ? null : i + 1]))); mk('user_cons_columns', [['OWNER', N], ['CONSTRAINT_NAME', N], ['TABLE_NAME', N], ['COLUMN_NAME', 'VARCHAR2(4000)'], ['POSITION', 'NUMBER']], rows); }
    if (want.has('user_source')) { const rows = []; plsqlObjects().forEach(p => p.src.replace(/^\s*create\s+(or\s+replace\s+)?(editionable\s+|noneditionable\s+)?/i, '').split('\n').forEach((l, i) => rows.push([p.name, p.type, i + 1, l + '\n']))); mk('user_source', [['NAME', N], ['TYPE', 'VARCHAR2(12)'], ['LINE', 'NUMBER'], ['TEXT', 'VARCHAR2(4000)']], rows); }
    if (want.has('user_procedures')) mk('user_procedures', [['OBJECT_NAME', N], ['PROCEDURE_NAME', N], ['OBJECT_TYPE', 'VARCHAR2(13)'], ['STATUS', 'VARCHAR2(7)']], plsqlObjects().filter(p => p.type !== 'TRIGGER').map(p => [p.name, null, p.type, p.status]));
    if (want.has('user_triggers')) mk('user_triggers', [['TRIGGER_NAME', N], ['TRIGGER_TYPE', 'VARCHAR2(16)'], ['TRIGGERING_EVENT', 'VARCHAR2(246)'], ['TABLE_NAME', N], ['STATUS', 'VARCHAR2(8)'], ['TRIGGER_BODY', 'VARCHAR2(4000)']], (sess ? sess.triggers : []).map(t => [String(t.name).toUpperCase(), (t.timing || '').toUpperCase() + (t.row ? ' EACH ROW' : ' STATEMENT'), (t.events || []).map(e => e.ev).join(' OR '), String(t.table).toUpperCase(), 'ENABLED', (plsqlObjects().find(p => p.name === String(t.name).toUpperCase()) || { src: '' }).src.replace(/^[\s\S]*?\b(declare|begin)\b/i, '$1')]));
    ['user_sequences', 'seq'].forEach(n => want.has(n) && mk(n, [['SEQUENCE_NAME', N], ['MIN_VALUE', 'NUMBER'], ['MAX_VALUE', 'NUMBER'], ['INCREMENT_BY', 'NUMBER'], ['CYCLE_FLAG', 'VARCHAR2(1)'], ['LAST_NUMBER', 'NUMBER']], Object.entries(U.seqs).map(([k, s]) => [k.toUpperCase(), s.min, s.max === null ? 9.999999999999999e27 : s.max, s.inc, s.cycle ? 'Y' : 'N', s.cur === null || s.cur === undefined ? s.start : s.cur + s.inc])));
    if (want.has('user_indexes')) mk('user_indexes', [['INDEX_NAME', N], ['INDEX_TYPE', 'VARCHAR2(27)'], ['TABLE_NAME', N], ['UNIQUENESS', 'VARCHAR2(9)']], objs.filter(o => o.type === 'index').map(o => [o.name.toUpperCase().replace(/^SQLITE_AUTOINDEX_(.*)_(\d+)$/, 'SYS_C00$2$1').slice(0, 30), 'NORMAL', o.tbl_name.toUpperCase(), /unique/i.test(o.sql || 'unique') ? 'UNIQUE' : 'NONUNIQUE']));
    if (want.has('user_ind_columns')) { const rows = []; objs.filter(o => o.type === 'index').forEach(o => { try { q('SELECT name FROM pragma_index_info(?)', [o.name]).forEach((c, i) => rows.push([o.name.toUpperCase(), o.tbl_name.toUpperCase(), String(c.name).toUpperCase(), i + 1])); } catch (e) { } }); mk('user_ind_columns', [['INDEX_NAME', N], ['TABLE_NAME', N], ['COLUMN_NAME', 'VARCHAR2(4000)'], ['COLUMN_POSITION', 'NUMBER']], rows); }
    if (want.has('user_users')) mk('user_users', [['USERNAME', N], ['USER_ID', 'NUMBER'], ['ACCOUNT_STATUS', 'VARCHAR2(32)'], ['DEFAULT_TABLESPACE', 'VARCHAR2(30)'], ['CREATED', 'DATE']], [[user, 100 + (hash(user) % 900), 'OPEN', 'USERS', oraDate((Gs.users[user] || {}).created || Date.now())]]);
    ['all_users', 'dba_users'].forEach(n => want.has(n) && mk(n, [['USERNAME', N], ['USER_ID', 'NUMBER'], ['CREATED', 'DATE']], Object.entries(Gs.users).map(([u, x]) => [u, 100 + (hash(u) % 900), oraDate(x.created || x.last)])));
    ['dict', 'dictionary'].forEach(n => want.has(n) && mk(n, [['TABLE_NAME', N], ['COMMENTS', 'VARCHAR2(4000)']], [['TAB', 'Tables and views of the user'], ['CAT', 'Synonym for USER_CATALOG'], ['USER_TABLES', 'Description of the user\'s own relational tables'], ['USER_VIEWS', 'Description of the user\'s own views'], ['USER_OBJECTS', 'Objects owned by the user'], ['USER_TAB_COLUMNS', 'Columns of user\'s tables and views'], ['USER_CONSTRAINTS', 'Constraint definitions on user\'s own tables'], ['USER_CONS_COLUMNS', 'Information about accessible columns in constraint definitions'], ['USER_SOURCE', 'Source of stored objects accessible to the user'], ['USER_PROCEDURES', 'Description of the user functions/procedures'], ['USER_TRIGGERS', 'Triggers having FOLLOWS or PRECEDES ordering owned by the user'], ['USER_SEQUENCES', 'Description of the user\'s own SEQUENCEs'], ['USER_INDEXES', 'Description of the user\'s own indexes'], ['USER_USERS', 'Information about the current user'], ['ALL_USERS', 'Information about all users of the database']]));
  }

  /* ---------- constraints (parsed from the stored CREATE TABLE text) ---------- */
  function ddlOf(table) { const r = q("SELECT name, sql FROM sqlite_master WHERE type='table' AND lower(name)=lower(?)", [table]); return r.length ? r[0] : null; }
  function splitDDL(sql) {
    const pc = parenContent(sql); if (!pc) return null;
    return { head: sql.slice(0, pc.start).trim(), parts: splitTop(pc.text).map(p => p.text.trim()).filter(Boolean), tail: sql.slice(pc.end).trim() };
  }
  const isTableCons = (p) => /^(constraint\b|primary\s+key\b|foreign\s+key\b|unique\s*\(|check\s*\()/i.test(p);
  const sysName = (table, text) => 'SYS_C' + padL(String(7000 + hash(table.toLowerCase() + '|' + text.replace(/\s+/g, ' ').toLowerCase()) % 20000), 6, '0');
  function consFromParts(table, parts) {
    const out = [];
    parts.forEach((p, pi) => {
      if (isTableCons(p)) {
        const m = /^(?:constraint\s+"?([\w$#]+)"?\s+)?([\s\S]*)$/i.exec(p); const body = m[2]; const c = { pi, start: 0, end: p.length, whole: true, name: m[1] || sysName(table, p), gen: !m[1], cols: [] };
        if (/^primary\s+key/i.test(body)) { c.type = 'P'; c.cols = idList((parenContent(body) || {}).text); }
        else if (/^unique/i.test(body)) { c.type = 'U'; c.cols = idList((parenContent(body) || {}).text); }
        else if (/^check/i.test(body)) { c.type = 'C'; c.cond = ((parenContent(body) || {}).text || '').trim(); }
        else if (/^foreign\s+key/i.test(body)) {
          c.type = 'R'; c.cols = idList((parenContent(body) || {}).text);
          const rm = /references\s+"?([\w$#]+)"?\s*(?:\(([^)]*)\))?/i.exec(body); c.rt = rm ? rm[1].toLowerCase() : null; c.rc = rm ? idList(rm[2]) : [];
          const dm = /on\s+delete\s+(cascade|set\s+null)/i.exec(body); c.rule = dm ? dm[1] : null;
        } else return;
        out.push(c); return;
      }
      const cm = /^"?([\w$#]+)"?/.exec(p); if (!cm) return; const col = cm[1].toLowerCase();
      const mk = maskStr(p);
      const re = /(\bconstraint\s+"?([\w$#]+)"?\s+)?\b(primary\s+key|not\s+null|unique|check\s*\(|references\s+"?([\w$#]+)"?(?:\s*\(\s*"?([\w$#]+)"?\s*\))?(?:\s+on\s+delete\s+(cascade|set\s+null))?)/gi;
      let r;
      while ((r = re.exec(mk))) {
        const kw = r[3].toLowerCase(); let end = r.index + r[0].length;
        const c = { pi, start: r.index, cols: [col], name: r[2] || null };
        if (kw.startsWith('primary')) c.type = 'P';
        else if (kw.startsWith('not')) { c.type = 'C'; c.cond = '"' + col.toUpperCase() + '" IS NOT NULL'; c.nn = true; }
        else if (kw === 'unique') c.type = 'U';
        else if (kw.startsWith('check')) { const pc = parenContent(p, r.index + r[0].length - 1); c.type = 'C'; c.cond = pc ? pc.text.trim() : ''; end = pc ? pc.end : end; re.lastIndex = end; }
        else { c.type = 'R'; c.rt = r[4].toLowerCase(); c.rc = r[5] ? [r[5].toLowerCase()] : []; c.rule = r[6] || null; }
        c.end = end; c.name = c.name || sysName(table, col + ':' + c.type + ':' + (c.cond || c.rt || '')); c.gen = !r[2];
        out.push(c);
      }
    });
    return out;
  }
  function constraintsOf(table) { const d = ddlOf(table); if (!d) return []; const s = splitDDL(d.sql); return s ? consFromParts(d.name, s.parts) : []; }
  function refConstraint(c) { const pk = constraintsOf(c.rt).find(x => (x.type === 'P' || x.type === 'U') && (!c.rc.length || x.cols.join() === c.rc.join())); return pk ? pk.name : null; }
  function allConstraints() { const out = []; q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND lower(name)<>'dual'").forEach(t => constraintsOf(t.name).forEach(c => out.push(Object.assign({ table: t.name }, c)))); return out; }

  /* ============================================================ query output formatting */
  const KW_NOT_ALIAS = new Set(['END', 'FROM', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'THEN', 'ELSE', 'WHEN', 'ASC', 'DESC', 'DISTINCT', 'ALL']);
  function selectItems(sql) {
    if (!sql) return null;
    const m = maskTop(sql);
    const sm = /^\s*\(?\s*select\s+(?:(?:distinct|unique|all)\s+)?/i.exec(m); if (!sm) return null;
    const start = sm[0].length; const rest = m.slice(start);
    const fm = /\b(from|into)\b/i.exec(rest); const end = fm ? start + fm.index : m.length;
    return splitTop(sql.slice(start, end)).map(x => x.text.trim());
  }
  function itemHead(t) {
    if (t === '*') return { star: true };
    let m = /^([A-Za-z_][\w$#]*)\s*\.\s*\*$/.exec(t); if (m) return { star: true, qual: m[1] };
    let expr = t, head = null, quoted = false;
    m = /^([\s\S]*?\S)\s+(?:as\s+)?"([^"]*)"$/i.exec(t);
    if (m) { expr = m[1]; head = m[2]; quoted = true; }
    else {
      m = /^([\s\S]*?\S)\s+(?:as\s+)?([A-Za-z_][\w$#]*)$/i.exec(t);
      if (m && !KW_NOT_ALIAS.has(m[2].toUpperCase()) && !/(\|\||[-+*\/,(=<>.]|\bas)$/i.test(m[1].trim()) && segs(m[1]).every(s => s.t !== 's' || true)) { expr = m[1]; head = m[2].toUpperCase(); }
    }
    const ref = /^(?:"?([A-Za-z_][\w$#]*)"?\s*\.\s*)?"?([A-Za-z_][\w$#]*)"?$/.exec(expr.trim());
    if (head === null) head = segs(expr).map(s => (s.t === 'q' ? s.v.slice(1, -1) : s.t === 'm' ? '' : s.v.replace(/\s+/g, '').toUpperCase())).join('');
    return { head, quoted, ref: ref ? { q: ref[1] ? ref[1].toLowerCase() : null, n: ref[2].toLowerCase() } : null };
  }
  function fromTables(sql) {
    const m = maskStr(sql); const out = [];
    const re = /\b(from|join)\b([\s\S]*?)(?=\b(where|group|order|having|union|intersect|minus|except|connect|start|on|using|inner|left|right|full|cross|natural|join|fetch|for)\b|\)|;|$)/gi;
    let r; while ((r = re.exec(m))) {
      if (!r[2].trim()) { if (re.lastIndex === r.index) re.lastIndex++; continue; }
      r[2].split(',').forEach(p => { const w = p.trim().replace(/"/g, '').split(/\s+/); if (w[0] && /^[A-Za-z_][\w$#]*$/.test(w[0])) out.push({ name: w[0].toLowerCase(), alias: (w[1] && w[1].toLowerCase() !== 'as' ? w[1] : w[2] || '').toLowerCase() || null }); });
    }
    return out;
  }
  function lookupDecl(tables, ref) {
    const cand = ref.q ? tables.filter(t => t.alias === ref.q || t.name === ref.q) : tables;
    for (const t of cand) { const info = tableInfo(t.name); const c = info.find(x => x.name.toLowerCase() === ref.n); if (c) return c.type || ''; }
    return null;
  }
  function columnInfo(names, rows, src) {
    const items = selectItems(src);
    let heads = null;
    if (items) {
      const hs = items.map(itemHead); const stars = hs.filter(x => x.star).length;
      if (!stars && hs.length === names.length) heads = hs;
      else if (stars === 1 && names.length >= hs.length - 1) {
        heads = []; const extra = names.length - (hs.length - 1); let k = 0;
        hs.forEach(x => { if (x.star) { for (let j = 0; j < extra; j++) { heads.push({ head: names[k].toUpperCase(), ref: { q: x.qual ? x.qual.toLowerCase() : null, n: names[k].toLowerCase() } }); k++; } } else { heads.push(x); k++; } });
      }
    }
    if (!heads) heads = names.map(n => ({ head: n.toUpperCase(), ref: /^[A-Za-z_][\w$#]*$/.test(n) ? { q: null, n: n.toLowerCase() } : null }));
    const tables = src ? fromTables(src) : [];
    return heads.map((h, i) => {
      const key = h.head.toUpperCase(); const set = cols[key] && cols[key].on !== false ? cols[key] : null;
      const decl = h.ref && tables.length ? lookupDecl(tables, h.ref) : null; const T = decl !== null ? parseType(decl) : null;
      const vals = rows.map(r => r[i]).filter(v => v !== null && v !== undefined);
      let kind = typeKind(T), w = null, declared = !!kind;
      if (kind === 'char') w = T.size || null;
      if (!kind) kind = vals.length && vals.every(v => typeof v === 'number') ? 'num' : vals.length && vals.every(isIsoDate) ? 'date' : 'char';
      if (kind === 'char' && w === null) { w = Math.max(1, ...vals.map(v => String(v).length)); if (!declared) w = Math.max(w, key.length); }
      let model = null;
      if (set && set.fmt) { const am = /^a(\d+)$/i.exec(set.fmt); if (am) { kind = 'char'; w = +am[1]; } else if (isNumModel(set.fmt)) { kind = 'num'; model = set.fmt; } }
      if (kind === 'num' && !model && S.numformat && isNumModel(S.numformat)) model = S.numformat;
      const headTxt = set && set.head !== undefined ? set.head : (h.quoted ? h.head : key);
      const hl = headTxt.split(S.headsep || '\u0000');
      if (kind === 'num') w = Math.max(model ? model.replace(/^fm/i, '').length + 1 : S.numwidth, ...hl.map(x => x.length));
      if (kind === 'date') w = 9;
      w = Math.max(1, Math.min(w, S.linesize));
      let right = kind === 'num'; let center = false;
      if (set && set.just) { right = set.just === 'R'; center = set.just === 'C'; }
      return { key, kind, w, model, right, center, set, hl: hl.map(x => x.slice(0, w)), wrap: set && set.wrap ? set.wrap : (S.wrap ? 'WRAPPED' : 'TRUNCATED') };
    });
  }
  function cellText(c, v) {
    if (v === null || v === undefined) return [(c.set && c.set.nul !== undefined ? c.set.nul : S.null).slice(0, c.w)];
    let s;
    if (c.kind === 'num') { s = c.model ? fmtModel(v, c.model) : fmtNum(v, c.w); if (s.length > c.w) s = '#'.repeat(c.w); return [s]; }
    s = c.kind === 'date' && isIsoDate(v) ? isoToOra(v) : typeof v === 'number' ? numStr(v) : String(v);
    if (s.length <= c.w && !/\n/.test(s)) return [s];
    const lines = [];
    s.split('\n').forEach(part => {
      if (c.wrap === 'TRUNCATED') { lines.push(part.slice(0, c.w)); return; }
      if (c.wrap === 'WORD_WRAPPED') { let cur = ''; part.split(/(\s+)/).forEach(w => { if ((cur + w).length > c.w && cur.trim()) { lines.push(cur.trimEnd()); cur = w.trimStart(); } else cur += w; while (cur.length > c.w) { lines.push(cur.slice(0, c.w)); cur = cur.slice(c.w); } }); lines.push(cur); return; }
      for (let i = 0; i < Math.max(1, part.length); i += c.w) lines.push(part.slice(i, i + c.w));
    });
    return c.wrap === 'TRUNCATED' ? lines.slice(0, 1) : lines;
  }
  const align = (c, s) => c.center ? padR(' '.repeat(Math.floor((c.w - s.length) / 2)) + s, c.w) : c.right ? padL(s, c.w) : padR(s, c.w);
  function groupsOf(vis) {
    const groups = []; let cur = [], cw = 0;
    vis.forEach(c => { const need = cur.length ? cw + S.colsep.length + c.w : c.w; if (cur.length && need > S.linesize) { groups.push(cur); cur = [c]; cw = c.w; } else { cur.push(c); cw = need; } });
    if (cur.length) groups.push(cur); return groups;
  }
  function rowLines(groups, cells) {
    const out = [];
    groups.forEach(g => { const h = Math.max(1, ...g.map(c => cells[c.i].length)); for (let k = 0; k < h; k++) out.push(g.map(c => align(c, cells[c.i][k] || '')).join(S.colsep).replace(/\s+$/, '')); });
    return out;
  }
  function titleLines(t, page) {
    if (!t || t.off) return [];
    if (t.old) { const d = new Date(); const left = cap(DAY[d.getDay()]).slice(0, 3) + ' ' + cap(MON[d.getMonth()]) + ' ' + p2(d.getDate()); const right = 'page ' + padL(page, 4); return [left + padL(right, S.linesize - left.length), ...t.text.split('|').map(x => padR(' '.repeat(Math.max(0, Math.floor((S.linesize - x.length) / 2))) + x, 0)), '']; }
    return t.lines.map(L => { let line = ' '.repeat(S.linesize).split(''); L.forEach(p => { const s = p.text.replace(/SQL\.PNO/g, String(page)); const at = p.pos === 'C' ? Math.floor((S.linesize - s.length) / 2) : p.pos === 'R' ? S.linesize - s.length : p.col || 0; for (let i = 0; i < s.length; i++) if (at + i >= 0 && at + i < line.length) line[at + i] = s[i]; }); return line.join('').replace(/\s+$/, ''); });
  }
  function renderQuery(names, rows, src, preset) {
    const infos = preset || columnInfo(names, rows, src);
    infos.forEach((c, i) => { c.i = i; if (c.set && c.set.newv && rows.length) { const v = rows[rows.length - 1][i]; defines[c.set.newv.toUpperCase()] = v === null ? '' : c.kind === 'date' && isIsoDate(v) ? isoToOra(v) : typeof v === 'number' ? numStr(v) : String(v); } });
    const vis = infos.filter(c => !(c.set && c.set.noprint));
    const groups = groupsOf(vis);
    const header = [];
    if (S.heading && S.pagesize > 0) groups.forEach(g => {
      const hh = Math.max(...g.map(c => c.hl.length));
      for (let k = 0; k < hh; k++) header.push(g.map(c => align(c, c.hl[k] || '')).join(S.colsep).replace(/\s+$/, ''));
      if (S.underline) header.push(g.map(c => S.underline.repeat(c.w)).join(S.colsep));
    });
    // break / compute bookkeeping
    const findCol = (n) => infos.find(c => c.key === n.toUpperCase());
    const brks = breaks.filter(b => b.col !== 'REPORT' && b.col !== 'ROW').map(b => Object.assign({}, b, { c: findCol(b.col) })).filter(b => b.c);
    const repBreak = breaks.find(b => b.col === 'REPORT');
    const recs = []; const starts = brks.map(() => 0);
    const same = (a, b) => (a === null && b === null) || a === b;
    const computeLines = (spec, from, to, onCol) => {
      const lines = [];
      const ofCols = spec.of.map(findCol).filter(Boolean);
      if (!ofCols.length) return lines;
      const mark = vis.map(c => (onCol && c === onCol ? '*'.repeat(c.w) : ofCols.includes(c) ? '-'.repeat(c.w) : ''));
      const cellsOf = (arr) => { const cells = []; vis.forEach((c, k) => { cells[c.i] = [arr[k]]; }); infos.forEach(c => { if (!cells[c.i]) cells[c.i] = ['']; }); return rowLines(groups, cells); };
      lines.push(...cellsOf(mark));
      spec.fns.forEach(fn => {
        const labels = { SUM: 'sum', AVG: 'avg', COUNT: 'count', MAX: 'maximum', MIN: 'minimum', NUMBER: 'number', STD: 'std', VARIANCE: 'variance' };
        const lab = spec.label !== undefined ? spec.label : labels[fn];
        const arr = vis.map(c => {
          if (ofCols.includes(c)) {
            const vs = rows.slice(from, to).map(r => r[c.i]).filter(v => v !== null && v !== undefined); const ns = vs.map(Number);
            let v = fn === 'SUM' ? ns.reduce((a, b) => a + b, 0) : fn === 'AVG' ? (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null) : fn === 'COUNT' ? vs.length : fn === 'NUMBER' ? to - from : fn === 'MAX' ? (c.kind === 'num' ? Math.max(...ns) : vs.slice().sort().pop()) : fn === 'MIN' ? (c.kind === 'num' ? Math.min(...ns) : vs.slice().sort()[0]) : null;
            if (fn === 'STD' || fn === 'VARIANCE') { const mu = ns.reduce((a, b) => a + b, 0) / (ns.length || 1); const vr = ns.length > 1 ? ns.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (ns.length - 1) : 0; v = fn === 'STD' ? Math.sqrt(vr) : vr; }
            return v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) ? '' : cellText(Object.assign({}, c, fn === 'COUNT' || fn === 'NUMBER' ? { kind: 'num', model: null } : {}), v)[0];
          }
          if (onCol ? c === onCol : c === vis[0]) return padR(lab.slice(0, c.w), c.w);
          return '';
        });
        lines.push(...cellsOf(arr));
      });
      return lines;
    };
    const endGroups = (fromLevel, upto) => {
      for (let L = brks.length - 1; L >= fromLevel; L--) {
        const b = brks[L]; const lines = [];
        computes.filter(cp => cp.on === b.c.key).forEach(cp => lines.push(...computeLines(cp, starts[L], upto, b.c)));
        if (lines.length) recs.push({ lines, extra: true });
        starts[L] = upto;
      }
    };
    const skipAfter = (fromLevel, last) => {
      const b = brks.slice(fromLevel).find(x => x.skip); if (!b || last) return;
      if (b.skip === 'PAGE') recs.push({ page: true }); else recs.push({ lines: Array(b.skip).fill(''), extra: true });
    };
    rows.forEach((row, ri) => {
      let lvl = -1;
      if (ri > 0) { lvl = brks.findIndex(b => !same(row[b.c.i], rows[ri - 1][b.c.i])); if (lvl >= 0) { endGroups(lvl, ri); skipAfter(lvl, false); } }
      const cells = infos.map((c, i) => {
        const bi = brks.findIndex(b => b.c === c);
        if (bi >= 0 && ri > 0 && !brks[bi].dup && (lvl === -1 || lvl > bi) && same(row[i], rows[ri - 1][i])) return [''];
        return cellText(c, row[i]);
      });
      recs.push({ lines: rowLines(groups, cells) });
    });
    if (rows.length) { endGroups(0, rows.length); if (repBreak || computes.some(cp => cp.on === 'REPORT')) { const lines = []; computes.filter(cp => cp.on === 'REPORT').forEach(cp => lines.push(...computeLines(cp, 0, rows.length, null))); if (lines.length) recs.push({ lines: [''].concat(lines), extra: true }); } }
    // pagination
    const out = []; const wrapped = recs.some(r => r.lines && !r.extra && r.lines.length > 1) && S.recsep !== 'OFF';
    if (S.pagesize === 0) { recs.forEach((r, k) => { if (r.lines) { out.push(...r.lines); if (wrapped && !r.extra && k < recs.length - 1) out.push(''); } }); return out; }
    let page = 0, used = 0, top = 0;
    const tt = (n) => titleLines(ttitle, n), bt = (n) => titleLines(btitle, n);
    const newPage = () => { if (page && btitle) out.push(...bt(page)); page++; const lines = Array(S.newpage).fill('').concat(tt(page), header); out.push(...lines); used = top = lines.length; };
    newPage();
    recs.forEach((r, k) => {
      if (r.page) { newPage(); return; }
      if (used > top && used + r.lines.length > S.pagesize - (btitle ? bt(page).length : 0)) newPage();
      out.push(...r.lines); used += r.lines.length;
      if (wrapped && !r.extra && k < recs.length - 1) { out.push(''); used++; }
    });
    if (btitle) out.push(...bt(page));
    return out;
  }

  /* ============================================================ errors */
  function locate(text, tok) { const p = findTok(text, tok); return p || { line: 1, col: 0 }; }
  function sqlError(msg, text) {
    const kind = (/^\s*(\w+)/.exec(text) || [])[1] || ''; const K = kind.toUpperCase();
    let r;
    const inner = (/\(([^()]*)\)\s*$/.exec(msg) || [])[1] || '';
    if (/^ORA-00942/.test(msg)) return { at: locate(text, inner), msgs: ['ORA-00942: table or view does not exist'] };
    if (/^ORA-00904/.test(msg)) { const parts = inner.split('.'); return { at: locate(text, parts[parts.length - 1]), msgs: ['ORA-00904: ' + parts.map(p => '"' + p.toUpperCase() + '"').join('.') + ': invalid identifier'] }; }
    if (/^ORA-00001/.test(msg)) { const [t] = inner.split('.'); const colsU = inner.split(',').map(x => x.trim().split('.').pop().toLowerCase()); const c = constraintsOf(t || '').find(x => (x.type === 'P' || x.type === 'U') && x.cols.join() === colsU.join()); return { at: { line: 1, col: 0 }, msgs: ['ORA-00001: unique constraint (' + user + '.' + (c ? c.name.toUpperCase() : sysName(t || '', inner)) + ') violated'] }; }
    if (/^ORA-01400/.test(msg)) { const [t, c] = inner.split('.'); const id = '("' + user + '"."' + (t || '').toUpperCase() + '"."' + (c || '').toUpperCase() + '")'; return K === 'UPDATE' ? { at: locate(text, c), msgs: ['ORA-01407: cannot update ' + id + ' to NULL'] } : { at: { line: 1, col: 0 }, msgs: ['ORA-01400: cannot insert NULL into ' + id] }; }
    if (/^ORA-02291\/02292/.test(msg)) {
      if (K === 'DELETE' || (K === 'UPDATE' && false)) { const t = (/^\s*delete\s+(?:from\s+)?"?([\w$#]+)/i.exec(text) || [])[1] || ''; const c = allConstraints().find(x => x.type === 'R' && x.rt === t.toLowerCase()); return { at: { line: 1, col: 0 }, msgs: ['ORA-02292: integrity constraint (' + user + '.' + (c ? c.name.toUpperCase() : 'SYS_C008') + ') violated - child record found'] }; }
      const t = (/^\s*(?:insert\s+into|update)\s+"?([\w$#]+)/i.exec(text) || [])[1] || ''; let c = constraintsOf(t).find(x => x.type === 'R');
      if (K === 'UPDATE' && !c) { c = allConstraints().find(x => x.type === 'R' && x.rt === t.toLowerCase()); if (c) return { at: { line: 1, col: 0 }, msgs: ['ORA-02292: integrity constraint (' + user + '.' + c.name.toUpperCase() + ') violated - child record found'] }; }
      return { at: { line: 1, col: 0 }, msgs: ['ORA-02291: integrity constraint (' + user + '.' + (c ? c.name.toUpperCase() : 'SYS_C008') + ') violated - parent key not found'] };
    }
    if (/^ORA-02290/.test(msg)) { const t = (/^\s*(?:insert\s+into|update)\s+"?([\w$#]+)/i.exec(text) || [])[1] || ''; const cs = constraintsOf(t).filter(x => x.type === 'C' && !x.nn); const n = inner.trim().toLowerCase(); const c = cs.find(x => x.name.toLowerCase() === n) || cs.find(x => x.cond.replace(/\s+/g, '').toLowerCase() === n.replace(/\s+/g, '')) || cs[0]; return { at: { line: 1, col: 0 }, msgs: ['ORA-02290: check constraint (' + user + '.' + (c ? c.name.toUpperCase() : 'SYS_C008') + ') violated'] }; }
    if (/^ORA-00955/.test(msg)) { const n = (/^\s*create\s+(?:or\s+replace\s+)?(?:global\s+temporary\s+)?(?:unique\s+)?(?:table|view|index|sequence)\s+"?([\w$#]+)/i.exec(text) || [])[1]; return { at: locate(text, n), msgs: ['ORA-00955: name is already used by an existing object'] }; }
    if ((r = /no such function: ([\w$#]+)/i.exec(msg))) return { at: locate(text, r[1]), msgs: ['ORA-00904: "' + r[1].toUpperCase() + '": invalid identifier'] };
    if (/misuse of aggregate/i.test(msg)) { const f = (/misuse of aggregate(?: function)?:?\s*(\w+)/i.exec(msg) || [])[1]; return { at: locate(text, f || 'count'), msgs: ['ORA-00934: group function is not allowed here'] }; }
    if ((r = /ambiguous column name: ([\w$#.]+)/i.exec(msg))) return { at: locate(text, r[1].split('.').pop()), msgs: ['ORA-00918: column ambiguously defined'] };
    if ((r = /has (\d+) columns but (\d+) values were supplied/i.exec(msg)) || (r = /(\d+) values for (\d+) columns/i.exec(msg))) { const tooMany = /values for/.test(msg) ? +r[1] > +r[2] : +r[2] > +r[1]; const v = findTok(text, 'values'); return { at: v ? { line: v.line, col: v.col } : { line: 1, col: 0 }, msgs: [tooMany ? 'ORA-00913: too many values' : 'ORA-00947: not enough values'] }; }
    if (/do not have the same number of result columns/i.test(msg)) return { at: { line: 1, col: 0 }, msgs: ['ORA-01789: query block has incorrect number of result columns'] };
    if (/sub-select returns \d+ columns|row value misused/i.test(msg)) return { at: { line: 1, col: 0 }, msgs: ['ORA-00913: too many values'] };
    if (/datatype mismatch/i.test(msg)) return { at: { line: 1, col: 0 }, msgs: ['ORA-00932: inconsistent datatypes: expected NUMBER got CHAR'] };
    if (/incomplete input/i.test(msg)) { const lines = text.split('\n'); const ln = lines.length; const last = lines[ln - 1]; const endsExpr = /(\b(where|and|or|by|set|on|having|select|values|in|not|like|between)|[=<>,(+\-*\/|])\s*$/i.test(text); const unb = (maskStr(text).match(/\(/g) || []).length > (maskStr(text).match(/\)/g) || []).length; return { at: { line: ln, col: last.length }, msgs: [unb ? 'ORA-00907: missing right parenthesis' : endsExpr ? 'ORA-00936: missing expression' : 'ORA-00921: unexpected end of SQL command'] }; }
    if ((r = /near "([^"]*)": syntax error/i.exec(msg))) {
      const near = r[1]; const at = locate(text, near); const mk = maskStr(text);
      const opens = (mk.match(/\(/g) || []).length, closes = (mk.match(/\)/g) || []).length;
      let code = 'ORA-00933: SQL command not properly ended';
      if (opens > closes) code = 'ORA-00907: missing right parenthesis';
      else if (K === 'SELECT' && !/\bfrom\b/i.test(maskTop(text))) code = 'ORA-00923: FROM keyword not found where expected';
      else if (/^(from|,|\)|where|group|order|having)$/i.test(near) && /(,|\bselect|\(|=|\bwhere|\band|\bor)\s*$/i.test(mk.slice(0, idxOf(text, at)))) code = 'ORA-00936: missing expression';
      else if (K === 'CREATE' && /^\s*create\s+table/i.test(text)) code = /^(\)|,)$/.test(near) ? 'ORA-00902: invalid datatype' : 'ORA-00922: missing or invalid option';
      else if (K === 'INSERT' && !/\binto\b/i.test(mk)) code = 'ORA-00925: missing INTO keyword';
      else if (K === 'INSERT' && !/\b(values|select)\b/i.test(mk)) code = 'ORA-00926: missing VALUES keyword';
      else if (K === 'UPDATE' && !/\bset\b/i.test(mk)) code = 'ORA-00971: missing SET keyword';
      else if (/^(select|insert|update|delete|create|drop|alter|commit|rollback|with|grant|revoke|truncate|merge|savepoint|rename|comment)$/i.test(K) === false) code = 'ORA-00900: invalid SQL statement';
      return { at, msgs: [code] };
    }
    if (/^ORA-\d+/.test(msg)) return { at: { line: 1, col: 0 }, msgs: [msg.replace(/\s*\((?:[\w$#.]+(?:,\s*[\w$#.]+)*)\)\s*$/, '')] };
    return { at: { line: 1, col: 0 }, msgs: [msg] };
  }
  function idxOf(text, at) { const lines = text.split('\n'); let i = 0; for (let k = 0; k < at.line - 1; k++) i += lines[k].length + 1; return i + at.col; }
  function printErr(text, e, opt) {
    opt = opt || {};
    let s = '';
    if (!opt.noSrc) { const lines = text.split('\n'); const L = lines[e.at.line - 1] !== undefined ? lines[e.at.line - 1] : lines[0]; s += (opt.exec ? L + '\n\n' : L + '\n') + ' '.repeat(opt.exec ? 0 : Math.max(0, e.at.col)) + '*\n'; }
    s += 'ERROR at line ' + e.at.line + ':\n' + e.msgs.join('\n') + '\n\n';
    print(s);
  }
  const SQL_COMPILE = /^ORA-(00942|00904|00900\/00933|00913|00947|00918|00934)/;
  function plsqlError(msg, text, exec) {
    let r;
    if ((r = /^Syntax error – line (\d+): ([\s\S]*?)(?: \(near '([\s\S]*)'\))?$/.exec(msg))) {
      const ln = exec ? 1 : +r[1]; const near = r[3] || ''; const lines = text.split('\n');
      let col = 0; if (near) { const p = findTok(lines[ln - 1] || '', near); col = p ? p.col : 0; }
      const ex = /expected (.*)$/.exec(r[2]);
      const sym = near ? near.toUpperCase() : 'end-of-file';
      const pls = ex ? 'PLS-00103: Encountered the symbol "' + sym + '" when expecting one of the following:\n\n   ' + ex[1].replace(/'/g, '') : 'PLS-00103: Encountered the symbol "' + sym + '" ' + r[2];
      return { at: { line: ln, col }, msgs: ['ORA-06550: line ' + ln + ', column ' + (col + 1) + ':', pls], compile: { line: ln, col: col + 1, text: pls.replace(/\n\n\s*/, ' ').trim() } };
    }
    if ((r = /^(PLS-00201: identifier '([^']+)' must be declared)/.exec(msg))) {
      const name = r[2]; const inv = U.invalid[name.toLowerCase()];
      const at = locate(text, name);
      const m1 = inv ? 'PLS-00905: object ' + user + '.' + name.toUpperCase() + ' is invalid' : r[1];
      return { at, msgs: ['ORA-06550: line ' + at.line + ', column ' + (at.col + 1) + ':', m1, 'ORA-06550: line ' + at.line + ', column ' + (at.col + 1) + ':', 'PL/SQL: Statement ignored'], compile: { line: at.line, col: at.col + 1, text: m1 } };
    }
    if (/^PLS-\d+/.test(msg)) return { at: { line: 1, col: 0 }, msgs: ['ORA-06550: line 1, column 1:', msg], compile: { line: 1, col: 1, text: msg } };
    if (SQL_COMPILE.test(msg)) {
      const e = sqlError(msg, text);
      return { at: e.at, msgs: ['ORA-06550: line ' + e.at.line + ', column ' + (e.at.col + 1) + ':', 'PL/SQL: ' + e.msgs[0], 'ORA-06550: line ' + e.at.line + ', column ' + (e.at.col + 1) + ':', 'PL/SQL: SQL Statement ignored'], compile: { line: e.at.line, col: e.at.col + 1, text: 'PL/SQL: ' + e.msgs[0] } };
    }
    if (/^ORA-\d+/.test(msg)) { const m = sqlErrorIfConstraint(msg, text); return { at: { line: 1, col: 0 }, msgs: m.concat(exec ? ['ORA-06512: at line 1'] : []), runtime: true }; }
    return { at: { line: 1, col: 0 }, msgs: [msg], runtime: true };
  }
  function sqlErrorIfConstraint(msg, text) {
    if (/^ORA-(00001|01400|02290|02291\/02292)/.test(msg)) {
      const m = maskStr(text); const r = /\b(insert\s+into|update|delete\s+from|delete)\s+"?[\w$#]+[\s\S]*?(?=;|$)/i.exec(m);
      if (r) return sqlError(msg, text.substr(r.index, r[0].length)).msgs;
    }
    return [msg.replace(/\s*\((?:[\w$#.]+(?:,\s*[\w$#.]+)*)\)\s*$/, '')];
  }

  /* ============================================================ checks the SQLite engine would let through */
  function groupByCheck(text) {
    const mk = maskTop(text);
    if (!/^\s*select\b/i.test(mk) || /\b(union|intersect|minus|except)\b/i.test(mk)) return null;
    const items = selectItems(text); if (!items) return null;
    const gm = /\bgroup\s+by\b([\s\S]*?)(?=\bhaving\b|\border\s+by\b|$)/i.exec(mk);
    const AGG = /\b(count|sum|avg|min|max|stddev|variance)\s*\(/i;
    const strip = (t) => { const h = itemHead(t); return h.star ? t : t.replace(/\s+(?:as\s+)?("[^"]*"|[A-Za-z_][\w$#]*)$/i, (m0, a) => (KW_NOT_ALIAS.has(a.toUpperCase()) ? m0 : '')).trim(); };
    const norm = (s) => maskStr(s).replace(/\s+/g, '').toLowerCase();
    const anyAgg = items.some(t => AGG.test(maskStr(t)));
    if (gm) {
      const gexprs = splitTop(text.substr(gm.index + gm[0].indexOf(gm[1]), gm[1].length)).map(x => norm(x.text));
      const gbase = gexprs.map(g => g.split('.').pop());
      for (const t of items) {
        const e = strip(t); if (AGG.test(maskStr(e))) continue;
        if (/^('.*'|\d+(\.\d+)?|null|sysdate|user)$/i.test(e.trim())) continue;
        const n = norm(e); if (gexprs.includes(n) || gbase.includes(n.split('.').pop())) continue;
        if (/^[A-Za-z_][\w$#]*(\.[A-Za-z_][\w$#]*)?$/.test(e.trim()) || e.trim() === '*') return { at: locate(text, e.trim().split('.').pop()), msgs: ['ORA-00979: not a GROUP BY expression'] };
      }
      return null;
    }
    if (anyAgg) for (const t of items) {
      const e = strip(t); if (AGG.test(maskStr(e))) continue;
      if (/^[A-Za-z_][\w$#]*(\.[A-Za-z_][\w$#]*)?$/.test(e.trim()) && !/^(sysdate|user|null)$/i.test(e.trim())) return { at: locate(text, e.trim().split('.').pop()), msgs: ['ORA-00937: not a single-group group function'] };
    }
    return null;
  }
  // VARCHAR2(n) length and NUMBER(p,s) precision checks + scale rounding after INSERT/UPDATE
  function dmlPre(text) {
    const m = /^\s*(insert\s+into|update)\s+"?([\w$#]+)"?/i.exec(text); if (!m) return null;
    const t = realName(m[2]); if (!t || q("SELECT type FROM sqlite_master WHERE name=?", [t])[0].type !== 'table') return null;
    const info = tableInfo(t);
    let only = null;
    if (/^update/i.test(m[1])) { const sm = /\bset\b([\s\S]*?)(\bwhere\b|$)/i.exec(maskTop(text)); if (sm) only = splitTop(text.substr(sm.index + 3, sm[1].length)).map(x => x.text.split('=')[0].trim().replace(/"/g, '').split('.').pop().toLowerCase()); }
    const maxRid = q('SELECT COALESCE(MAX(rowid),0) AS r FROM "' + t + '"')[0].r;
    db.db.run('SAVEPOINT spx_chk');
    return { t, info, only, maxRid, ins: /^insert/i.test(m[1]) };
  }
  function dmlPost(pre, ok) {
    if (!pre) return null;
    const raw = db.db; let err = null;
    if (ok) {
      const where = pre.ins ? ' WHERE rowid > ' + pre.maxRid : '';
      for (const c of pre.info) {
        if (pre.only && !pre.only.includes(c.name.toLowerCase())) continue;
        const T = parseType(c.type); const k = typeKind(T);
        if (k === 'char' && T.size) {
          const r = q('SELECT MAX(length("' + c.name + '")) AS m FROM "' + pre.t + '"' + where);
          if (r[0].m > T.size) { err = 'ORA-12899: value too large for column "' + user + '"."' + pre.t.toUpperCase() + '"."' + c.name.toUpperCase() + '" (actual: ' + r[0].m + ', maximum: ' + T.size + ')'; break; }
        }
        if (k === 'num' && /^(NUMBER|NUMERIC|DECIMAL|DEC)$/.test(T.base) && T.size) {
          const s = T.scale || 0;
          raw.run('UPDATE "' + pre.t + '" SET "' + c.name + '" = ROUND("' + c.name + '", ' + s + ')' + (where ? where + ' AND' : ' WHERE') + ' typeof("' + c.name + '") IN (\'real\',\'integer\') AND "' + c.name + '" <> ROUND("' + c.name + '", ' + s + ')');
          const lim = Math.pow(10, T.size - s);
          const r = q('SELECT COUNT(*) AS n FROM "' + pre.t + '"' + (where ? where + ' AND' : ' WHERE') + ' typeof("' + c.name + '") IN (\'real\',\'integer\') AND ABS("' + c.name + '") >= ' + lim);
          if (r[0].n) { err = 'ORA-01438: value larger than specified precision allowed for this column'; break; }
        }
      }
    }
    try { if (err || !ok) raw.run('ROLLBACK TO spx_chk'); raw.run('RELEASE spx_chk'); } catch (e) { }
    return err;
  }

  /* ============================================================ ALTER TABLE (rebuild) */
  function rebuild(table, parts, mapCols, onCopyErr) {
    const raw = db.db; const d = ddlOf(table); const name = d.name; const tmp = name + '_spx$';
    const idx = q("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND lower(tbl_name)=lower(?)", [name]).map(r => r.sql);
    const s = splitDDL(d.sql);
    const newSql = s.head.replace(/("?[\w$#]+"?)\s*$/, '"' + tmp + '"') + ' (' + parts.join(', ') + ')' + (s.tail ? ' ' + s.tail : '');
    try { raw.run('COMMIT'); } catch (e) { }
    raw.run('PRAGMA foreign_keys=OFF'); raw.run('PRAGMA legacy_alter_table=ON'); raw.run('BEGIN');
    try {
      raw.run(newSql);
      if (mapCols.length) {
        try { raw.run('INSERT INTO "' + tmp + '" (' + mapCols.map(c => '"' + c + '"').join(',') + ') SELECT ' + mapCols.map(c => '"' + c + '"').join(',') + ' FROM "' + name + '"'); }
        catch (e) { throw onCopyErr(e.message || String(e)); }
      }
      raw.run('DROP TABLE "' + name + '"'); raw.run('ALTER TABLE "' + tmp + '" RENAME TO "' + name + '"');
      idx.forEach(x => { try { raw.run(x); } catch (e) { } });
      const fk = raw.exec('PRAGMA foreign_key_check("' + name + '")');
      if (fk.length && fk[0].values.length) throw onCopyErr('FOREIGN KEY constraint failed');
      raw.run('COMMIT');
    } catch (e) { try { raw.run('ROLLBACK'); } catch (e2) { } throw e; }
    finally { raw.run('PRAGMA legacy_alter_table=OFF'); raw.run('PRAGMA foreign_keys=ON'); raw.run('BEGIN'); }
  }
  class OraErr extends Error { constructor(msgs, tok) { super(msgs[0]); this.msgs = msgs; this.tok = tok; } }
  function alterTable(text) {
    const m = /^\s*alter\s+table\s+"?([\w$#]+)"?\s+([\s\S]+?)\s*$/i.exec(text); if (!m) return false;
    let act = m[2];
    if (/^rename\b/i.test(act) || /^add\s+column\b/i.test(act) && false) return false;
    if (/^(enable|disable)\b/i.test(act) || /^(move|cache|nocache|logging|nologging|parallel|noparallel|shrink|allocate|deallocate|storage|pctfree|compress|nocompress|read\s+only|read\s+write)\b/i.test(act)) return { msg: 'Table altered.' };
    if (!/^(add|modify|drop)\b/i.test(act)) return false;
    const d = ddlOf(m[1]); if (!d) throw new OraErr(['ORA-00942: table or view does not exist'], m[1]);
    const T = d.name; const s = splitDDL(d.sql); let parts = s.parts.slice();
    const colIdx = (n) => parts.findIndex(p => !isTableCons(p) && (/^"?([\w$#]+)"?/.exec(p) || [])[1].toLowerCase() === n.toLowerCase());
    const oldCols = tableInfo(T).map(c => c.name);
    let keep = oldCols.slice(); let copyErr = (msg) => new OraErr([translateCopy(msg, null)]);
    const cons0 = consFromParts(T, parts);
    const insertCol = (def) => { let last = -1; parts.forEach((p, i) => { if (!isTableCons(p)) last = i; }); parts.splice(last + 1, 0, def); };
    let r;
    if ((r = /^add\s*\(([\s\S]*)\)$/i.exec(act)) || (r = /^add\s+([\s\S]*)$/i.exec(act))) {
      const items = /^add\s*\(/i.test(act) ? splitTop(r[1]).map(x => x.text.trim()) : [r[1].trim()];
      items.forEach(it => {
        if (isTableCons(it)) {
          const nc = consFromParts(T, [it])[0];
          if (!nc) throw new OraErr(['ORA-00902: invalid datatype']);
          if (cons0.some(c => c.name.toLowerCase() === nc.name.toLowerCase()) || allConstraints().some(c => c.name.toLowerCase() === nc.name.toLowerCase())) throw new OraErr(['ORA-02264: name already used by an existing constraint'], nc.name);
          if (nc.type === 'P' && cons0.some(c => c.type === 'P')) throw new OraErr(['ORA-02260: table can have only one primary key'], 'primary');
          (nc.cols || []).forEach(c => { if (colIdx(c) < 0) throw new OraErr(['ORA-00904: "' + c.toUpperCase() + '": invalid identifier'], c); });
          if (nc.type === 'R' && !ddlOf(nc.rt)) throw new OraErr(['ORA-00942: table or view does not exist'], nc.rt);
          parts.push(it);
          copyErr = (msg) => new OraErr([translateCopy(msg, nc)]);
        } else {
          const cn = (/^"?([\w$#]+)"?/.exec(it) || [])[1]; if (!cn) throw new OraErr(['ORA-00904: : invalid identifier']);
          if (colIdx(cn) >= 0) throw new OraErr(['ORA-01430: column being added already exists in table'], cn);
          const nn = /\bnot\s+null\b/i.test(maskStr(it)) && !/\bdefault\b/i.test(maskStr(it));
          if (nn && q('SELECT COUNT(*) AS n FROM "' + T + '"')[0].n) throw new OraErr(['ORA-01758: table must be empty to add mandatory (NOT NULL) column']);
          insertCol(it);
        }
      });
    } else if ((r = /^modify\s*\(([\s\S]*)\)$/i.exec(act)) || (r = /^modify\s+([\s\S]*)$/i.exec(act))) {
      if (/^modify\s+constraint\b/i.test(act)) return { msg: 'Table altered.' };
      const items = /^modify\s*\(/i.test(act) ? splitTop(r[1]).map(x => x.text.trim()) : [r[1].trim()];
      items.forEach(it => {
        const cm = /^"?([\w$#]+)"?\s*([\s\S]*)$/.exec(it); const cn = cm[1]; let rest = cm[2].trim();
        const i = colIdx(cn); if (i < 0) throw new OraErr(['ORA-00904: "' + cn.toUpperCase() + '": invalid identifier'], cn);
        let p = parts[i]; const pm = /^("?[\w$#]+"?)\s*([\s\S]*)$/.exec(p); let colRest = pm[2];
        const tm = /^([A-Za-z_][\w]*(?:\s+precision|\s+varying)?\s*(?:\(\s*\d+\s*(?:,\s*-?\d+\s*)?(?:byte|char)?\s*\))?)/i.exec(rest);
        if (tm && !/^(not|null|default|constraint|check|unique|primary|references)$/i.test(tm[1].split(/[\s(]/)[0])) {
          const newT = parseType(tm[1]); const oldTm = /^([A-Za-z_][\w]*(?:\s+precision|\s+varying)?\s*(?:\(\s*\d+\s*(?:,\s*-?\d+\s*)?(?:byte|char)?\s*\))?)/i.exec(colRest);
          if (typeKind(newT) === 'char' && newT.size) { const mx = q('SELECT MAX(length("' + pm[1].replace(/"/g, '') + '")) AS m FROM "' + T + '"')[0].m; if (mx > newT.size) throw new OraErr(['ORA-01441: cannot decrease column length because some value is too big'], cn); }
          colRest = oldTm ? tm[1] + colRest.slice(oldTm[0].length) : tm[1] + ' ' + colRest;
          rest = rest.slice(tm[0].length).trim();
        }
        const mrest = maskStr(rest);
        if (/^default\b/i.test(rest)) { const dm = /^default\s+('(?:[^']|'')*'|[^\s]+)/i.exec(rest); colRest = colRest.replace(/\s+default\s+('(?:[^']|'')*'|[^\s]+)/i, ''); colRest = colRest.replace(/^(\S+(?:\s*\([^)]*\))?)/, '$1 DEFAULT ' + dm[1]); rest = rest.slice(dm[0].length).trim(); }
        if (/\bnot\s+null\b/i.test(mrest)) {
          if (/\bnot\s+null\b/i.test(maskStr(colRest)) || /primary\s+key/i.test(maskStr(colRest))) throw new OraErr(['ORA-01442: column to be modified to NOT NULL is already NOT NULL'], cn);
          const cnm = /constraint\s+"?([\w$#]+)"?\s+not\s+null/i.exec(rest); colRest += (cnm ? ' CONSTRAINT ' + cnm[1] : '') + ' NOT NULL';
          const nm = cnm ? cnm[1] : sysName(T, cn.toLowerCase() + ':C:"' + cn.toUpperCase() + '" IS NOT NULL');
          copyErr = () => new OraErr(['ORA-02296: cannot enable (' + user + '.' + nm.toUpperCase() + ') - null values found']);
          rest = rest.replace(/(constraint\s+"?[\w$#]+"?\s+)?not\s+null/i, '').trim();
        } else if (/^null\b/i.test(rest)) {
          if (!/\bnot\s+null\b/i.test(maskStr(colRest))) throw new OraErr(['ORA-01451: column to be modified to NULL cannot be modified to NULL'], cn);
          colRest = colRest.replace(/(\s+constraint\s+"?[\w$#]+"?)?\s+not\s+null\b/i, ''); rest = rest.slice(4).trim();
        }
        if (rest) colRest += ' ' + rest;
        parts[i] = pm[1] + ' ' + colRest.trim();
      });
    } else if ((r = /^drop\s+(?:column\s+"?([\w$#]+)"?|\(([^)]*)\))(\s+cascade\s+constraints)?\s*$/i.exec(act))) {
      const names = r[1] ? [r[1]] : idList(r[2]);
      names.forEach(n => { const i = colIdx(n); if (i < 0) throw new OraErr(['ORA-00904: "' + n.toUpperCase() + '": invalid identifier'], n); parts.splice(i, 1); });
      if (!parts.some(p => !isTableCons(p))) throw new OraErr(['ORA-12983: cannot drop all columns in a table']);
      const low = names.map(n => n.toLowerCase());
      parts = parts.filter(p => { if (!isTableCons(p)) return true; const c = consFromParts(T, [p])[0]; return !c || !(c.cols || []).some(x => low.includes(x)) && !(c.type === 'C' && low.some(x => new RegExp('\\b' + x + '\\b', 'i').test(c.cond))); });
      keep = oldCols.filter(c => !low.includes(c.toLowerCase()));
    } else if ((r = /^drop\s+(?:constraint\s+"?([\w$#]+)"?|(primary\s+key)|unique\s*\(([^)]*)\))(\s+cascade)?(\s+(keep|drop)\s+index)?\s*$/i.exec(act))) {
      const c = r[1] ? cons0.find(x => x.name.toLowerCase() === r[1].toLowerCase()) : r[2] ? cons0.find(x => x.type === 'P') : cons0.find(x => x.type === 'U' && x.cols.join() === idList(r[3]).join());
      if (!c) throw new OraErr([r[1] ? 'ORA-02443: Cannot drop constraint  - nonexistent constraint' : r[2] ? 'ORA-02441: Cannot drop nonexistent primary key' : 'ORA-02442: Cannot drop nonexistent unique key'], r[1]);
      if ((c.type === 'P' || c.type === 'U') && !r[4]) { const kids = allConstraints().filter(x => x.type === 'R' && x.rt === T.toLowerCase() && x.table.toLowerCase() !== T.toLowerCase()); if (kids.length) throw new OraErr(['ORA-02273: this unique/primary key is referenced by some foreign keys']); }
      const p = parts[c.pi];
      parts[c.pi] = c.whole ? null : (p.slice(0, c.start) + p.slice(c.end)).replace(/\s+/g, ' ').trim();
      parts = parts.filter(Boolean);
      if ((c.type === 'P' || c.type === 'U') && r[4]) {
        allConstraints().filter(x => x.type === 'R' && x.rt === T.toLowerCase() && x.table.toLowerCase() !== T.toLowerCase()).forEach(k => {
          const kd = splitDDL(ddlOf(k.table).sql); const kp = kd.parts.slice(); const kc = consFromParts(k.table, kp).find(x => x.name === k.name);
          kp[kc.pi] = kc.whole ? null : (kp[kc.pi].slice(0, kc.start) + kp[kc.pi].slice(kc.end)).replace(/\s+/g, ' ').trim();
          rebuild(k.table, kp.filter(Boolean), tableInfo(k.table).map(x => x.name), (msg) => new OraErr([msg]));
        });
      }
    } else return false;
    rebuild(T, parts, keep, copyErr);
    return { msg: 'Table altered.' };
  }
  function translateCopy(msg, nc) {
    const nm = nc ? user + '.' + nc.name.toUpperCase() : user + '.SYS_C008';
    if (/UNIQUE constraint failed/i.test(msg)) return nc && nc.type === 'P' ? 'ORA-02437: cannot validate (' + nm + ') - primary key violated' : 'ORA-02299: cannot validate (' + nm + ') - duplicate keys found';
    if (/NOT NULL constraint failed/i.test(msg)) return nc && nc.type === 'P' ? 'ORA-02437: cannot validate (' + nm + ') - primary key violated' : 'ORA-02296: cannot enable (' + nm + ') - null values found';
    if (/CHECK constraint failed/i.test(msg)) return 'ORA-02293: cannot validate (' + nm + ') - check constraint violated';
    if (/FOREIGN KEY constraint failed/i.test(msg)) return 'ORA-02298: cannot validate (' + nm + ') - parent keys not found';
    return msg;
  }

  /* ============================================================ executing SQL / PL/SQL */
  const SQL_WORDS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'GRANT', 'REVOKE', 'WITH', 'DECLARE', 'BEGIN', 'RENAME', 'COMMENT', 'LOCK', 'EXPLAIN', 'CALL', 'AUDIT', 'NOAUDIT', 'ANALYZE', 'FLASHBACK', 'PURGE']);
  const isPlsqlText = (t) => /^\s*(declare|begin)\b/i.test(t) || /^\s*create\s+(or\s+replace\s+)?((no)?editionable\s+)?(procedure|function|trigger|package|type)\b/i.test(maskStr(t));
  function fbMsg(m) { return S.feedback > 0 || !/(row|rows) (created|updated|deleted|selected|merged)\.|^(Table|View|Index|Sequence|Synonym|Procedure|Function|Trigger|Package|Type|User|Comment) (created|dropped|altered|truncated|renamed)\.|^(Commit|Rollback) complete\.|^Savepoint created\.|^PL\/SQL procedure successfully completed\.|succeeded\.$/.test(m); }
  function msgOut(m) { if (fbMsg(m)) print('\n' + m + '\n\n'); }

  async function substitute(text, verify) {
    if (!S.defineOn || text.indexOf(S.defineChar) < 0) return text;
    const ch = S.defineChar; const lines = text.split('\n'); const out = [];
    for (const line of lines) {
      let res = '', i = 0;
      while (i < line.length) {
        const c = line[i];
        if (S.escapeOn && c === S.escapeChar && line[i + 1] === ch) { res += ch; i += 2; continue; }
        if (c === ch) {
          const dbl = line[i + 1] === ch; const st = i + (dbl ? 2 : 1); const m = /^[\w$#]+/.exec(line.slice(st));
          if (m) {
            let j = st + m[0].length; if (line[j] === S.concat) j++;
            const key = m[0].toUpperCase(); let v = defines[key];
            if (v === undefined) { v = await readLine('Enter value for ' + m[0] + ': '); if (v === null) return null; if (dbl) defines[key] = v; }
            res += v; i = j; continue;
          }
        }
        res += c; i++;
      }
      out.push(res);
    }
    const t = out.join('\n');
    if (verify && S.verify && t !== text) lines.forEach((l, k) => { if (l !== out[k]) print('old' + padL(k + 1, 4) + ': ' + l + '\nnew' + padL(k + 1, 4) + ': ' + out[k] + '\n'); });
    return t;
  }
  function rewriteBinds(text, isTrigger) {
    const undeclared = [];
    const t = codeMap(text, code => code.replace(/:([A-Za-z_][\w$#]*)/g, (m0, n, off, all) => {
      if (all[off - 1] && /[\w$#:]/.test(all[off - 1])) return m0;
      const k = n.toUpperCase(); if (U.binds[k]) return 'b$' + n.toLowerCase();
      if (!isTrigger && !/^(NEW|OLD|PARENT)$/.test(k)) undeclared.push(k); return m0;
    }));
    return { t, undeclared };
  }
  function rewriteSpecial(text) {
    return codeMap(text, code => code
      .replace(/\//g, '* 1.0 /')
      .replace(/\b([A-Za-z_][\w$#]*)\s*\.\s*(nextval|currval)\b/gi, (m0, n, k) => (U.seqs[n.toLowerCase()] ? (k.toLowerCase() === 'nextval' ? 'SEQ$NEXT' : 'SEQ$CURR') + "('" + n.toLowerCase() + "')" : m0))
      .replace(/(^|[^\w$#.'"])user(?![\w$#.(])/gi, (m0, a) => a + "'" + user + "'")
      .replace(/(^|[^\w$#.'"])uid(?![\w$#.(])/gi, (m0, a) => a + (100 + hash(user) % 900)));
  }

  // WHERE ROWNUM <= n  →  LIMIT n ;  ROWNUM elsewhere → ROW_NUMBER() OVER ()
  function rewriteRownum(sql) {
    if (!/\brownum\b/i.test(maskStr(sql))) return sql;
    const mk = maskTop(sql); let s = sql, limit = null;
    const m = /(\bwhere\s+|\band\s+)rownum\s*(<=|<|=)\s*(\d+)(\s+and\b)?/i.exec(mk);
    if (m) {
      const n = +m[3]; limit = m[2] === '<' ? n - 1 : m[2] === '=' ? (n === 1 ? 1 : 0) : n;
      const rep = /^where/i.test(m[1]) ? (m[4] ? 'WHERE ' : '') : (m[4] ? 'AND ' : '');
      s = s.slice(0, m.index) + rep + s.slice(m.index + m[0].length);
    }
    s = codeMap(s, c => c.replace(/\brownum\b/gi, 'ROW_NUMBER() OVER ()'));
    if (limit !== null) s = s.replace(/\s*$/, '') + ' LIMIT ' + Math.max(0, limit);
    return s;
  }

  async function execStatement(text, plsql, opt) {
    opt = opt || {};
    if (!db) { print('SP2-0640: Not connected\n'); return; }
    let t = await substitute(text, true); if (t === null) return;
    const t0 = performance.now();
    try { await runUnit(t, plsql, opt); }
    catch (e) { if (e instanceof OraErr) printErr(t, { at: e.tok ? locate(t, e.tok) : { line: 1, col: 0 }, msgs: e.msgs }); else printErr(t, { at: { line: 1, col: 0 }, msgs: [String(e && e.message || e)] }); }
    if (S.autocommit && db && /^\s*(insert|update|delete|merge)\b/i.test(t)) { try { db.db.run('COMMIT'); db.db.run('BEGIN'); } catch (e) { } if (fbMsg('Commit complete.')) print('Commit complete.\n\n'); }
    afterUnit();
    if (S.timing) print(elapsed(performance.now() - t0) + '\n');
  }

  async function runUnit(t, plsql, opt) {
    const mk = maskStr(t); const first = ((/^\s*([A-Za-z]+)/.exec(mk) || [])[1] || '').toUpperCase();
    const isCreatePl = /^\s*create\s+(or\s+replace\s+)?((no)?editionable\s+)?(procedure|function|trigger|package|type)\b/i.exec(mk);
    let r;
    // ---- statements handled here instead of the engine ----
    if ((r = /^\s*drop\s+(procedure|function|trigger|package|type)\s+(?:"?[\w$#]+"?\.)?"?([\w$#]+)"?\s*$/i.exec(mk))) {
      const kind = r[1].toLowerCase(), n = r[2].toLowerCase();
      const i = U.plsql.findIndex(p => p.kind === kind && p.name === n);
      if (i < 0) { printErr(t, { at: locate(t, r[2]), msgs: ['ORA-04043: object ' + r[2].toUpperCase() + ' does not exist'] }); return; }
      U.plsql.splice(i, 1); delete U.invalid[n];
      if (kind === 'procedure') sess.procs.delete(n); else if (kind === 'function') { sess.funcs.delete(n); } else if (kind === 'trigger') sess.triggers = sess.triggers.filter(x => String(x.name).toLowerCase() !== n);
      ddlCommit(); msgOut(cap(kind) + ' dropped.'); return;
    }
    if ((r = /^\s*create\s+sequence\s+"?([\w$#]+)"?([\s\S]*)$/i.exec(mk))) {
      const n = r[1].toLowerCase(); if (U.seqs[n] || tableExists(n)) { printErr(t, { at: locate(t, r[1]), msgs: ['ORA-00955: name is already used by an existing object'] }); return; }
      const o = r[2]; const num = (re, d) => { const m = re.exec(o); return m ? +m[1] : d; };
      const inc = num(/increment\s+by\s+(-?\d+)/i, 1); const min = num(/minvalue\s+(-?\d+)/i, inc > 0 ? 1 : -1e27); const max = /nomaxvalue/i.test(o) ? null : num(/maxvalue\s+(-?\d+)/i, null);
      U.seqs[n] = { start: num(/start\s+with\s+(-?\d+)/i, inc > 0 ? min : (max === null ? -1 : max)), inc, min, max, cycle: /\bcycle\b/i.test(o) && !/\bnocycle\b/i.test(o), cur: null };
      ddlCommit(); saveUser(); msgOut('Sequence created.'); return;
    }
    if ((r = /^\s*drop\s+sequence\s+"?([\w$#]+)"?\s*$/i.exec(mk))) { const n = r[1].toLowerCase(); if (!U.seqs[n]) { printErr(t, { at: locate(t, r[1]), msgs: ['ORA-02289: sequence does not exist'] }); return; } delete U.seqs[n]; ddlCommit(); saveUser(); msgOut('Sequence dropped.'); return; }
    if ((r = /^\s*alter\s+sequence\s+"?([\w$#]+)"?([\s\S]*)$/i.exec(mk))) { const s = U.seqs[r[1].toLowerCase()]; if (!s) { printErr(t, { at: locate(t, r[1]), msgs: ['ORA-02289: sequence does not exist'] }); return; } const m2 = /increment\s+by\s+(-?\d+)/i.exec(r[2]); if (m2) s.inc = +m2[1]; const m3 = /maxvalue\s+(-?\d+)/i.exec(r[2]); if (m3) s.max = +m3[1]; ddlCommit(); saveUser(); msgOut('Sequence altered.'); return; }
    if ((r = /^\s*rename\s+"?([\w$#]+)"?\s+to\s+"?([\w$#]+)"?\s*$/i.exec(mk))) { if (!tableExists(r[1])) { printErr(t, { at: locate(t, r[1]), msgs: ['ORA-04043: object ' + r[1].toUpperCase() + ' does not exist'] }); return; } db.db.run('ALTER TABLE "' + realName(r[1]) + '" RENAME TO "' + r[2] + '"'); ddlCommit(); msgOut('Table renamed.'); return; }
    if (/^\s*comment\s+on\b/i.test(mk)) { msgOut('Comment created.'); return; }
    if (/^\s*(grant|revoke)\b/i.test(mk)) { msgOut(first === 'GRANT' ? 'Grant succeeded.' : 'Revoke succeeded.'); return; }
    if ((r = /^\s*create\s+user\s+"?([\w$#]+)"?/i.exec(mk))) { if (!Gs.users[r[1].toUpperCase()]) { Gs.users[r[1].toUpperCase()] = { created: Date.now(), last: null }; saveGlobal(); } msgOut('User created.'); return; }
    if (/^\s*(alter|drop)\s+user\b/i.test(mk)) { msgOut(first === 'ALTER' ? 'User altered.' : 'User dropped.'); return; }
    if (/^\s*(create|drop)\s+(public\s+)?synonym\b/i.test(mk) || /^\s*(analyze|audit|noaudit|lock)\b/i.test(mk)) { msgOut(/synonym/i.test(mk) ? 'Synonym ' + (first === 'CREATE' ? 'created.' : 'dropped.') : first === 'ANALYZE' ? 'Table analyzed.' : first === 'LOCK' ? 'Table(s) Locked.' : 'Audit succeeded.'); return; }
    if (/^\s*purge\s+recyclebin\b/i.test(mk)) { msgOut('Recyclebin purged.'); return; }
    if (/^\s*explain\b/i.test(mk)) { msgOut('Explained.'); return; }
    if (/^\s*alter\s+(session|system)\b/i.test(mk)) { msgOut(/session/i.test(mk) ? 'Session altered.' : 'System altered.'); return; }
    if (/^\s*alter\s+table\b/i.test(mk)) { const a = alterTable(t); if (a) { msgOut(a.msg); return; } }
    if (/^\s*alter\s+(trigger|procedure|function)\b/i.test(mk)) { msgOut(cap((/^\s*alter\s+(\w+)/i.exec(mk))[1].toLowerCase()) + ' altered.'); return; }
    if (/^\s*drop\s+table\b/i.test(mk) && /\bpurge\s*$/i.test(mk)) t = t.replace(/\s+purge\s*$/i, '');
    // ---- binds, sequences, USER ----
    const isTrigger = isCreatePl && /trigger/i.test(isCreatePl[4]);
    const b = rewriteBinds(t, isTrigger);
    if (b.undeclared.length && !isCreatePl) { print('SP2-0552: Bind variable "' + b.undeclared[0] + '" not declared.\n'); return; }
    let send = rewriteSpecial(b.t);
    if (!plsql) send = rewriteRownum(send);
    Object.entries(U.binds).forEach(([k, v]) => sess.global.vars.set('b$' + k.toLowerCase(), { type: {}, value: v.value === undefined ? null : v.value }));
    buildDict(send);
    // ---- checks SQLite would not do ----
    if (!plsql && (first === 'SELECT' || first === 'WITH')) { const g = groupByCheck(t); if (g) { printErr(t, g); return; } }
    const pre = !plsql ? dmlPre(send) : null;
    const ctas = !plsql ? /^\s*create\s+table\s+"?([\w$#]+)"?\s+as\s+(\(?\s*select\b[\s\S]*)$/i.exec(maskStr(t)) : null;
    if (ctas) {
      const sel = t.slice(t.length - ctas[2].length); const items = selectItems(sel) || [];
      const bad = items.map(itemHead).find(h => !h.star && !h.ref && !/^[A-Za-z_][\w$#]*$/.test(h.head));
      if (bad) { printErr(t, { at: locate(t, bad.head.split('(')[0]), msgs: ['ORA-00998: must name this expression with a column alias'] }); return; }
    }
    // ---- run ----
    const res = sess.run(plsql ? send + '\n/' : send + '\n;');
    const log = res.log;
    const hasErr = log.some(l => l.type === 'error');
    let lateErr = null;
    if (pre) lateErr = dmlPost(pre, !hasErr);
    if (ctas && !hasErr) fixCtasTypes(ctas[1], t.slice(t.length - ctas[2].length));
    // bind read-back
    Object.entries(U.binds).forEach(([k, v]) => { const c = sess.global.vars.get('b$' + k.toLowerCase()); if (c) { let x = c.value; if (v.type === 'NUMBER' && x !== null && x !== undefined && x !== '') x = Number(x); v.value = x === undefined ? null : x; } });
    if (Object.keys(U.binds).length) saveUser();
    // ---- CREATE PROCEDURE / FUNCTION / TRIGGER bookkeeping ----
    if (isCreatePl) {
      const nm = /^\s*create\s+(?:or\s+replace\s+)?(?:(?:no)?editionable\s+)?(procedure|function|trigger|package\s+body|package|type\s+body|type)\s+(?:"?[\w$#]+"?\s*\.\s*)?"?([\w$#]+)"?/i.exec(mk);
      const kind = nm[1].toLowerCase().replace(/\s+body$/, ''), n = nm[2].toLowerCase();
      if (/package|type/.test(kind)) { printErr(t, { at: { line: 1, col: 0 }, msgs: ['ORA-00900: invalid SQL statement – ' + kind.toUpperCase() + ' is not supported by this practice terminal'] }, { noSrc: true }); return; }
      const ok = log.some(l => l.type === 'msg' && /created\./.test(l.text));
      const entryP = { kind, name: n, src: send, created: Date.now(), invalid: !ok };
      const i = U.plsql.findIndex(p => p.kind === kind && p.name === n);
      if (i >= 0 && !/or\s+replace/i.test(mk)) { printErr(t, { at: locate(t, nm[2]), msgs: ['ORA-00955: name is already used by an existing object'] }); if (ok) { try { sess.run(U.plsql[i].src + '\n/'); } catch (e) { } } return; }
      if (i >= 0) U.plsql[i] = entryP; else U.plsql.push(entryP);
      if (ok) { delete U.invalid[n]; if (lastErr && lastErr.name === n) lastErr = null; ddlCommit(); msgOut(cap(kind) + ' created.'); return; }
      U.invalid[n] = kind; if (kind === 'procedure') sess.procs.delete(n); else if (kind === 'function') sess.funcs.delete(n); else sess.triggers = sess.triggers.filter(x => String(x.name).toLowerCase() !== n);
      const e = log.find(l => l.type === 'error'); const pe = plsqlError(e.text, t, false);
      lastErr = { kind, name: n, items: [pe.compile || { line: 1, col: 1, text: e.text }] };
      ddlCommit(); print('\nWarning: ' + cap(kind) + ' created with compilation errors.\n\n'); return;
    }
    // ---- output ----
    let outs = [];
    const flush = () => { if (outs.length && S.serveroutput) print(serverOut(outs)); outs = []; };
    for (const l of log) {
      if (l.type === 'out') { outs.push(l.text); continue; }
      flush();
      if (l.type === 'table') printQuery(l.cols, l.rows, t);
      else if (l.type === 'msg') { if (lateErr) continue; msgOut(mapMsg(l.text, t)); }
      else if (l.type === 'error') {
        if (plsql) { const pe = plsqlError(l.text, opt.exec ? opt.execText : t, opt.exec); printErr(opt.exec ? opt.execText : t, pe, { exec: opt.exec && pe.runtime }); }
        else printErr(t, sqlError(l.text, t));
      }
    }
    flush();
    if (lateErr) printErr(t, { at: { line: 1, col: 0 }, msgs: [lateErr] });
  }
  // CREATE TABLE … AS SELECT: give the new columns the source columns' Oracle types
  function fixCtasTypes(name, sel) {
    try {
      const info = tableInfo(name); if (!info.length) return;
      const tables = fromTables(sel); const heads = (selectItems(sel) || []).map(itemHead);
      let changed = false;
      const parts = info.map(c => {
        const h = heads.find(x => !x.star && x.head.toLowerCase() === c.name.toLowerCase());
        const decl = lookupDecl(tables, h && h.ref ? h.ref : { q: null, n: c.name.toLowerCase() });
        const st = q('SELECT MAX(length("' + c.name + '")) AS m, SUM(typeof("' + c.name + '") IN (\'text\',\'blob\')) AS t FROM "' + name + '"')[0];
        const ty = decl || (/^NUM|^INT|^REAL/i.test(c.type) || !st.t ? 'NUMBER' : 'VARCHAR2(' + Math.max(1, st.m || 1) + ')');
        if (ty !== c.type) changed = true;
        return c.name + ' ' + ty;
      });
      if (changed) rebuild(name, parts, info.map(c => c.name), (msg) => new OraErr([msg]));
    } catch (e) { }
  }
  function mapMsg(m, t) {
    const mk = maskStr(t);
    if (m === 'Done.' || m === 'Created.' || m === 'Dropped.') {
      if (/^\s*savepoint\b/i.test(mk)) return 'Savepoint created.';
      if (/^\s*rollback\b/i.test(mk)) return 'Rollback complete.';
      if (/^\s*truncate\b/i.test(mk)) return 'Table truncated.';
      if (/^\s*create\s+(unique\s+|bitmap\s+)?index\b/i.test(mk)) return 'Index created.';
      if (/^\s*drop\s+index\b/i.test(mk)) return 'Index dropped.';
      if (/^\s*create\s+(global\s+temporary\s+)?table\b/i.test(mk)) return 'Table created.';
      if (/^\s*drop\s+view\b/i.test(mk)) return 'View dropped.';
      if (/^\s*merge\b/i.test(mk)) return '1 row merged.';
    }
    if (/^\s*truncate\b/i.test(mk) && /rows? deleted/.test(m)) return 'Table truncated.';
    if (/^\s*alter\s+table\b[\s\S]*\brename\b/i.test(mk)) return 'Table altered.';
    return m;
  }
  function serverOut(lines) {
    const out = []; const w = S.linesize;
    lines.forEach(l => {
      const s = String(l === null || l === undefined ? '' : l);
      if (S.serverFormat === 'TRUNCATED') { out.push(s.slice(0, w)); return; }
      if (S.serverFormat === 'WRAPPED') { if (!s) { out.push(''); return; } for (let i = 0; i < s.length; i += w) out.push(s.slice(i, i + w)); return; }
      const t = s.replace(/^\s+/, ''); if (!t) { out.push(''); return; }
      let cur = ''; t.split(/(\s+)/).forEach(word => { if ((cur + word).length > w && cur.trim()) { out.push(cur.trimEnd()); cur = word.trimStart(); } else cur += word; while (cur.length > w) { out.push(cur.slice(0, w)); cur = cur.slice(w); } }); out.push(cur.trimEnd());
    });
    return out.join('\n') + '\n';
  }
  function printQuery(names, rows, src) {
    if (!rows.length) { if (S.feedback > 0) print('\nno rows selected\n\n'); else print('\n'); return; }
    const lines = renderQuery(names, rows, src);
    let s = lines.join('\n') + '\n\n';
    if (S.feedback > 0 && rows.length >= S.feedback) s += rows.length + (rows.length === 1 ? ' row selected.' : ' rows selected.') + '\n\n';
    print(s);
  }

  /* ============================================================ SQL buffer */
  function listBuf(from, to) {
    if (!buf.lines.length) { print('SP2-0223: No lines in SQL buffer.\n'); return; }
    from = Math.max(1, from || 1); to = Math.min(buf.lines.length, to || buf.lines.length);
    if (from > to) { print('SP2-0226: Invalid line number\n'); return; }
    let s = ''; for (let i = from; i <= to; i++) s += padL(i, 3) + (i === to ? '*' : ' ') + ' ' + buf.lines[i - 1] + '\n';
    buf.cur = to; print(s);
  }
  async function runBuffer(list) {
    if (!buf.lines.length) { print('SP2-0103: Nothing in SQL buffer to run.\n'); return; }
    if (list) listBuf();
    const text = buf.lines.join('\n');
    addHist(text + (buf.plsql ? '\n/' : ';'));
    await execStatement(text, buf.plsql);
  }
  function storeEntry(e) {
    const lines = e.lines.map(l => l.replace(/\s+$/, ''));
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    buf = { lines, cur: lines.length, plsql: e.plsql };
  }
  function endsWithTerminator(text) {
    const s = segs(text.replace(/\s+$/, '')); const last = s[s.length - 1];
    return !!last && last.t === 'c' && /;\s*$/.test(last.v);
  }
  async function entryLine(raw) {
    const t = raw.trim(); const e = entry;
    if (e.lines.length) {
      if (t === '/') { storeEntry(e); entry = null; return runBuffer(false); }
      if (t === '.') { storeEntry(e); entry = null; return; }
      if (!e.plsql && t === '' && !S.sqlblanklines) { storeEntry(e); entry = null; return; }
    }
    e.lines.push(raw);
    e.plsql = isPlsqlText(e.lines.join('\n'));
    if (!e.plsql && endsWithTerminator(e.lines.join('\n'))) {
      const L = e.lines.length - 1; e.lines[L] = e.lines[L].replace(/;\s*$/, '');
      storeEntry(e); entry = null; return runBuffer(false);
    }
  }
  function addHist(text) { if (!S.history) return; Gs.hist.push(text); while (Gs.hist.length > S.historySize) Gs.hist.shift(); saveGlobal(); }

  /* ============================================================ line dispatcher */
  const CMDS = [['APPEND', 1], ['ACCEPT', 3], ['BREAK', 3], ['BTITLE', 3], ['CHANGE', 1], ['CLEAR', 2], ['COLUMN', 3], ['COMPUTE', 4], ['CONNECT', 4], ['DEFINE', 3], ['DEL', 3], ['DESCRIBE', 4], ['DISCONNECT', 4], ['EDIT', 2], ['EXECUTE', 4], ['EXIT', 4], ['GET', 3], ['HELP', 4], ['HISTORY', 4], ['HOST', 2], ['INPUT', 1], ['LIST', 1], ['PASSWORD', 5], ['PAUSE', 3], ['PRINT', 3], ['PROMPT', 3], ['QUIT', 4], ['REMARK', 3], ['RUN', 1], ['SAVE', 3], ['SET', 3], ['SHOW', 3], ['SHUTDOWN', 8], ['SPOOL', 3], ['START', 3], ['STARTUP', 7], ['STORE', 3], ['TIMING', 4], ['TTITLE', 3], ['UNDEFINE', 5], ['VARIABLE', 3], ['WHENEVER', 4]];
  function findCmd(word) { const W = word.toUpperCase(); const c = CMDS.find(([n, m]) => W.length >= m && n.startsWith(W)); return c ? c[0] : null; }
  function promptText() {
    if (cont !== null) return S.sqlcontinue;
    if (entry) return padL(entry.lines.length + 1, 3) + '  ';
    return S.sqlprompt.replace(/_USER/g, user || '').replace(/_CONNECT_IDENTIFIER/g, 'XE').replace(/_DATE/g, oraToday()).replace(/_PRIVILEGE/g, defines._PRIVILEGE || '');
  }
  async function handleLine(raw) {
    if (raw === null) { entry = null; cont = null; return; }
    if (cont !== null) { raw = cont + raw; cont = null; }
    if (entry) return entryLine(raw);
    const t = raw.trim();
    if (!t) return;
    if (t === '/') return runBuffer(false);
    if (t === '.') return;
    let m;
    if ((m = /^(\d+)$/.exec(t))) { const n = +m[1]; if (!buf.lines.length) { print('SP2-0223: No lines in SQL buffer.\n'); return; } if (n < 1 || n > buf.lines.length) { print('SP2-0226: Invalid line number\n'); return; } listBuf(n, n); return; }
    if ((m = /^(\d+)\s(.*)$/.exec(raw.replace(/^\s+/, '')))) { const n = +m[1]; if (n === 0) { buf.lines.unshift(m[2]); buf.cur = 1; } else if (n > buf.lines.length) { buf.lines.push(m[2]); buf.cur = buf.lines.length; } else { buf.lines[n - 1] = m[2]; buf.cur = n; } return; }
    if (/^(--|\/\*)/.test(t)) return;
    if (t[0] === '@') return cmdStart(t.replace(/^@@?/, ''));
    if (t[0] === '!' || t[0] === '$') return cmdHost(t.slice(1));
    if (t[0] === '?') return cmdHelp(t.slice(1));
    const w = (/^[A-Za-z]+/.exec(t) || [''])[0];
    const cmd = w ? findCmd(w) : null;
    if (cmd && !(cmd === 'SET' && /^set\s+(transaction|role|constraints?)\b/i.test(t))) {
      if (cmd !== 'REMARK' && /\s-$/.test(raw)) { cont = raw.replace(/-$/, ''); return; }
      return runCmd(cmd, t.slice(w.length));
    }
    if (SQL_WORDS.has(w.toUpperCase()) || t[0] === '(' || /^set\s+(transaction|role|constraints?)\b/i.test(t)) {
      if (!db) { print('SP2-0640: Not connected\n'); return; }
      entry = { lines: [], plsql: false }; return entryLine(raw);
    }
    if (/\s/.test(t)) print('SP2-0734: unknown command beginning "' + t.slice(0, 10) + '..." - rest of line ignored.\n');
    else print('SP2-0042: unknown command "' + t + '" - rest of line ignored.\n');
  }

  /* ============================================================ SQL*Plus commands */
  async function runCmd(cmd, rest) {
    if (cmd !== 'REMARK' && cmd !== 'DEFINE') { const r = await substitute(rest, false); if (r === null) return; rest = r; }
    const a = rest.replace(/;\s*$/, '').trim();
    switch (cmd) {
      case 'REMARK': return;
      case 'LIST': return cmdList(a);
      case 'RUN': return runBuffer(true);
      case 'APPEND': { if (!buf.lines.length) return print('SP2-0223: No lines in SQL buffer.\n'); const txt = rest.replace(/^\s/, ''); buf.lines[buf.cur - 1] += txt; listBuf(buf.cur, buf.cur); return; }
      case 'CHANGE': return cmdChange(rest.replace(/^\s+/, ''));
      case 'DEL': return cmdDel(a);
      case 'INPUT': return cmdInput(rest.replace(/^\s/, ''));
      case 'CLEAR': return cmdClear(a);
      case 'SET': return cmdSet(a);
      case 'SHOW': return cmdShow(a);
      case 'DESCRIBE': return cmdDesc(a);
      case 'COLUMN': return cmdColumn(a);
      case 'BREAK': return cmdBreak(a);
      case 'COMPUTE': return cmdCompute(a);
      case 'TTITLE': case 'BTITLE': return cmdTitle(cmd, a);
      case 'DEFINE': return cmdDefine(a);
      case 'UNDEFINE': args(a).forEach(x => { delete defines[x.v.toUpperCase()]; }); return;
      case 'ACCEPT': return cmdAccept(a);
      case 'PROMPT': print(rest.replace(/^\s/, '') + '\n'); return;
      case 'PAUSE': { const r = await readLine(rest.replace(/^\s/, '')); void r; return; }
      case 'VARIABLE': return cmdVariable(a);
      case 'PRINT': return cmdPrint(a);
      case 'EXECUTE': { if (!db) { print('SP2-0640: Not connected\n'); return; } const body = rest.trim().replace(/;\s*$/, ''); const txt = 'BEGIN ' + body + '; END;'; addHist('exec ' + body); return execStatement(txt, true, { exec: true, execText: txt }); }
      case 'SPOOL': return cmdSpool(a);
      case 'SAVE': return cmdSave(a);
      case 'GET': return cmdGet(a);
      case 'START': return cmdStart(a);
      case 'STORE': return cmdStore(a);
      case 'EDIT': return cmdEdit(a);
      case 'HOST': return cmdHost(a);
      case 'HELP': return cmdHelp(a);
      case 'HISTORY': return cmdHistory(a);
      case 'TIMING': return cmdTiming(a);
      case 'CONNECT': return cmdConnect(a);
      case 'DISCONNECT': if (db) { closeSession(true, false); print('Disconnected from ' + VERSION + '\n'); } return;
      case 'EXIT': case 'QUIT': return cmdExit(a);
      case 'PASSWORD': { if (!db) { print('SP2-0640: Not connected\n'); return; } print('Changing password for ' + user + '\n'); await readLine('Old password: ', { hidden: true }); const n1 = await readLine('New password: ', { hidden: true }); const n2 = await readLine('Retype new password: ', { hidden: true }); print(n1 === n2 ? 'Password changed\n' : 'ERROR:\nORA-01017: invalid username/password; logon denied\n\nPassword unchanged\n'); return; }
      case 'WHENEVER': return;
      case 'STARTUP': case 'SHUTDOWN': print(user === 'SYS' ? (cmd === 'STARTUP' ? 'ORA-01081: cannot start already-running ORACLE - shut it down first\n' : 'ORA-01097: cannot shutdown while in a transaction - commit or rollback first\n') : 'ORA-01031: insufficient privileges\n'); return;
    }
  }
  function cmdList(a) {
    if (!buf.lines.length) { print('SP2-0223: No lines in SQL buffer.\n'); return; }
    const n = buf.lines.length; const v = (x) => (x === '*' ? buf.cur : /^last$/i.test(x) ? n : +x);
    const p = a.split(/\s+/).filter(Boolean);
    if (!p.length) return listBuf();
    if (p.length === 1) { const k = v(p[0]); if (!(k >= 1 && k <= n)) { print('SP2-0226: Invalid line number\n'); return; } return listBuf(k, k); }
    const x = v(p[0]), y = v(p[1]); if (!(x >= 1) || !(y >= 1) || x > n) { print('SP2-0226: Invalid line number\n'); return; } listBuf(x, Math.min(y, n));
  }
  function cmdChange(r) {
    if (!buf.lines.length) { print('SP2-0223: No lines in SQL buffer.\n'); return; }
    const sep = r[0]; if (!sep || /[\w\s]/.test(sep)) { print('SP2-0024: Nothing to change.\n'); return; }
    const p = r.slice(1).split(sep); const old = p[0], nw = p.length > 1 ? p[1] : '';
    const L = buf.lines[buf.cur - 1];
    if (!old) { buf.lines[buf.cur - 1] = nw + L; listBuf(buf.cur, buf.cur); return; }
    const i = L.toLowerCase().indexOf(old.toLowerCase()); if (i < 0) { print('SP2-0023: String not found.\n'); return; }
    buf.lines[buf.cur - 1] = L.slice(0, i) + nw + L.slice(i + old.length); listBuf(buf.cur, buf.cur);
  }
  function cmdDel(a) {
    if (!buf.lines.length) { print('SP2-0223: No lines in SQL buffer.\n'); return; }
    const n = buf.lines.length; const v = (x) => (x === '*' ? buf.cur : /^last$/i.test(x) ? n : +x);
    const p = a.split(/\s+/).filter(Boolean); let x = p.length ? v(p[0]) : buf.cur, y = p.length > 1 ? v(p[1]) : x;
    if (!(x >= 1 && x <= n) || !(y >= x)) { print('SP2-0226: Invalid line number\n'); return; }
    y = Math.min(y, n); buf.lines.splice(x - 1, y - x + 1); buf.cur = Math.min(x, buf.lines.length);
  }
  async function cmdInput(text) {
    if (text.trim()) { buf.lines.splice(buf.cur, 0, text); buf.cur++; return; }
    for (; ;) {
      const l = await readLine(padL(buf.cur + 1, 3) + 'i ');
      if (l === null || !l.trim()) return;
      if (l.trim() === '/') { await runBuffer(false); return; }
      buf.lines.splice(buf.cur, 0, l); buf.cur++;
    }
  }
  function cmdClear(a) {
    const w = a.toUpperCase().split(/\s+/)[0] || '';
    const is = (full, min) => w.length >= min && full.startsWith(w);
    if (is('SCREEN', 3)) { ui.out.textContent = ''; return; }
    if (is('BUFFER', 4)) { buf = { lines: [], cur: 0, plsql: false }; print('buffer cleared\n'); return; }
    if (is('SQL', 3)) { buf = { lines: [], cur: 0, plsql: false }; print('sql cleared\n'); return; }
    if (is('COLUMNS', 3)) { cols = {}; print('columns cleared\n'); return; }
    if (is('BREAKS', 3)) { breaks = []; print('breaks cleared\n'); return; }
    if (is('COMPUTES', 4)) { computes = []; print('computes cleared\n'); return; }
    if (is('TIMING', 4)) { timer = null; print('timing for: \nElapsed: 00:00:00.00\n'); return; }
    print('SP2-0158: unknown CLEAR option "' + (a.split(/\s+/)[0] || '') + '"\n');
  }

  /* ---------- SET / SHOW ---------- */
  const BOOL = { ON: true, OFF: false };
  const SETS = [
    ['LINESIZE', 3, 'int', 'linesize', 1, 32767], ['PAGESIZE', 5, 'int', 'pagesize', 0, 50000], ['NEWPAGE', 4, 'newpage'], ['NUMWIDTH', 3, 'int', 'numwidth', 2, 50],
    ['NUMFORMAT', 4, 'str', 'numformat'], ['HEADING', 3, 'bool', 'heading'], ['HEADSEP', 5, 'headsep'], ['ECHO', 4, 'bool', 'echo'], ['FEEDBACK', 4, 'feedback'],
    ['VERIFY', 3, 'bool', 'verify'], ['TIMING', 4, 'bool', 'timing'], ['AUTOCOMMIT', 4, 'autocommit'], ['SERVEROUTPUT', 9, 'serverout'], ['NULL', 4, 'str', 'null'],
    ['SQLPROMPT', 4, 'str', 'sqlprompt'], ['DEFINE', 3, 'define'], ['ESCAPE', 3, 'escape'], ['CONCAT', 3, 'concat'], ['COLSEP', 4, 'str', 'colsep'],
    ['UNDERLINE', 3, 'underline'], ['WRAP', 3, 'bool', 'wrap'], ['RECSEP', 6, 'recsep'], ['SQLBLANKLINES', 5, 'bool', 'sqlblanklines'], ['TERMOUT', 4, 'bool', 'termout'],
    ['HISTORY', 4, 'history'], ['SQLCONTINUE', 5, 'str', 'sqlcontinue'], ['TRIMSPOOL', 5, 'bool', 'trimspool'],
    ['TRIMOUT', 4, 'ign'], ['TAB', 3, 'ign'], ['FLUSH', 3, 'ign'], ['ARRAYSIZE', 5, 'ign'], ['LONG', 4, 'ign'], ['LONGCHUNKSIZE', 5, 'ign'], ['SQLTERMINATOR', 4, 'ign'],
    ['SQLNUMBER', 4, 'ign'], ['SQLCASE', 4, 'ign'], ['SUFFIX', 3, 'ign'], ['EXITCOMMIT', 5, 'ign'], ['EMBEDDED', 3, 'ign'], ['DESCRIBE', 4, 'rest'], ['PAUSE', 3, 'ign'],
    ['SHOWMODE', 4, 'ign'], ['SPACE', 3, 'ign'], ['MARKUP', 4, 'rest'], ['AUTOTRACE', 5, 'rest'], ['LOBOFFSET', 4, 'ign'], ['EDITFILE', 5, 'ign'], ['COPYCOMMIT', 5, 'ign'],
    ['ERRORLOGGING', 3, 'rest'], ['STATEMENTCACHE', 4, 'ign'], ['INSTANCE', 4, 'ign'], ['SECUREDCOL', 4, 'rest'], ['SQLPREFIX', 6, 'ign'], ['BLOCKTERMINATOR', 3, 'ign'], ['CMDSEP', 4, 'ign'], ['APPINFO', 3, 'ign'], ['WORKSPACE', 4, 'ign'], ['XQUERY', 6, 'rest'], ['COLINVISIBLE', 4, 'ign'], ['ROWPREFETCH', 6, 'ign'], ['LOBPREFETCH', 6, 'ign'], ['FEEDBACKSQL', 6, 'ign'], ['SHIFTINOUT', 5, 'ign'], ['RECSEPCHAR', 7, 'ign']
  ];
  const findSet = (w) => { const W = w.toUpperCase(); return SETS.find(([n, m]) => n === W) || SETS.find(([n, m]) => W.length >= m && n.startsWith(W)); };
  function cmdSet(a) {
    const tk = args(a); let i = 0;
    if (!tk.length) { print('SP2-0265: SET requires an option\n'); return; }
    while (i < tk.length) {
      const o = tk[i++]; const spec = findSet(o.v);
      if (!spec) { print('SP2-0158: unknown SET option "' + o.v + '"\n'); return; }
      const [name, , type, key, lo, hi] = spec; const low = name.toLowerCase();
      const val = tk[i] ? tk[i].v : undefined; const V = val !== undefined ? val.toUpperCase() : undefined;
      const need = () => { if (val === undefined) { print('SP2-0281: ' + low + ' missing set value\n'); return false; } i++; return true; };
      switch (type) {
        case 'int': { if (!need()) return; if (!/^\d+$/.test(val)) { print('SP2-0268: ' + low + ' option not a valid number\n'); return; } const n = +val; if (n < lo || n > hi) { print('SP2-0267: ' + low + ' option ' + n + ' out of range (' + lo + ' through ' + hi + ')\n'); return; } S[key] = n; break; }
        case 'bool': { if (!need()) return; if (!(V in BOOL)) { print('SP2-0265: ' + low + ' must be set ON or OFF\n'); return; } S[key] = BOOL[V]; break; }
        case 'str': { if (!need()) return; S[key] = val; break; }
        case 'newpage': { if (!need()) return; S.newpage = V === 'NONE' ? 0 : /^\d+$/.test(val) ? Math.min(999, +val) : S.newpage; break; }
        case 'headsep': { if (!need()) return; S.headsep = V === 'ON' ? '|' : V === 'OFF' ? '' : val[0]; break; }
        case 'feedback': { if (!need()) return; if (V === 'ON') S.feedback = 1; else if (V === 'OFF') S.feedback = 0; else if (/^\d+$/.test(val)) S.feedback = +val; else { print('SP2-0268: feedback option not a valid number\n'); return; } if (tk[i] && /^sql_id$/i.test(tk[i].v)) i++; break; }
        case 'autocommit': { if (!need()) return; S.autocommit = V === 'ON' || V === 'IMMEDIATE' || V === 'IMM' || (/^\d+$/.test(val) && +val > 0); break; }
        case 'serverout': {
          if (!need()) return; if (!(V in BOOL)) { print('SP2-0265: serveroutput must be set ON or OFF\n'); return; } S.serveroutput = BOOL[V];
          while (tk[i] && /^(size|siz|format|for|unl|unlimited)$/i.test(tk[i].v)) {
            const k = tk[i++].v.toUpperCase();
            if (k.startsWith('SIZ')) { const sz = tk[i++]; S.serverSize = sz ? sz.v.toUpperCase() : 'UNLIMITED'; }
            else if (k.startsWith('FOR')) { const f = (tk[i++] || { v: '' }).v.toUpperCase(); S.serverFormat = /^WOR/.test(f) ? 'WORD_WRAPPED' : /^WRA/.test(f) ? 'WRAPPED' : /^TRU/.test(f) ? 'TRUNCATED' : S.serverFormat; }
          }
          break;
        }
        case 'define': { if (!need()) return; if (V === 'ON') { S.defineOn = true; S.defineChar = '&'; } else if (V === 'OFF') S.defineOn = false; else { S.defineOn = true; S.defineChar = val[0]; } break; }
        case 'escape': { if (!need()) return; if (V === 'ON') { S.escapeOn = true; S.escapeChar = '\\'; } else if (V === 'OFF') S.escapeOn = false; else { S.escapeOn = true; S.escapeChar = val[0]; } break; }
        case 'concat': { if (!need()) return; S.concat = V === 'ON' ? '.' : V === 'OFF' ? '\u0000' : val[0]; break; }
        case 'underline': { if (!need()) return; S.underline = V === 'ON' ? '-' : V === 'OFF' ? '' : val[0]; break; }
        case 'recsep': { if (!need()) return; S.recsep = /^WR/.test(V) ? 'WRAPPED' : /^EA/.test(V) ? 'EACH' : 'OFF'; break; }
        case 'history': { if (!need()) return; if (V in BOOL) S.history = BOOL[V]; else if (/^\d+$/.test(val)) { S.history = true; S.historySize = Math.min(100000, +val); } break; }
        case 'rest': i = tk.length; break;
        default: if (val !== undefined) i++;
      }
    }
  }
  const hex = (c) => '(hex ' + c.charCodeAt(0).toString(16) + ')';
  function showOne(w) {
    const W = w.toUpperCase();
    const is = (full, min) => W.length >= min && full.startsWith(W);
    if (is('USER', 3)) return 'USER is "' + (user || '') + '"';
    if (is('RELEASE', 3)) return 'release 2103000000';
    if (is('SPOOL', 3)) return spool ? 'currently spooling to ' + spool.name : 'not spooling currently';
    if (is('CON_NAME', 5)) return '\nCON_NAME\n------------------------------\nXEPDB1';
    if (is('SGA', 3)) return 'ORA-01031: insufficient privileges';
    const spec = findSet(w); if (!spec) return null;
    const [name, , type, key] = spec; const low = name.toLowerCase();
    switch (type) {
      case 'int': return low + ' ' + S[key];
      case 'bool': return key === 'wrap' ? 'wrap : lines will be ' + (S.wrap ? 'wrapped' : 'truncated') : low + ' ' + (S[key] ? 'ON' : 'OFF');
      case 'str': return low + ' "' + S[key] + '"';
      case 'newpage': return 'newpage ' + S.newpage;
      case 'headsep': return S.headsep ? 'headsep "' + S.headsep + '" ' + hex(S.headsep) : 'headsep OFF';
      case 'feedback': return S.feedback ? 'FEEDBACK ON for ' + S.feedback + ' or more rows SQL_ID OFF' : 'feedback OFF';
      case 'autocommit': return 'autocommit ' + (S.autocommit ? 'IMMEDIATE' : 'OFF');
      case 'serverout': return S.serveroutput ? 'serveroutput ON SIZE ' + S.serverSize + ' FORMAT ' + S.serverFormat : 'serveroutput OFF';
      case 'define': return S.defineOn ? 'define "' + S.defineChar + '" ' + hex(S.defineChar) : 'define OFF';
      case 'escape': return S.escapeOn ? 'escape "' + S.escapeChar + '" ' + hex(S.escapeChar) : 'escape OFF';
      case 'concat': return S.concat === '\u0000' ? 'concat OFF' : 'concat "' + S.concat + '" ' + hex(S.concat);
      case 'underline': return S.underline ? 'underline "' + S.underline + '" ' + hex(S.underline) : 'underline OFF';
      case 'recsep': return 'recsep ' + S.recsep.replace('WRAPPED', 'WRAP') + '\nrecsepchar " " (hex 20)';
      case 'history': return S.history ? 'history is ON and set to "' + S.historySize + '"' : 'history is OFF';
      default: return low + ' OFF';
    }
  }
  function cmdShow(a) {
    const tk = a.split(/\s+/).filter(Boolean);
    if (!tk.length) { print('SP2-0158: unknown SHOW option ""\n'); return; }
    const W = tk[0].toUpperCase();
    if (W === 'ALL') { const names = ['AUTOCOMMIT', 'COLSEP', 'CONCAT', 'DEFINE', 'ECHO', 'ESCAPE', 'FEEDBACK', 'HEADING', 'HEADSEP', 'HISTORY', 'LINESIZE', 'NEWPAGE', 'NULL', 'NUMFORMAT', 'NUMWIDTH', 'PAGESIZE', 'RECSEP', 'RELEASE', 'SERVEROUTPUT', 'SPOOL', 'SQLBLANKLINES', 'SQLCONTINUE', 'SQLPROMPT', 'TERMOUT', 'TIMING', 'UNDERLINE', 'USER', 'VERIFY', 'WRAP']; print(names.map(n => showOne(n)).filter(Boolean).filter(x => !/ OFF$/.test(x) || true).join('\n') + '\n'); return; }
    if (W.length >= 3 && 'ERRORS'.startsWith(W)) {
      let target = lastErr;
      if (tk[1]) { const n = (tk[2] || tk[1]).toLowerCase().replace(/^.*\./, ''); target = lastErr && lastErr.name === n ? lastErr : null; if (!target) { print('No errors.\n'); return; } }
      if (!target) { print('No errors.\n'); return; }
      let s = 'Errors for ' + target.kind.toUpperCase() + ' ' + user + '.' + target.name.toUpperCase() + ':\n\nLINE/COL ERROR\n-------- -----------------------------------------------------------------\n';
      target.items.forEach(it => { const lc = it.line + '/' + it.col; const words = it.text.split(' '); let cur = '', first = true; const lines = []; words.forEach(wd => { if ((cur + ' ' + wd).trim().length > 65) { lines.push(cur.trim()); cur = wd; } else cur += ' ' + wd; }); lines.push(cur.trim()); lines.forEach(l => { s += (first ? padR(lc, 8) : '        ') + ' ' + l + '\n'; first = false; }); });
      print(s); return;
    }
    if (W.length >= 3 && 'PARAMETERS'.startsWith(W)) { print('ORA-00942: table or view does not exist\n'); return; }
    if (W.length >= 3 && 'BTITLE'.startsWith(W) || W.length >= 3 && 'TTITLE'.startsWith(W)) { const t = W[0] === 'B' ? btitle : ttitle; print((W[0] === 'B' ? 'btitle ' : 'ttitle ') + (t && !t.off ? 'ON and is the following ' + t.raw.length + ' characters:\n' + t.raw : 'OFF and is the first few characters of the next SELECT statement') + '\n'); return; }
    const out = []; for (const w of tk) { const r = showOne(w); if (r === null) { print('SP2-0158: unknown SHOW option "' + w + '"\n'); return; } out.push(r); }
    print(out.join('\n') + '\n');
  }

  /* ---------- DESCRIBE ---------- */
  function cmdDesc(a) {
    if (!db) { print('SP2-0640: Not connected\n'); return; }
    const n = a.replace(/^"|"$/g, '').replace(/^[\w$#]+\./, '').trim();
    if (!n) { print('Usage: DESCRIBE [schema.]object[@db_link]\n'); return; }
    const t = realName(n);
    if (t) {
      const info = tableInfo(t);
      let s = ' ' + padR('Name', 41) + ' ' + padR('Null?', 8) + ' Type\n ' + '-'.repeat(41) + ' ' + '-'.repeat(8) + ' ' + '-'.repeat(28) + '\n';
      info.forEach(c => { s += ' ' + padR(c.name.toUpperCase(), 41) + ' ' + padR(c.nn || c.pk ? 'NOT NULL' : '', 8) + ' ' + oraType(c.type) + '\n'; });
      print(s + '\n'); return;
    }
    const low = n.toLowerCase(); const p = sess && (sess.procs.get(low) || sess.funcs.get(low));
    if (p) {
      const tn = (ty) => !ty ? 'UNDEFINED' : (ty.name ? String(ty.name).toUpperCase() : 'UNDEFINED').replace(/^INTEGER$|^INT$/, 'NUMBER(38)');
      let s = p.kind === 'function' ? 'FUNCTION ' + low.toUpperCase() + ' RETURNS ' + tn(p.ret) + '\n' : 'PROCEDURE ' + low.toUpperCase() + '\n';
      if (p.params.length) { s += ' ' + padR('Argument Name', 30) + ' ' + padR('Type', 23) + ' ' + padR('In/Out', 6) + ' Default?\n ' + '-'.repeat(30) + ' ' + '-'.repeat(23) + ' ' + '-'.repeat(6) + ' ' + '-'.repeat(8) + '\n'; p.params.forEach(x => { s += ' ' + padR(String(x.name).toUpperCase(), 30) + ' ' + padR(tn(x.type), 23) + ' ' + (padR((x.mode || 'in').toUpperCase().replace('INOUT', 'IN/OUT'), 6) + (x.def ? ' DEFAULT' : '')).replace(/\s+$/, '') + '\n'; }); }
      print(s + '\n'); return;
    }
    if (U && U.seqs[low]) { print('SP2-0381: DESCRIBE sequence is not available\n'); return; }
    print('ERROR:\nORA-04043: object ' + n + ' does not exist\n\n\n');
  }

  /* ---------- COLUMN / BREAK / COMPUTE / TTITLE ---------- */
  function cmdColumn(a) {
    const tk = args(a);
    const show = (k) => { const c = cols[k]; let s = 'COLUMN   ' + k + ' ' + (c.on === false ? 'OFF' : 'ON') + '\n'; if (c.head !== undefined) s += 'HEADING  \'' + c.head + '\' headsep \'' + S.headsep + '\'\n'; if (c.fmt) s += 'FORMAT   ' + c.fmt + '\n'; if (c.just) s += 'JUSTIFY  ' + { L: 'LEFT', R: 'RIGHT', C: 'CENTER' }[c.just] + '\n'; if (c.noprint) s += 'NOPRINT\n'; if (c.wrap) s += c.wrap.toLowerCase().replace('_', '_') + '\n'; if (c.newv) s += 'NEW_VALUE ' + c.newv + '\n'; if (c.nul !== undefined) s += 'NULL     \'' + c.nul + '\'\n'; return s; };
    if (!tk.length) { const ks = Object.keys(cols); print(ks.length ? ks.map(show).join('\n') : ''); return; }
    const key = tk[0].v.toUpperCase().replace(/\s+/g, ''); let i = 1;
    if (tk.length === 1) { if (cols[key]) print(show(key)); else print('SP2-0046: COLUMN \'' + tk[0].v + '\' not defined\n'); return; }
    const c = cols[key] ? Object.assign({}, cols[key]) : {};
    while (i < tk.length) {
      const o = tk[i++].v.toUpperCase(); const is = (full, min) => o.length >= min && full.startsWith(o);
      if (is('FORMAT', 3)) { const f = tk[i++]; if (!f) { print('SP2-0045: * no column_name specified\n'); return; } if (!/^a\d+$/i.test(f.v) && !isNumModel(f.v) && !/^(dd|mm|yy|mon)/i.test(f.v)) { print('SP2-0246: Illegal FORMAT string "' + f.v + '"\n'); return; } c.fmt = f.v; }
      else if (is('HEADING', 3)) { const h = tk[i++]; c.head = h ? h.v : ''; }
      else if (is('JUSTIFY', 3)) { const j = (tk[i++] || { v: 'L' }).v.toUpperCase()[0]; c.just = j === 'C' ? 'C' : j === 'R' ? 'R' : 'L'; }
      else if (is('NOPRINT', 5)) c.noprint = true;
      else if (is('PRINT', 3)) c.noprint = false;
      else if (is('NULL', 3)) { c.nul = (tk[i++] || { v: '' }).v; }
      else if (is('WRAPPED', 3)) c.wrap = 'WRAPPED';
      else if (is('TRUNCATED', 3)) c.wrap = 'TRUNCATED';
      else if (is('WORD_WRAPPED', 3)) c.wrap = 'WORD_WRAPPED';
      else if (is('NEW_VALUE', 5) || is('OLD_VALUE', 5)) { c.newv = (tk[i++] || { v: '' }).v; }
      else if (is('CLEAR', 3)) { delete cols[key]; return; }
      else if (o === 'ON') c.on = true;
      else if (o === 'OFF') c.on = false;
      else if (is('ALIAS', 3) || is('LIKE', 3) || is('FOLD_AFTER', 6) || is('FOLD_BEFORE', 6) || is('ENTMAP', 3)) i++;
      else if (is('NEWLINE', 4)) { }
      else { print('SP2-0158: unknown COLUMN option "' + tk[i - 1].v + '"\n'); return; }
    }
    cols[key] = c;
  }
  function cmdBreak(a) {
    const tk = args(a);
    if (!tk.length) { if (!breaks.length) { print('SP2-0044: For a list of known columns use COLUMN with no arguments.\nSP2-0045: * no break(s) defined\n'); return; } print(breaks.map(b => 'break on ' + (b.col === 'REPORT' ? 'report' : b.col) + (b.skip ? ' skip ' + (b.skip === 'PAGE' ? 'page' : b.skip) : '') + (b.dup ? ' dup' : ' nodup')).join('\n') + '\n'); return; }
    const out = []; let i = 0;
    while (i < tk.length) {
      if (tk[i].v.toUpperCase() !== 'ON') { print('SP2-0158: unknown BREAK option "' + tk[i].v + '"\n'); return; }
      const col = (tk[i + 1] || { v: '' }).v.toUpperCase(); i += 2; const b = { col, skip: 0, dup: false };
      while (i < tk.length && tk[i].v.toUpperCase() !== 'ON') {
        const o = tk[i++].v.toUpperCase();
        if (o.startsWith('SKI')) { const v = (tk[i++] || { v: '1' }).v.toUpperCase(); b.skip = v === 'PAGE' ? 'PAGE' : +v || 1; }
        else if (o.startsWith('DUP')) b.dup = true; else if (o.startsWith('NODUP')) b.dup = false;
        else if (o === 'PAGE') b.skip = 'PAGE';
      }
      out.push(b);
    }
    breaks = out;
  }
  function cmdCompute(a) {
    const tk = args(a);
    if (!tk.length) { if (!computes.length) { print('SP2-0045: * no computes defined\n'); return; } computes.forEach(c => print('COMPUTE ' + c.fns.map(f => f.toLowerCase()).join(' ') + (c.label !== undefined ? ' LABEL \'' + c.label + '\'' : '') + ' OF ' + c.of.join(' ') + ' ON ' + c.on + '\n')); return; }
    const F = { SUM: 'SUM', AVG: 'AVG', COUNT: 'COUNT', COU: 'COUNT', MAXIMUM: 'MAX', MAX: 'MAX', MINIMUM: 'MIN', MIN: 'MIN', NUMBER: 'NUMBER', NUM: 'NUMBER', STD: 'STD', VARIANCE: 'VARIANCE', VAR: 'VARIANCE' };
    const c = { fns: [], of: [], on: null }; let i = 0, mode = 'fn';
    while (i < tk.length) {
      const v = tk[i++]; const V = v.v.toUpperCase();
      if (V === 'OF' && !v.q) { mode = 'of'; continue; } if (V === 'ON' && !v.q) { mode = 'on'; continue; }
      if (mode === 'fn') { if (V === 'LABEL' || V === 'LAB') { c.label = (tk[i++] || { v: '' }).v; continue; } if (F[V]) c.fns.push(F[V]); else { print('SP2-0158: unknown COMPUTE option "' + v.v + '"\n'); return; } }
      else if (mode === 'of') c.of.push(V);
      else c.on = V;
    }
    if (!c.fns.length || !c.of.length || !c.on) { print('SP2-0045: * no computes defined\n'); return; }
    computes = computes.filter(x => !(x.on === c.on && x.of.join() === c.of.join())); computes.push(c);
  }
  function cmdTitle(cmd, a) {
    const set = (v) => { if (cmd === 'TTITLE') ttitle = v; else btitle = v; };
    const cur = cmd === 'TTITLE' ? ttitle : btitle;
    if (!a) { print(cmd.toLowerCase() + ' ' + (cur && !cur.off ? 'ON and is the following ' + cur.raw.length + ' characters:\n' + cur.raw : 'OFF and has no title') + '\n'); return; }
    if (/^off$/i.test(a)) { if (cur) cur.off = true; return; }
    if (/^on$/i.test(a)) { if (cur) cur.off = false; return; }
    const tk = args(a);
    const newForm = tk.some(x => !x.q && /^(LE|LEFT|CE|CENTER|R|RIGHT|COL|S|SKIP|BOLD|TAB|FORMAT|FOR)$/i.test(x.v));
    if (!newForm) { set({ old: true, text: tk.map(x => x.v).join(' '), raw: a }); return; }
    const lines = [[]]; let pos = 'L', col = 0; let i = 0;
    while (i < tk.length) {
      const x = tk[i++]; const V = x.v.toUpperCase();
      if (!x.q && /^(LE|LEFT)$/.test(V)) { pos = 'L'; col = 0; }
      else if (!x.q && /^(CE|CENTER)$/.test(V)) pos = 'C';
      else if (!x.q && /^(R|RIGHT)$/.test(V)) pos = 'R';
      else if (!x.q && V === 'COL') { pos = 'COL'; col = +((tk[i++] || { v: 0 }).v) - 1; }
      else if (!x.q && /^(S|SKIP)$/.test(V)) { const n = tk[i] && /^\d+$/.test(tk[i].v) ? +tk[i++].v : 1; for (let k = 0; k < n; k++) lines.push([]); pos = 'L'; }
      else if (!x.q && (V === 'BOLD')) { }
      else if (!x.q && (V === 'FORMAT' || V === 'FOR' || V === 'TAB')) i++;
      else lines[lines.length - 1].push({ text: x.v, pos, col });
    }
    set({ old: false, lines, raw: a });
  }

  /* ---------- substitution & bind variables ---------- */
  function cmdDefine(a) {
    if (!a) {
      const all = Object.assign({ _DATE: oraToday() }, defines, { _SQLPLUS_RELEASE: '2103000000', _EDITOR: 'Notepad', _O_VERSION: VERSION, _O_RELEASE: '2103000000' });
      const ks = Object.keys(all).filter(k => k[0] === '_').concat(Object.keys(all).filter(k => k[0] !== '_'));
      print(ks.map(k => 'DEFINE ' + padR(k, 15) + ' = "' + all[k] + '" (CHAR)').join('\n') + '\n'); return;
    }
    const m = /^([\w$#]+)\s*=\s*([\s\S]*)$/.exec(a);
    if (m) { defines[m[1].toUpperCase()] = unq(m[2]); return; }
    const k = a.trim().toUpperCase(); const v = k === '_DATE' ? oraToday() : defines[k];
    if (v === undefined) print('SP2-0135: symbol ' + a.trim().toLowerCase() + ' is UNDEFINED\n'); else print('DEFINE ' + padR(k, 15) + ' = "' + v + '" (CHAR)\n');
  }
  async function cmdAccept(a) {
    const tk = args(a); if (!tk.length) { print('SP2-0003: Ill-formed ACCEPT command starting as \n'); return; }
    const name = tk[0].v; let i = 1, type = 'CHAR', def, prompt = '', hide = false;
    while (i < tk.length) {
      const V = tk[i++].v.toUpperCase();
      if (/^NUM/.test(V)) type = 'NUMBER'; else if (V === 'CHAR') type = 'CHAR'; else if (V === 'DATE') type = 'DATE';
      else if (/^FOR/.test(V)) i++; else if (/^DEF/.test(V)) def = (tk[i++] || { v: '' }).v;
      else if (/^PROMPT$|^PRO/.test(V) && !/^PROMPT\w/.test(V)) prompt = (tk[i++] || { v: '' }).v;
      else if (/^NOPR/.test(V)) prompt = ''; else if (V === 'HIDE') hide = true;
    }
    for (; ;) {
      let v = await readLine(prompt, { hidden: hide }); if (v === null) return;
      if (v === '' && def !== undefined) v = def;
      if (type === 'NUMBER' && v !== '' && isNaN(Number(v))) { print('SP2-0425: "' + v + '" is not a valid NUMBER\n'); continue; }
      defines[name.toUpperCase()] = v; return;
    }
  }
  function cmdVariable(a) {
    if (!db) { print('SP2-0640: Not connected\n'); return; }
    const listOne = (k) => { const b = U.binds[k]; return 'variable   ' + k + '\ndatatype   ' + b.type + (b.size && b.type !== 'NUMBER' ? '(' + b.size + ')' : '') + '\n'; };
    if (!a) { print(Object.keys(U.binds).map(listOne).join('\n')); return; }
    const m = /^([A-Za-z_][\w$#]*)\s*(?:(\w+)\s*(?:\(\s*(\d+)\s*(?:char|byte)?\s*\))?)?\s*$/i.exec(a);
    if (!m) { print('SP2-0553: Illegal variable name "' + a + '".\n'); return; }
    const k = m[1].toUpperCase();
    if (!m[2]) { if (U.binds[k]) print(listOne(k)); else print('SP2-0552: Bind variable "' + k + '" not declared.\n'); return; }
    const T = m[2].toUpperCase();
    const ok = { NUMBER: 1, CHAR: 1, NCHAR: 1, VARCHAR2: 1, NVARCHAR2: 1, CLOB: 1, NCLOB: 1, BINARY_FLOAT: 1, BINARY_DOUBLE: 1, BOOLEAN: 1 };
    if (T === 'REFCURSOR') { print('SP2-0552: REFCURSOR variables are not supported in this practice terminal.\n'); return; }
    if (!ok[T]) { print('Usage: VAR[IABLE] [ <variable> [ NUMBER | CHAR | CHAR (n [CHAR|BYTE]) |\n                    VARCHAR2 (n [CHAR|BYTE]) | NCHAR | NCHAR (n) |\n                    NVARCHAR2 (n) | CLOB | NCLOB | BLOB | BFILE |\n                    REFCURSOR | BINARY_FLOAT | BINARY_DOUBLE | BOOLEAN ] ]\n'); return; }
    U.binds[k] = { type: T, size: m[3] ? +m[3] : (T === 'VARCHAR2' || T === 'CHAR' ? 1 : null), value: null }; saveUser();
  }
  function cmdPrint(a) {
    if (!db) { print('SP2-0640: Not connected\n'); return; }
    const names = a ? a.split(/[\s,]+/).filter(Boolean).map(x => x.replace(/^:/, '').toUpperCase()) : Object.keys(U.binds);
    for (const k of names) {
      const b = U.binds[k]; if (!b) { print('SP2-0552: Bind variable "' + k + '" not declared.\n'); continue; }
      const isNum = b.type === 'NUMBER' || /^BINARY/.test(b.type);
      const set = cols[k] && cols[k].on !== false ? cols[k] : null;
      const w = isNum ? Math.max(S.numwidth, k.length) : Math.max(1, Math.min(S.linesize, b.size || String(b.value || '').length || 1));
      const info = [{ key: k, kind: isNum ? 'num' : 'char', w, model: null, right: isNum, set, hl: [(set && set.head) || k].map(x => x.slice(0, w)), wrap: 'WRAPPED' }];
      print(renderQuery([k], [[b.value]], null, info).join('\n') + '\n\n');
    }
  }

  /* ---------- files: SPOOL / SAVE / GET / START / STORE / EDIT / HOST ---------- */
  function cmdSpool(a) {
    const tk = a.split(/\s+/).filter(Boolean);
    if (!tk.length) { print(spool ? 'currently spooling to ' + spool.name + '\n' : 'not spooling currently\n'); return; }
    if (/^off$/i.test(tk[0]) || /^out$/i.test(tk[0])) { if (!spool) { print('not spooling currently\n'); return; } const sp = spool; spool = null; putFile(sp.name, sp.text); download(sp.name, sp.text); return; }
    if (spool) { putFile(spool.name, spool.text); }
    const name = withExt(tk[0], 'lst'); const app = tk[1] && /^app/i.test(tk[1]);
    spool = { name, text: app ? (getFile(name) || '') : '' };
  }
  function bufferFileText() { return buf.lines.join('\n') + '\n/\n'; }
  function cmdSave(a) {
    const tk = a.split(/\s+/).filter(Boolean);
    if (!tk.length) { print('SP2-0084: SAVE requires a file name\n'); return; }
    if (!buf.lines.length) { print('SP2-0107: Nothing to save.\n'); return; }
    const name = withExt(tk[0], 'sql'); const mode = (tk[1] || '').toUpperCase(); const exists = !!Gs.files[fileKey(name)];
    if (/^REP/.test(mode)) { putFile(name, bufferFileText()); print((exists ? 'Wrote file ' : 'Created file ') + name + '\n'); return; }
    if (/^APP/.test(mode)) { putFile(name, (getFile(name) || '') + bufferFileText()); print('Appended file to ' + name + '\n'); return; }
    if (exists || weekFiles[fileKey(name)]) { print('SP2-0540: File "' + name + '" already exists.\nUse "SAVE filename[.ext] REPLACE".\n'); return; }
    putFile(name, bufferFileText()); print('Created file ' + name + '\n');
  }
  function loadBuffer(text) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n');
    while (lines.length && /^\s*\/\s*$/.test(lines[lines.length - 1])) lines.pop();
    if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/;\s*$/, '');
    buf = { lines, cur: lines.length, plsql: isPlsqlText(lines.join('\n')) };
  }
  function cmdGet(a) {
    const tk = a.split(/\s+/).filter(Boolean); if (!tk.length) { print('SP2-0109: Cannot append to file "afiedt.buf"\n'); return; }
    const name = withExt(tk[0], 'sql'); const text = getFile(name);
    if (text === null) { print('SP2-0160: Unable to open "' + name + '".\n'); return; }
    loadBuffer(text); if (!(tk[1] && /^nol/i.test(tk[1]))) listBuf();
  }
  async function cmdStart(a) {
    const tk = args(a); if (!tk.length) { print('SP2-1506: START, @ or @@ command has no arguments\n'); return; }
    const name = withExt(tk[0].v, 'sql'); const text = getFile(name);
    if (text === null) { print('SP2-0310: unable to open file "' + name + '"\n'); return; }
    if (scriptDepth > 20) { print('SP2-0309: SQL*Plus command procedures may only be nested to a depth of 20.\n'); return; }
    tk.slice(1).forEach((x, i) => { defines[String(i + 1)] = x.v; });
    scriptDepth++;
    try {
      const lines = text.replace(/\r\n?/g, '\n').split('\n'); if (lines.length && lines[lines.length - 1] === '') lines.pop();
      let n = 0;
      for (const line of lines) {
        if (!alive) break;
        if (S.echo) print(promptText() + line + '\n');
        await handleLine(line);
        if (++n % 40 === 0) await new Promise(r => setTimeout(r, 0));
      }
      if (entry) { storeEntry(entry); entry = null; }
    } finally { scriptDepth--; }
  }
  function cmdStore(a) {
    const m = /^set\s+(\S+)(?:\s+(cre\w*|rep\w*|app\w*))?$/i.exec(a); if (!m) { print('SP2-0225: Usage: STORE {SET} filename[.ext] [CRE[ATE]|REP[LACE]|APP[END]]\n'); return; }
    const name = withExt(m[1], 'sql'); const exists = !!Gs.files[fileKey(name)];
    if (exists && !m[2]) { print('SP2-0540: File "' + name + '" already exists.\nUse "STORE SET filename[.ext] REPLACE".\n'); return; }
    const L = ['set autocommit ' + (S.autocommit ? 'IMMEDIATE' : 'OFF'), 'set colsep "' + S.colsep + '"', 'set define ' + (S.defineOn ? '"' + S.defineChar + '"' : 'OFF'), 'set echo ' + (S.echo ? 'ON' : 'OFF'), 'set feedback ' + (S.feedback ? S.feedback : 'OFF'), 'set heading ' + (S.heading ? 'ON' : 'OFF'), 'set linesize ' + S.linesize, 'set newpage ' + S.newpage, 'set null "' + S.null + '"', 'set numwidth ' + S.numwidth, 'set pagesize ' + S.pagesize, 'set serveroutput ' + (S.serveroutput ? 'ON SIZE ' + S.serverSize + ' FORMAT ' + S.serverFormat : 'OFF'), 'set sqlprompt "' + S.sqlprompt + '"', 'set timing ' + (S.timing ? 'ON' : 'OFF'), 'set verify ' + (S.verify ? 'ON' : 'OFF'), 'set wrap ' + (S.wrap ? 'ON' : 'OFF')];
    putFile(name, (m[2] && /^app/i.test(m[2]) ? (getFile(name) || '') : '') + L.join('\n') + '\n'); print((exists ? 'Wrote file ' : 'Created file ') + name + '\n');
  }
  async function cmdEdit(a) {
    const tk = a.split(/\s+/).filter(Boolean);
    if (tk.length) { const name = withExt(tk[0], 'sql'); const cur = getFile(name); const t = await notepad(name, cur === null ? '' : cur); if (t !== null) putFile(name, t); return; }
    if (!buf.lines.length) { print('SP2-0107: Nothing to save.\n'); return; }
    const t = await notepad('afiedt.buf', bufferFileText());
    print('Wrote file afiedt.buf\n\n');
    if (t !== null) { putFile('afiedt.buf', t); loadBuffer(t); }
    listBuf();
  }
  function cmdHost(a) {
    const t = a.trim(); const w = (t.split(/\s+/)[0] || '').toLowerCase(); const arg = t.slice(w.length).trim();
    if (!t) { print('Shell access is not available in the browser – try HOST DIR, HOST TYPE file, HOST DEL file or HOST CLS\n'); return; }
    if (w === 'cls' || w === 'clear') { ui.out.textContent = ''; return; }
    if (w === 'dir' || w === 'ls') {
      const fs = allFiles(); const d = new Date(); const ds = (x) => { const z = new Date(x || d); return p2(z.getDate()) + '-' + p2(z.getMonth() + 1) + '-' + z.getFullYear() + '  ' + p2(z.getHours()) + ':' + p2(z.getMinutes()); };
      let s = ' Volume in drive C has no label.\n Volume Serial Number is 5A3C-1F2B\n\n Directory of C:\\sqlplus\n\n'; let tot = 0;
      fs.forEach(f => { const n = f.text.length; tot += n; s += ds(f.t) + ' ' + padL(n.toLocaleString('en-US'), 17) + ' ' + f.name + '\n'; });
      s += padL(fs.length, 16) + ' File(s) ' + padL(tot.toLocaleString('en-US'), 14) + ' bytes\n'; print(s); return;
    }
    if (w === 'type' || w === 'cat' || w === 'more') { const x = getFile(arg); print(x === null ? 'The system cannot find the file specified.\n' : x.replace(/\s*$/, '\n')); return; }
    if (w === 'del' || w === 'rm' || w === 'erase') { const k = fileKey(arg); if (Gs.files[k]) { delete Gs.files[k]; saveGlobal(); } else print('Could Not Find C:\\sqlplus\\' + arg + '\n'); return; }
    if (w === 'echo') { print(arg + '\n'); return; }
    if (w === 'date' || w === 'time') { print('The current ' + w + ' is: ' + (w === 'date' ? new Date().toLocaleDateString() : new Date().toLocaleTimeString()) + '\n'); return; }
    print('\'' + w + '\' is not recognized as an internal or external command,\noperable program or batch file.\n');
  }
  function cmdTiming(a) {
    const tk = a.split(/\s+/).filter(Boolean); const V = (tk[0] || '').toUpperCase();
    if (V.startsWith('STA')) { timer = { name: tk[1] || '', t: performance.now() }; return; }
    if (!timer) { print('SP2-0325: no timing elements to ' + (V.startsWith('STO') ? 'stop' : 'show') + '\n'); return; }
    print('timing for: ' + timer.name + '\n' + elapsed(performance.now() - timer.t) + '\n'); if (V.startsWith('STO')) timer = null;
  }
  function cmdHistory(a) {
    if (!S.history) { print('SP2-1650: History is off, use "SET HIST[ORY] ON" to enable History.\n'); return; }
    const H = Gs.hist; const tk = a.split(/\s+/).filter(Boolean);
    const list = (from, to) => { let s = ''; for (let i = from; i <= to; i++) s += H[i - 1].split('\n').map((l, k) => (k ? '     ' : padL(i, 3) + '  ') + l).join('\n') + '\n'; print(s); };
    if (!tk.length || /^l/i.test(tk[0])) { if (!H.length) { print('SP2-1651: History list is empty.\n'); return; } list(1, H.length); return; }
    if (/^clear$/i.test(tk[0])) { Gs.hist = []; saveGlobal(); return; }
    const n = +tk[0]; if (!(n >= 1 && n <= H.length)) { print('SP2-1652: Invalid history index\n'); return; }
    const op = (tk[1] || 'LIST').toUpperCase(); const txt = H[n - 1];
    if (op.startsWith('R')) { queue.unshift(...txt.split('\n')); return; }
    if (op.startsWith('ED')) { loadBuffer(txt); return cmdEdit(''); }
    if (op.startsWith('DEL')) { H.splice(n - 1, 1); saveGlobal(); return; }
    list(n, n);
  }
  async function cmdConnect(a) {
    let s = a.trim();
    if (!s) { s = (await readLine('Enter user-name: ')) || ''; }
    const m = /^([^\/@\s]*)(?:\/([^@\s]*))?(?:@(\S+))?(?:\s+as\s+(sysdba|sysoper))?$/i.exec(s.trim());
    if (!m) { print('SP2-0306: Invalid option.\nUsage: CONN[ECT] [{logon|/|proxy} [AS {SYSDBA|SYSOPER|SYSASM|SYSBACKUP|SYSDG|SYSKM|SYSRAC}] [edition=value]]\n'); return; }
    let u = m[1], p = m[2];
    if (!u && m[4]) u = 'SYS';
    if (!u) { print('SP2-0306: Invalid option.\n'); return; }
    if (p === undefined && !m[4]) { p = await readLine('Enter password: ', { hidden: true }); if (p === null) return; }
    if (!/^[A-Za-z][\w$#]*$/.test(u)) { if (db) closeSession(true, false); print('ERROR:\nORA-01017: invalid username/password; logon denied\n\n\nWarning: You are no longer connected to ORACLE.\n'); return; }
    if (!p && !m[4]) { if (db) closeSession(true, false); print('ERROR:\nORA-01005: null password given; logon denied\n\n\nWarning: You are no longer connected to ORACLE.\n'); return; }
    connect(u); print('Connected.\n'); await runLoginSql();
  }
  async function cmdExit(a) {
    const rb = /^rollback$/i.test(a.trim());
    if (db) { if (rb) { try { db.db.run('ROLLBACK'); } catch (e) { } } closeSession(!rb, false); print('Disconnected from ' + VERSION + '\n'); }
    alive = false; started = false;
    setTimeout(() => leave(), 900);
  }

  /* ---------- HELP ---------- */
  const HELP = {
    '@': ['Runs the SQL*Plus statements in the specified script.', '@ {url|file_name[.ext]} [arg ...]'],
    '/': ['Executes the most recently executed SQL command or PL/SQL block\nwhich is stored in the SQL buffer.', '/'],
    ACCEPT: ['Reads a line of input and stores it in a given substitution variable.', 'ACC[EPT] variable [NUM[BER] | CHAR | DATE]\n[DEF[AULT] default] [PROMPT text|NOPR[OMPT]] [HIDE]'],
    APPEND: ['Adds text to the end of the current line in the SQL buffer.', 'A[PPEND] text'],
    BREAK: ['Specifies where changes occur in a report and the formatting\naction to perform, such as suppressing display of duplicate values\nand printing blank lines.', 'BRE[AK] [ON report_element [action [action]]] ...\nreport_element:  {column|expr|ROW|REPORT}\naction:  [SKI[P] n|[SKI[P]] PAGE] [NODUP[LICATES]|DUP[LICATES]]'],
    BTITLE: ['Places and formats a title at the bottom of each report page.', 'BTI[TLE] [printspec [text|variable] ...] | [ON | OFF]'],
    CHANGE: ['Changes the first occurrence of the specified text on the current\nline of the SQL buffer.', 'C[HANGE] sepchar old [sepchar [new [sepchar]]]'],
    CLEAR: ['Resets or erases the current value or setting for the specified option.', 'CL[EAR] option ...\nwhere option represents one of the following clauses:\n    BRE[AKS]\n    BUFF[ER]\n    COL[UMNS]\n    COMP[UTES]\n    SCR[EEN]\n    SQL\n    TIMI[NG]'],
    COLUMN: ['Specifies display attributes for a given column.', 'COL[UMN] [{column | expr} [option ...]]\nwhere option represents one of the following clauses:\n    FOR[MAT] format\n    HEA[DING] text\n    JUS[TIFY] {L[EFT] | C[ENTER] | R[IGHT]}\n    NEW_V[ALUE] variable\n    NOPRI[NT] | PRI[NT]\n    NUL[L] text\n    WRA[PPED] | WOR[D_WRAPPED] | TRU[NCATED]\n    CLE[AR]  ON | OFF'],
    COMPUTE: ['Calculates and prints summary lines, using various standard\ncomputations, on subsets of selected rows.', 'COMP[UTE] [function [LAB[EL] text] ...\n  OF {expr|column|alias} ...\n  ON {expr|column|alias|REPORT|ROW} ...]'],
    CONNECT: ['Connects a given username to the Oracle Database.', 'CONN[ECT] [{logon|/} [AS {SYSOPER|SYSDBA}]]\nwhere logon has the syntax:\n    username[/password][@connect_identifier]'],
    DEFINE: ['Specifies a user or predefined variable and assigns a CHAR value to\nit, or lists the value and variable type of a single variable or all\nvariables.', 'DEF[INE] [variable] | [variable = text]'],
    DEL: ['Deletes one or more lines of the SQL buffer.', 'DEL [n | n m | n * | n LAST | * | * n | * LAST | LAST]'],
    DESCRIBE: ['Lists the column definitions for a table, view, or synonym,\nor the specifications for a function or procedure.', 'DESC[RIBE] {[schema.]object[@connect_identifier]}'],
    DISCONNECT: ['Commits pending changes to the database and logs the current\nuser out of Oracle, but does not exit SQL*Plus.', 'DISC[ONNECT]'],
    EDIT: ['Invokes an operating system text editor on the contents of the\nspecified file or on the contents of the SQL buffer.', 'ED[IT] [file_name[.ext]]'],
    EXECUTE: ['Executes a single PL/SQL statement.', 'EXEC[UTE] statement'],
    EXIT: ['Commits or rolls back all pending changes, logs out of Oracle,\nterminates SQL*Plus and returns control to the operating system.', '{EXIT|QUIT} [SUCCESS|FAILURE|WARNING|n|variable|:BindVariable]\n  [COMMIT|ROLLBACK]'],
    GET: ['Loads an operating system file into the SQL buffer.', 'GET [FILE] file_name[.ext] [LIST | NOLIST]'],
    HELP: ['Accesses this command line help system. Enter HELP INDEX or ? INDEX\nfor a list of topics.', 'HELP|? [topic]'],
    HISTORY: ['Stores, lists, executes, edits of the commands\nentered during the current SQL*Plus session.', 'HIST[ORY] [N {RUN | EDIT | DEL[ETE]}] | [CLEAR]\n\nN is the entry number listed in the history list.\nUse this number to recall, edit or delete the command.'],
    HOST: ['Executes an operating system command without leaving SQL*Plus.', 'HO[ST] [command]   (here: DIR, TYPE file, DEL file, CLS)'],
    INPUT: ['Adds one or more new lines of text after the current line in the\nSQL buffer.', 'I[NPUT] [text]'],
    LIST: ['Lists one or more lines of the most recently executed SQL command\nor PL/SQL block which is stored in the SQL buffer. Enter LIST with\nno clauses to list all lines.', 'L[IST] [n | n m | n  * | n LAST | * | * n | * LAST | LAST]'],
    PASSWORD: ['Allows a password to be changed without echoing the password on\nan input device.', 'PASSW[ORD] [username]'],
    PAUSE: ['Displays the specified text then waits for the user to press RETURN.', 'PAU[SE] [text]'],
    PRINT: ['Displays the current values of bind variables.', 'PRI[NT] [variable ...]'],
    PROMPT: ['Sends the specified message or a blank line to the user\'s screen.', 'PRO[MPT] [text]'],
    REMARK: ['Begins a comment in a script. SQL*Plus does not interpret the comment\nas a command.', 'REM[ARK]'],
    RUN: ['Lists and executes the most recently executed SQL command or\nPL/SQL block which is stored in the SQL buffer.', 'R[UN]'],
    SAVE: ['Saves the contents of the SQL buffer in a script.', 'SAV[E] [FILE] file_name[.ext] [CRE[ATE] | REP[LACE] | APP[END]]'],
    SET: ['Sets a system variable to alter the SQL*Plus environment settings\nfor your current session. For example, to:\n    -   set the display width for data\n    -   customize HTML formatting\n    -   enable or disable printing of column headings\n    -   set the number of lines per page', 'SET system_variable value\nwhere system_variable and value represent one of the following clauses:\n  AUTO[COMMIT] {OFF|ON|IMM[EDIATE]|n}  COLSEP {_|text}\n  CON[CAT] {.|c|ON|OFF}                 DEF[INE] {&|c|ON|OFF}\n  ECHO {OFF|ON}                         ESC[APE] {\\|c|OFF|ON}\n  FEED[BACK] {6|n|ON|OFF}               HEA[DING] {OFF|ON}\n  HEADS[EP] {||c|OFF|ON}                HIST[ORY] {OFF|ON|n}\n  LIN[ESIZE] {80|n}                     NEWP[AGE] {1|n|NONE}\n  NULL text                             NUMF[ORMAT] format\n  NUM[WIDTH] {10|n}                     PAGES[IZE] {14|n}\n  RECSEP {WR[APPED]|EA[CH]|OFF}         SERVEROUT[PUT] {ON|OFF} [SIZE {n|UNL[IMITED]}]\n                                          [FOR[MAT] {WRA[PPED]|WOR[D_WRAPPED]|TRU[NCATED]}]\n  SQLBL[ANKLINES] {OFF|ON}              SQLP[ROMPT] {SQL>|text}\n  TERM[OUT] {OFF|ON}                    TIMI[NG] {OFF|ON}\n  UND[ERLINE] {-|c|ON|OFF}              VER[IFY] {OFF|ON}\n  WRA[P] {OFF|ON}'],
    SHOW: ['Shows the value of a SQL*Plus system variable, or the current\nSQL*Plus environment.', 'SHO[W] option\nwhere option represents one of the following terms or clauses:\n    system_variable\n    ALL\n    ERR[ORS] [{FUNCTION | PROCEDURE | TRIGGER} [schema.]name]\n    REL[EASE]\n    SPOO[L]\n    USER\n    BTI[TLE]  TTI[TLE]'],
    SPOOL: ['Stores query results in a file, or optionally sends the file to a printer.\nIn this browser version SPOOL OFF downloads the file.', 'SPO[OL] [file_name[.ext] [CRE[ATE] | REP[LACE] | APP[END]] | OFF | OUT]'],
    START: ['Runs the SQL*Plus statements in the specified script.', 'STA[RT] {url|file_name[.ext]} [arg ...]'],
    STORE: ['Saves attributes of the current SQL*Plus environment in a script.', 'STORE {SET} file_name[.ext] [CRE[ATE] | REP[LACE] | APP[END]]'],
    TIMING: ['Records timing data for an elapsed period of time, lists the current\ntimer\'s title and timing data, or lists the number of active timers.', 'TIMI[NG] [START text|SHOW|STOP]'],
    TTITLE: ['Places and formats a title at the top of each report page.', 'TTI[TLE] [printspec [text|variable] ...] [ON | OFF]'],
    UNDEFINE: ['Deletes one or more substitution variables that you defined either\nexplicitly (with the DEFINE command), or implicitly (with a START\ncommand argument).', 'UNDEF[INE] variable ...'],
    VARIABLE: ['Declares a bind variable that can be referenced in PL/SQL, or\nlists the current display characteristics for a single variable\nor all variables.', 'VAR[IABLE] [variable [type]]\nwhere type represents one of the following:\n    NUMBER         CHAR          CHAR (n [CHAR|BYTE])\n    NCHAR          NCHAR (n)     VARCHAR2 (n [CHAR|BYTE])\n    NVARCHAR2 (n)  CLOB          NCLOB\n    BINARY_FLOAT   BINARY_DOUBLE BOOLEAN'],
    WHENEVER: ['Performs the specified action if a SQL statement or PL/SQL block\ngenerates an error (accepted, but has no effect here).', 'WHENEVER SQLERROR {EXIT|CONTINUE} [COMMIT|ROLLBACK|NONE]']
  };
  function cmdHelp(a) {
    const t = a.trim().toUpperCase();
    if (!t) { print('\n HELP\n ----\n\n ' + HELP.HELP[0].replace(/\n/g, '\n ') + '\n\n ' + HELP.HELP[1] + '\n\n'); return; }
    if (t === 'INDEX' || t === 'TOPICS') {
      const ks = Object.keys(HELP).concat(['QUIT', 'SHUTDOWN', 'STARTUP', 'XQUERY']).filter((v, i, s) => s.indexOf(v) === i).sort((x, y) => (/^\w/.test(x) ? 1 : 0) - (/^\w/.test(y) ? 1 : 0) || x.localeCompare(y));
      const rows = Math.ceil(ks.length / 4); let s = '\nEnter Help [topic] for help.\n\n';
      for (let r = 0; r < rows; r++) { let line = ''; for (let c = 0; c < 4; c++) { const k = ks[c * rows + r]; if (k) line += padR(' ' + k, 20); } s += line.replace(/\s+$/, '') + '\n'; }
      print(s + '\n'); return;
    }
    const key = Object.keys(HELP).find(k => k === t) || Object.keys(HELP).find(k => findCmd(t) === k) || (t === 'QUIT' ? 'EXIT' : null);
    if (!key) { print('\nSP2-0171: HELP system not available or topic "' + a.trim() + '" not found.\n\n'); return; }
    const [d, syn] = HELP[key];
    print('\n ' + key + '\n ' + '-'.repeat(key.length) + '\n\n ' + d.replace(/\n/g, '\n ') + '\n\n ' + syn.replace(/\n/g, '\n ') + '\n\n');
  }

  /* ============================================================ session lifecycle */
  async function runLoginSql() { const t = getFile('login.sql'); if (t !== null) { const echo = S.echo; S.echo = false; await cmdStart('login'); S.echo = echo; } }
  async function login() {
    let tries = 0;
    while (tries < 3 && alive) {
      let s = await readLine('Enter user-name: ');
      if (s === null) continue; s = s.trim(); if (!s) continue;
      const m = /^([^\/@\s]*)(?:\/([^@\s]*))?(?:@(\S+))?(?:\s+as\s+(sysdba|sysoper))?$/i.exec(s);
      let u = m ? m[1] : '', p = m ? m[2] : undefined;
      if (m && !u && m[4]) u = 'SYS';
      if (p === undefined && !(m && m[4])) { p = await readLine('Enter password: ', { hidden: true }); if (p === null) p = ''; }
      tries++;
      if (!m || !/^[A-Za-z][\w$#]*$/.test(u)) { print('ERROR:\nORA-01017: invalid username/password; logon denied\n\n\n'); continue; }
      if (!p && !(m && m[4])) { print('ERROR:\nORA-01005: null password given; logon denied\n\n\n'); continue; }
      const last = connect(u);
      print((last ? 'Last Successful login time: ' + loginDate(new Date(last)) + '\n' : '') + '\nConnected to:\n' + VERSION + '\n\n');
      await runLoginSql();
      return true;
    }
    if (alive) { print('SP2-0157: unable to CONNECT to ORACLE after 3 attempts, exiting SQL*Plus\n'); alive = false; started = false; setTimeout(() => leave(), 1500); }
    return false;
  }
  async function main() {
    alive = true;
    S = Object.assign({}, DEFAULTS); cols = {}; breaks = []; computes = []; ttitle = null; btitle = null; defines = {}; buf = { lines: [], cur: 0, plsql: false }; entry = null; cont = null; lastErr = null; spool = null;
    print('\nSQL*Plus: Release 21.0.0.0.0 - Production on ' + bannerDate(new Date()) + '\nVersion 21.3.0.0.0\n\nCopyright (c) 1982, 2021, Oracle.  All rights reserved.\n\n');
    if (!(await login())) return;
    while (alive) {
      const line = await readLine(promptText());
      if (!alive) break;
      try { await handleLine(line); }
      catch (e) { print('SP2-0000: internal error: ' + (e && e.message || e) + '\n'); console.error(e); entry = null; }
    }
  }
  function leave() { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); location.hash = lastHash && !/sqlplus/.test(lastHash) ? lastHash : '#/'; }
  window.addEventListener('hashchange', (e) => { try { const o = new URL(e.oldURL).hash; if (!/sqlplus/.test(o)) lastHash = o || '#/'; } catch (x) { } });
  window.addEventListener('beforeunload', () => { if (spool) putFile(spool.name, spool.text); if (seqDirty) saveUser(); });

  const SqlPlus = {
    page(opts) {
      if (!ui) buildUI();
      weekFiles = {};
      ((opts && opts.Weeks) || []).forEach(w => { if (w.dataset && w.dataset.sql) { const name = 'wk' + p2(w.num) + '.sql'; weekFiles[name] = { name, text: '-- Week ' + w.num + ' dataset: ' + w.dataset.name + '\n' + w.dataset.sql.trim() + '\n', t: Date.now() }; } });
      if (!started) { started = true; ui.out.textContent = ''; queue.length = 0; pending = null; if (db) closeSession(false, false); main(); }
      setTimeout(() => { ui.ta.focus({ preventScroll: true }); drawInput(); scrollEnd(); }, 30);
      return ui.root;
    },
    _debug: () => ({ S, buf, user, U, db, sess, defines, cols })
  };
  G.SqlPlus = SqlPlus;
})(window);
