/* ============================================================
   SQL engine: SQLite (sql.js) with an Oracle-flavoured shim
   Works in the browser (window) and in node (for self-tests)
   ============================================================ */
(function (G) {
  'use strict';
  const Engine = {};
  let SQL = null;

  /* ---------- boot ---------- */
  Engine.init = async function (initSqlJs, wasmBinary) {
    if (SQL) return SQL;
    SQL = await initSqlJs(wasmBinary ? { wasmBinary } : {});
    return SQL;
  };

  /* ---------- small lexer helpers (strings / comments aware) ---------- */
  // Walk the SQL and call fn(char, index, inString) ; returns nothing. Used by the helpers below.
  function scan(sql, cb) {
    let inS = false;
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i];
      if (inS) { if (c === "'") { if (sql[i + 1] === "'") { cb(c, i, true); i++; cb("'", i, true); continue; } inS = false; } cb(c, i, true); continue; }
      if (c === "'") { inS = true; cb(c, i, true); continue; }
      cb(c, i, false);
    }
  }

  // Replace a regex only outside string literals
  function replaceOutside(sql, re, repl) {
    const parts = []; let last = 0, inS = false, start = 0;
    // split into code / string segments
    const segs = [];
    let cur = '', curS = false;
    scan(sql, (c, i, s) => {
      if (s !== curS) { if (cur) segs.push([cur, curS]); cur = ''; curS = s; }
      cur += c;
    });
    if (cur) segs.push([cur, curS]);
    return segs.map(([t, s]) => s ? t : t.replace(re, repl)).join('');
  }

  Engine.stripComments = function (sql) {
    // remove -- line comments and /* */ blocks outside strings
    let out = '', inS = false;
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i], n = sql[i + 1];
      if (inS) { out += c; if (c === "'") { if (n === "'") { out += n; i++; } else inS = false; } continue; }
      if (c === "'") { inS = true; out += c; continue; }
      if (c === '-' && n === '-') { while (i < sql.length && sql[i] !== '\n') i++; out += '\n'; continue; }
      if (c === '/' && n === '*') { i += 2; while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i++; continue; }
      out += c;
    }
    return out;
  };

  Engine.splitStatements = function (sql) {
    const out = []; let cur = '', inS = false;
    sql = Engine.stripComments(sql);
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i];
      if (inS) { cur += c; if (c === "'") { if (sql[i + 1] === "'") { cur += "'"; i++; } else inS = false; } continue; }
      if (c === "'") { inS = true; cur += c; continue; }
      if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };

  /* ---------- find matching paren ---------- */
  function matchParen(s, openIdx) {
    let d = 0, inS = false;
    for (let i = openIdx; i < s.length; i++) {
      const c = s[i];
      if (inS) { if (c === "'") { if (s[i + 1] === "'") i++; else inS = false; } continue; }
      if (c === "'") { inS = true; continue; }
      if (c === '(') d++;
      else if (c === ')') { d--; if (d === 0) return i; }
    }
    return -1;
  }

  // add " AS _c" to the first select-list expression of a (simple) subquery so we can reference it
  function aliasFirstColumn(sub) {
    // find top-level FROM (depth 0, outside strings)
    let d = 0, inS = false;
    const up = sub;
    for (let i = 0; i < up.length; i++) {
      const c = up[i];
      if (inS) { if (c === "'") { if (up[i + 1] === "'") i++; else inS = false; } continue; }
      if (c === "'") { inS = true; continue; }
      if (c === '(') d++; else if (c === ')') d--;
      else if (d === 0 && /\bfrom\b/i.test(up.slice(i, i + 5)) && (i === 0 || /\s/.test(up[i - 1])) && /\s/.test(up[i + 4] || ' ')) {
        return up.slice(0, i).replace(/\s+$/, '') + ' AS _c ' + up.slice(i);
      }
    }
    return sub; // no FROM (e.g. SELECT 1)
  }

  // x op ANY|SOME|ALL (subquery)  ->  EXISTS / NOT EXISTS over a derived table
  function rewriteAnyAll(sql) {
    const re = /(<>|!=|<=|>=|=|<|>)\s*(ANY|SOME|ALL)\s*\(/i;
    for (let guard = 0; guard < 20; guard++) {
      const m = re.exec(sql);
      if (!m) break;
      const before = sql.slice(0, m.index);
      if ((before.match(/'/g) || []).length % 2 === 1) break;       // inside a string literal
      // walk backwards to find the left-hand expression
      let j = m.index; while (j > 0 && /\s/.test(sql[j - 1])) j--;
      let end = j, start = j;
      if (sql[j - 1] === ')') {                                      // function call / parenthesised expr, e.g. COUNT(*)
        let d = 0, k = j - 1;
        for (; k >= 0; k--) { if (sql[k] === ')') d++; else if (sql[k] === '(') { d--; if (d === 0) break; } }
        start = k; while (start > 0 && /[\w$#.]/.test(sql[start - 1])) start--;
      } else { while (start > 0 && /[\w$#.]/.test(sql[start - 1])) start--; }
      const lhs = sql.slice(start, end);
      const open = m.index + m[0].length - 1;
      const close = matchParen(sql, open);
      if (close < 0 || !lhs) break;
      let inner = aliasFirstColumn(sql.slice(open + 1, close));
      const op = m[1], kind = m[2].toUpperCase();
      const ordering = ['>', '>=', '<', '<='].includes(op), gt = op[0] === '>';
      let rep;
      if (ordering) {      // compare with MAX / MIN of the subquery (also legal when lhs is an aggregate)
        const agg = (kind === 'ALL') === gt ? 'MAX' : 'MIN';
        rep = `(${lhs} ${op} (SELECT ${agg}(_c) FROM (${inner}))` + (kind === 'ALL' ? ` OR NOT EXISTS (SELECT 1 FROM (${inner})))` : ')');
      } else if (op === '=' && kind !== 'ALL') rep = `(${lhs} IN (SELECT _c FROM (${inner})))`;
      else if ((op === '<>' || op === '!=') && kind === 'ALL') rep = `(${lhs} NOT IN (SELECT _c FROM (${inner})))`;
      else rep = kind === 'ALL'
        ? `NOT EXISTS (SELECT 1 FROM (${inner}) AS _q WHERE NOT (${lhs} ${op} _q._c))`
        : `EXISTS (SELECT 1 FROM (${inner}) AS _q WHERE ${lhs} ${op} _q._c)`;
      sql = sql.slice(0, start) + rep + sql.slice(close + 1);
    }
    return sql;
  }

  function splitTopCommas(str) {
    const out = []; let d = 0, cur = '', inS = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (inS) { cur += c; if (c === "'") inS = false; continue; }
      if (c === "'") { inS = true; cur += c; continue; }
      if (c === '(') d++; if (c === ')') d--;
      if (c === ',' && d === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur); return out;
  }
  // (select ..) union (select ..)  ->  select .. union select ..   (SQLite rejects bracketed operands)
  function unwrapSetOperands(s) {
    if (!/^\s*\(/.test(s)) return s;
    const parts = []; const ops = [];
    let i = 0; const t = s.trim();
    while (i < t.length) {
      while (/\s/.test(t[i] || '')) i++;
      if (t[i] !== '(') return s;
      const close = matchParen(t, i);
      if (close < 0) return s;
      parts.push(t.slice(i + 1, close));
      i = close + 1;
      while (/\s/.test(t[i] || '')) i++;
      if (i >= t.length) break;
      const m = /^(union\s+all|union|intersect|except)\b/i.exec(t.slice(i));
      if (!m) return s;
      ops.push(m[1].toUpperCase()); i += m[0].length;
    }
    if (parts.length < 2) return s;
    return parts.map((p, k) => p + (ops[k] ? ' ' + ops[k] + ' ' : '')).join('');
  }

  /* ---------- Oracle date literals ---------- */
  const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  function fullYear(y) { y = String(y); if (y.length === 4) return y; const n = +y; return String(n < 50 ? 2000 + n : 1900 + n); }
  // '01-DEC-95' / '1-dec-1995' -> '1995-12-01'   (only unambiguous DD-MON-YY forms)
  function isoFromOracle(txt) {
    const m = /^\s*(\d{1,2})[-\/ ]([A-Za-z]{3})[A-Za-z]*[-\/ ](\d{2}|\d{4})\s*$/.exec(txt);
    if (m && MON[m[2].toUpperCase()]) return fullYear(m[3]) + '-' + pad2(MON[m[2].toUpperCase()]) + '-' + pad2(+m[1]);
    return null;
  }
  Engine.isoFromOracle = isoFromOracle;
  function convertDateLiterals(sql) {
    sql = sql.replace(/DATE\s+('\d{4}-\d{2}-\d{2}')/gi, '$1');
    return sql.replace(/'([^']*)'/g, (m, inner) => { const iso = isoFromOracle(inner); return iso ? "'" + iso + "'" : m; });
  }

  /* ---------- Oracle -> SQLite ---------- */
  const UNSUPPORTED = [
    [/^\s*alter\s+table\s+\S+\s+modify\b/i, "ALTER TABLE ... MODIFY is Oracle-only and can't run in this browser sandbox (SQLite). Study the model answer instead."],
    [/^\s*alter\s+table\s+\S+\s+drop\s+constraint\b/i, "ALTER TABLE ... DROP CONSTRAINT can't run in this browser sandbox (SQLite). Study the model answer instead."],
    [/^\s*alter\s+table\s+\S+\s+add\s+constraint\b/i, "ALTER TABLE ... ADD CONSTRAINT can't run in this browser sandbox (SQLite). Study the model answer instead."],
    [/^\s*alter\s+table\s+\S+\s+drop\s+primary\s+key\b/i, "ALTER TABLE ... DROP PRIMARY KEY can't run in this browser sandbox (SQLite). Study the model answer instead."],
    [/^\s*alter\s+table\s+\S+\s+add\s+(primary\s+key|foreign\s+key|unique|check)\b/i, "Adding a constraint with ALTER TABLE can't run in this browser sandbox (SQLite). Study the model answer instead."],
  ];

  Engine.toSqlite = function (stmt) {
    let s = stmt.trim();
    for (const [re, msg] of UNSUPPORTED) if (re.test(s)) { const e = new Error(msg); e.unsupported = true; throw e; }
    s = convertDateLiterals(s);
    // ALTER TABLE t ADD (col def, col def)  ->  one ADD COLUMN per column
    let m0 = /^\s*alter\s+table\s+(\S+)\s+add\s*\(([\s\S]+)\)\s*$/i.exec(s);
    if (m0) {
      const defs = splitTopCommas(m0[2]);
      const stmts = defs.map(d => `ALTER TABLE ${m0[1]} ADD COLUMN ${d.trim()}`);
      return { pre: stmts.slice(0, -1), sql: stmts[stmts.length - 1] };
    }
    // DESC / DESCRIBE table
    let m = /^\s*(desc|describe)\s+([A-Za-z_][\w$#]*)\s*$/i.exec(s);
    if (m) return { sql: `SELECT name AS "Name", CASE WHEN "notnull"=1 OR pk>0 THEN 'NOT NULL' ELSE '' END AS "Null?", type AS "Type" FROM pragma_table_info('${m[2]}')` };
    // TRUNCATE
    m = /^\s*truncate\s+table\s+(\S+)\s*$/i.exec(s);
    if (m) return { sql: `DELETE FROM ${m[1]}` };
    // DROP TABLE ... CASCADE CONSTRAINTS
    s = s.replace(/\s+cascade\s+constraints\s*$/i, '');
    // CREATE [OR REPLACE] VIEW v [(cols)] AS select [WITH CHECK OPTION | WITH READ ONLY]
    m = /^\s*create\s+(or\s+replace\s+)?(?:force\s+)?view\s+([A-Za-z_][\w$#]*)\s*(\([^)]*\))?\s*as\s+([\s\S]+?)(\s+with\s+(check\s+option|read\s+only)(?:\s+constraint\s+\w+)?)?\s*$/i.exec(s);
    if (m) {
      const q = Engine.toSqlite(m[4]).sql;
      const view = { name: m[2].toLowerCase(), ro: !!(m[6] && /read/i.test(m[6])), wco: !!(m[6] && /check/i.test(m[6])) };
      return { pre: m[1] ? `DROP VIEW IF EXISTS ${m[2]}` : undefined, sql: `CREATE VIEW ${m[2]} ${m[3] || ''} AS ${q}`, view };
    }
    // MINUS -> EXCEPT
    s = replaceOutside(s, /\bminus\b/gi, 'EXCEPT');
    s = unwrapSetOperands(s);
    // SYSDATE
    s = replaceOutside(s, /\bsysdate\b/gi, "date('now')");
    // FETCH FIRST n ROWS ONLY
    s = replaceOutside(s, /\bfetch\s+first\s+(\d+)\s+rows?\s+only\b/gi, 'LIMIT $1');
    // Oracle nested aggregate:  SELECT MAX(AVG(x)) FROM t [WHERE ..] GROUP BY g
    const na = /^\s*select\s+(max|min|sum|avg|count)\s*\(\s*(avg|sum|max|min|count)\s*\(([^()]*)\)\s*\)\s*(?:as\s+\w+\s+)?from\s+([\w$#]+)\s*((?:where\s+[\s\S]+?)?)\s*group\s+by\s+([\s\S]+?)\s*$/i.exec(s);
    if (na) s = `SELECT ${na[1]}(_v) FROM (SELECT ${na[2]}(${na[3]}) AS _v FROM ${na[4]} ${na[5]} GROUP BY ${na[6]})`;
    // ANY / ALL / SOME
    s = rewriteAnyAll(s);
    return { sql: s };
  };

  /* ---------- database wrapper ---------- */
  function registerFns(db) {
    const f = (n, fn) => { try { db.create_function(n, fn); } catch (e) { } };
    f('NVL', (a, b) => (a === null || a === undefined ? b : a));
    f('NVL2', (a, b, c) => (a === null || a === undefined ? c : b));
    f('MOD', (a, b) => (a === null || b === null ? null : (b === 0 ? a : a % b)));
    f('POWER', (a, b) => Math.pow(a, b));
    f('SQRT', a => Math.sqrt(a));
    f('CEIL', a => Math.ceil(a));
    f('FLOOR', a => Math.floor(a));
    f('SIGN', a => Math.sign(a));
    f('TRUNC', (a, d) => { const k = Math.pow(10, d || 0); return Math.trunc(a * k) / k; });
    f('LPAD', (s, n, p) => { s = String(s); p = p === undefined ? ' ' : String(p); while (s.length < n) s = p + s; return s.slice(0, n); });
    f('RPAD', (s, n, p) => { s = String(s); p = p === undefined ? ' ' : String(p); while (s.length < n) s = s + p; return s.slice(0, n); });
    f('INITCAP', s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()));
    f('CONCAT', (a, b) => String(a) + String(b));
    f('TO_CHAR', a => (a === null ? null : String(a)));
    // variable-arity helpers: register one overload per argument count
    const multi = (name, g, from, to) => {
      const ws = { 2: (a, b) => g([a, b]), 3: (a, b, c) => g([a, b, c]), 4: (a, b, c, d) => g([a, b, c, d]), 5: (a, b, c, d, e) => g([a, b, c, d, e]), 6: (a, b, c, d, e, x) => g([a, b, c, d, e, x]), 7: (a, b, c, d, e, x, y) => g([a, b, c, d, e, x, y]) };
      for (let n = from; n <= to; n++) f(name, ws[n]);
    };
    multi('LEAST', (a) => (a.some(v => v === null) ? null : a.reduce((m, v) => (v < m ? v : m))), 2, 6);
    multi('GREATEST', (a) => (a.some(v => v === null) ? null : a.reduce((m, v) => (v > m ? v : m))), 2, 6);
    multi('DECODE', (a) => { for (let i = 1; i + 1 < a.length; i += 2) if (a[0] === a[i] || (a[0] === null && a[i] === null)) return a[i + 1]; return a.length % 2 === 0 ? a[a.length - 1] : null; }, 3, 7);
    f('TO_DATE', (a) => (a === null ? null : (isoFromOracle(String(a)) || String(a))));
    f('TO_NUMBER', a => (a === null ? null : Number(a)));
    f('LTRIM', (s, c) => (c ? String(s).replace(new RegExp('^[' + c.replace(/[\]\\^-]/g, '\\$&') + ']+'), '') : String(s).replace(/^\s+/, '')));
    f('RTRIM', (s, c) => (c ? String(s).replace(new RegExp('[' + c.replace(/[\]\\^-]/g, '\\$&') + ']+$'), '') : String(s).replace(/\s+$/, '')));
  }

  function DB(sqlDb) { this.db = sqlDb; this.errors = 0; }

  Engine.create = function (setupSql) {
    if (!SQL) throw new Error('Engine not initialised');
    const raw = new SQL.Database();
    registerFns(raw);
    raw.run('PRAGMA foreign_keys = ON; PRAGMA case_sensitive_like = ON;');
    raw.run('CREATE TABLE dual (dummy TEXT); INSERT INTO dual VALUES (\'X\');');
    const d = new DB(raw);
    if (setupSql) d.script(setupSql, { quiet: true });
    try { raw.run('COMMIT'); } catch (e) { }
    raw.run('BEGIN');       // everything the user does next can be rolled back
    return d;
  };

  // Run one statement (already split). returns {cols, rows} or {msg}
  /* ----- DML through views (Oracle “simple view” rules) ----- */
  DB.prototype.viewDef = function (name) {
    const r = this.db.exec("SELECT sql FROM sqlite_master WHERE type='view' AND lower(name)=lower('" + name.replace(/'/g, "''") + "')");
    return r.length ? r[0].values[0][0] : null;
  };
  DB.prototype.viewDml = function (stmt, kind, name, def) {
    const meta = (this.views && this.views[name.toLowerCase()]) || {};
    if (meta.ro) throw new Error('ORA-42399: cannot perform a DML operation on a read-only view');
    const body = def.replace(/^\s*create\s+view\s+[\w$#]+\s*(\([^)]*\))?\s*as\s+/i, '').replace(/;\s*$/, '');
    const m = /^\s*select\s+(distinct\s+)?([\s\S]+?)\s+from\s+([\w$#]+)(?:\s+(?:as\s+)?[A-Za-z_]\w*)?\s*(?:where\s+([\s\S]+))?$/i.exec(body);
    if (!m || m[1] || /\b(join|group\s+by|having|union|intersect|except|order\s+by)\b|\b(count|sum|avg|min|max)\s*\(/i.test(body) || m[3].includes(',')) throw new Error('ORA-01732: data manipulation operation not legal on this view');
    const base = m[3], vwhere = m[4] || '';
    // column map  alias -> base column (or null for expression)
    const cols = [];
    if (m[2].trim() === '*') { this.db.exec(`SELECT name FROM pragma_table_info('${base}')`)[0].values.forEach(v => cols.push({ alias: v[0].toLowerCase(), base: v[0] })); }
    else splitTopCommas(m[2]).forEach(c => { const mm = /^\s*([A-Za-z_][\w$#.]*)(?:\s+(?:as\s+)?([A-Za-z_][\w$#]*))?\s*$/i.exec(c); if (mm) { const b = mm[1].split('.').pop(); cols.push({ alias: (mm[2] || b).toLowerCase(), base: b }); } else cols.push({ alias: (c.trim().split(/\s+/).pop() || '').toLowerCase(), base: null }); });
    const mapCol = (a) => { const c = cols.find(x => x.alias === a.trim().toLowerCase()); if (!c) throw new Error('ORA-00904: invalid identifier ' + a.trim() + ' (not a column of the view)'); if (!c.base) throw new Error('ORA-01733: virtual column not allowed here'); return c.base; };
    let newSql, updWhere = '';
    if (kind === 'insert') {
      const mi = /^\s*insert\s+into\s+\S+\s*(?:\(([^)]*)\))?\s*([\s\S]+)$/i.exec(stmt);
      const list = mi[1] ? mi[1].split(',').map(mapCol) : cols.map(c => { if (!c.base) throw new Error('ORA-01733: virtual column not allowed here'); return c.base; });
      newSql = `INSERT INTO ${base} (${list.join(', ')}) ${mi[2]}`;
    } else if (kind === 'update') {
      const mu = /^\s*update\s+\S+\s+set\s+([\s\S]*?)(?:\s+where\s+([\s\S]*))?$/i.exec(stmt);
      const sets = splitTopCommas(mu[1]).map(x => { const i = x.indexOf('='); return mapCol(x.slice(0, i)) + ' =' + x.slice(i + 1); }).join(', ');
      const where = [mu[2] ? '(' + mu[2] + ')' : '', vwhere ? '(' + vwhere + ')' : ''].filter(Boolean).join(' AND ');
      updWhere = where;
      newSql = `UPDATE ${base} SET ${sets}${where ? ' WHERE ' + where : ''}`;
    } else {
      const md = /^\s*delete\s+from\s+\S+(?:\s+where\s+([\s\S]*))?$/i.exec(stmt);
      const where = [md && md[1] ? '(' + md[1] + ')' : '', vwhere ? '(' + vwhere + ')' : ''].filter(Boolean).join(' AND ');
      newSql = `DELETE FROM ${base}${where ? ' WHERE ' + where : ''}`;
    }
    if (meta.wco && vwhere && kind !== 'delete') {
      this.db.run('SAVEPOINT vw_chk');
      try {
        let ids = null;
        if (kind === 'update') { const r = this.db.exec('SELECT rowid FROM ' + base + (updWhere ? ' WHERE ' + updWhere : '')); ids = r.length ? r[0].values.map(v => v[0]).join(',') : ''; }
        const res = this.one(newSql);
        const cond = kind === 'insert' ? 'rowid = last_insert_rowid()' : (ids ? 'rowid IN (' + ids + ')' : '0');
        const bad = this.db.exec('SELECT COUNT(*) FROM ' + base + ' WHERE ' + cond + ' AND NOT COALESCE((' + vwhere + '), 0)')[0].values[0][0];
        if (bad > 0) throw new Error('ORA-01402: view WITH CHECK OPTION where-clause violation');
        this.db.run('RELEASE vw_chk'); return res;
      } catch (e) { try { this.db.run('ROLLBACK TO vw_chk; RELEASE vw_chk'); } catch (e2) { } throw e; }
    }
    return this.one(newSql);
  };

  DB.prototype.one = function (stmt) {
    const vm = /^\s*(insert\s+into|update|delete\s+from)\s+([A-Za-z_][\w$#]*)/i.exec(stmt);
    if (vm) { const def = this.viewDef(vm[2]); if (def) return this.viewDml(stmt, vm[1].split(/\s/)[0].toLowerCase(), vm[2], def); }
    const t = Engine.toSqlite(stmt);
    if (t.view) { this.views = this.views || {}; this.views[t.view.name] = t.view; }
    if (t.pre) (Array.isArray(t.pre) ? t.pre : [t.pre]).forEach(x => this.db.run(x));
    const isSelect = /^\s*(select|with|pragma|values)\b/i.test(t.sql) || /^\s*\(\s*select\b/i.test(t.sql);
    if (isSelect) {
      const r = this.db.exec(t.sql);
      if (!r.length) {
        // zero rows: still need column names -> use a prepared statement
        const st = this.db.prepare(t.sql);
        const cols = st.getColumnNames(); st.free();
        return { cols, rows: [] };
      }
      return { cols: r[0].columns, rows: r[0].values };
    }
    const endsTxn = /^\s*(commit|rollback)(\s+work)?\s*$/i.test(t.sql);
    const isDdl = /^\s*(create|drop|alter|truncate)\b/i.test(stmt);
    this.db.run(t.sql);
    if (endsTxn || isDdl) { try { if (isDdl) this.db.run('COMMIT'); } catch (e) { } try { this.db.run('BEGIN'); } catch (e) { } }   // Oracle: DDL auto-commits
    const ch = this.db.getRowsModified();
    const kind = (/^\s*(\w+)(?:\s+(\w+))?/i.exec(stmt) || [])[1] || '';
    const k2 = ((/^\s*\w+\s+(\w+)/i.exec(stmt) || [])[1] || '').toLowerCase();
    const K = kind.toLowerCase();
    let msg;
    if (K === 'create') msg = (k2 === 'table' ? 'Table created.' : (k2 === 'view' || /^\s*create\s+or\s+replace\s+(force\s+)?view/i.test(stmt)) ? 'View created.' : 'Created.');
    else if (K === 'drop') msg = (k2 === 'table' ? 'Table dropped.' : k2 === 'view' ? 'View dropped.' : 'Dropped.');
    else if (K === 'alter') msg = 'Table altered.';
    else if (K === 'insert') msg = ch + (ch === 1 ? ' row created.' : ' rows created.');
    else if (K === 'update') msg = ch + (ch === 1 ? ' row updated.' : ' rows updated.');
    else if (K === 'delete') msg = ch + (ch === 1 ? ' row deleted.' : ' rows deleted.');
    else if (K === 'commit' || K === 'rollback') msg = K === 'commit' ? 'Commit complete.' : 'Rollback complete.';
    else msg = 'Done.';
    return { msg, changes: ch };
  };

  // Run a script; returns array of results; errors become {error}
  DB.prototype.script = function (sql, opts) {
    opts = opts || {};
    const stmts = Engine.splitStatements(sql);
    const out = [];
    for (const st of stmts) {
      if (/^(set\s+\w+|spool|prompt)\b/i.test(st)) { out.push({ msg: '(ignored)', sql: st }); continue; }
      try { const r = this.one(st); r.sql = st; out.push(r); }
      catch (e) {
        const err = cleanError(e);
        out.push({ error: err.msg, unsupported: err.unsupported, sql: st });
        if (opts.quiet) throw new Error('Setup failed: ' + err.msg + ' @ ' + st.slice(0, 80));
        if (!opts.keepGoing) break;
      }
    }
    return out;
  };

  // table listing for the schema panel
  DB.prototype.tables = function () {
    const r = this.db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name <> 'dual' ORDER BY type DESC, name");
    return r.length ? r[0].values.map(v => ({ name: v[0], type: v[1] })) : [];
  };
  DB.prototype.dump = function (table) {
    const r = this.db.exec('SELECT * FROM "' + table + '"');
    return r.length ? { cols: r[0].columns, rows: r[0].values } : { cols: [], rows: [] };
  };
  DB.prototype.close = function () { try { this.db.close(); } catch (e) { } };

  /* ---------- Oracle-style error text ---------- */
  function cleanError(e) {
    let m = (e && e.message) || String(e);
    const lower = m.toLowerCase();
    let out = m;
    if (e && e.unsupported) return { msg: m, unsupported: true };
    if (/unique constraint failed/.test(lower)) out = 'ORA-00001: unique constraint violated (' + m.replace(/^.*failed:\s*/i, '') + ')';
    else if (/not null constraint failed/.test(lower)) out = 'ORA-01400: cannot insert NULL into (' + m.replace(/^.*failed:\s*/i, '') + ')';
    else if (/foreign key constraint failed/.test(lower)) out = 'ORA-02291/02292: integrity constraint violated – parent key not found, or child records exist';
    else if (/check constraint failed/.test(lower)) out = 'ORA-02290: check constraint violated (' + m.replace(/^.*failed:\s*/i, '') + ')';
    else if (/no such table/.test(lower)) out = 'ORA-00942: table or view does not exist (' + m.replace(/^.*no such table:\s*/i, '') + ')';
    else if (/no such column/.test(lower)) out = 'ORA-00904: invalid identifier (' + m.replace(/^.*no such column:\s*/i, '') + ')';
    else if (/already exists/.test(lower)) out = 'ORA-00955: name is already used by an existing object (' + m + ')';
    else if (/syntax error/.test(lower)) out = 'ORA-00900/00933: SQL syntax error – ' + m;
    return { msg: out };
  }
  Engine.cleanError = cleanError;

  /* ---------- grading ---------- */
  function norm(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(Math.round(v * 10000) / 10000);
    const s = String(v).trim();
    if (s !== '' && !isNaN(Number(s)) && /^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 10000) / 10000);
    return s;
  }
  Engine.rowsKey = function (res, ordered) {
    const rows = (res.rows || []).map(r => JSON.stringify(r.map(norm)));
    if (!ordered) rows.sort();
    return rows;
  };
  Engine.sameResult = function (a, b, ordered) {
    if (!a.cols || !b.cols) return false;
    if (a.cols.length !== b.cols.length) return false;
    const ka = Engine.rowsKey(a, ordered), kb = Engine.rowsKey(b, ordered);
    return ka.length === kb.length && ka.every((x, i) => x === kb[i]);
  };

  /* Grade a "run" question.
       q.setup  : SQL (dataset) -> given by caller
       q.answer : reference SQL (one query, or script when q.verify is given)
       q.verify : optional query run on both DBs after the scripts (for DML/DDL questions)
       q.probes : optional array of probe statements; each reports ok/error on both DBs                */
  Engine.grade = function (q, setup, userSql) {
    const ref = Engine.create(setup), usr = Engine.create(setup);
    try {
      let refRes, usrRes;
      const refOut = ref.script(q.answer);
      const bad = refOut.find(r => r.error);
      if (bad) return { ok: false, internal: true, feedback: 'Internal error in model answer: ' + bad.error };
      const usrOut = usr.script(userSql);
      const uerr = usrOut.find(r => r.error);
      if (uerr) return { ok: false, feedback: uerr.error, results: usrOut };
      if (q.verify || q.probes) {
        const probeRun = (d) => (q.probes || []).map(p => { try { d.script(p, { quiet: true }); return 'ok'; } catch (e) { return 'error'; } });
        const rp = probeRun(ref), up = probeRun(usr);
        if (q.probes && JSON.stringify(rp) !== JSON.stringify(up)) {
          return { ok: false, feedback: 'Your table accepted/rejected the test inserts differently from the expected design.', results: usrOut, probe: { expected: rp, got: up, tests: q.probes } };
        }
        if (q.verify) {
          refRes = ref.one(q.verify); usrRes = usr.one(q.verify);
          const ok = Engine.sameResult(usrRes, refRes, q.ordered);
          return { ok, results: usrOut, feedback: ok ? '' : 'The data/table state after your statements is different from what is expected.', verify: { got: usrRes, expected: refRes } };
        }
        return { ok: true, results: usrOut };
      }
      // plain query: compare final SELECT of each
      const lastSel = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i].cols) return arr[i]; return null; };
      refRes = lastSel(refOut); usrRes = lastSel(usrOut);
      if (!usrRes) return { ok: false, feedback: 'Your script did not return a result set – this question expects a SELECT.', results: usrOut };
      const ok = Engine.sameResult(usrRes, refRes, q.ordered);
      let fb = '';
      if (!ok) {
        if (usrRes.cols.length !== refRes.cols.length) fb = `Expected ${refRes.cols.length} column(s) but your query returned ${usrRes.cols.length}.`;
        else if (usrRes.rows.length !== refRes.rows.length) fb = `Expected ${refRes.rows.length} row(s) but your query returned ${usrRes.rows.length}.`;
        else fb = q.ordered ? 'Same number of rows, but values (or their ORDER) differ.' : 'Same number of rows, but some values differ.';
      }
      return { ok, feedback: fb, results: usrOut, expected: refRes, got: usrRes };
    } finally { ref.close(); usr.close(); }
  };

  G.Engine = Engine;
  if (typeof module !== 'undefined') module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
