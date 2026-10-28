/* ============================================================
   Mini PL/SQL simulator (for study use – not a full Oracle clone)
   Supports: anonymous blocks, variables/constants, %TYPE/%ROWTYPE,
   IF/ELSIF/CASE, LOOP/WHILE/FOR, EXIT/CONTINUE, exceptions,
   DBMS_OUTPUT, SELECT INTO, DML, procedures, functions (also callable
   from SQL), implicit + explicit cursors, row/statement triggers.
   ============================================================ */
(function (G) {
  'use strict';
  const Engine = G.Engine;

  class PlsqlError extends Error {
    constructor(name, code, msg) { super(msg); this.pname = name; this.code = code; this.pmsg = msg; }
  }
  const E = {
    NO_DATA_FOUND: () => new PlsqlError('NO_DATA_FOUND', -1403, 'ORA-01403: no data found'),
    TOO_MANY_ROWS: () => new PlsqlError('TOO_MANY_ROWS', -1422, 'ORA-01422: exact fetch returns more than requested number of rows'),
    ZERO_DIVIDE: () => new PlsqlError('ZERO_DIVIDE', -1476, 'ORA-01476: divisor is equal to zero'),
    VALUE_ERROR: (m) => new PlsqlError('VALUE_ERROR', -6502, 'ORA-06502: PL/SQL: numeric or value error' + (m ? ': ' + m : '')),
    INVALID_NUMBER: () => new PlsqlError('INVALID_NUMBER', -1722, 'ORA-01722: invalid number'),
    DUP_VAL: (m) => new PlsqlError('DUP_VAL_ON_INDEX', -1, 'ORA-00001: unique constraint violated' + (m ? ' (' + m + ')' : '')),
    INVALID_CURSOR: () => new PlsqlError('INVALID_CURSOR', -1001, 'ORA-01001: invalid cursor'),
    CURSOR_ALREADY_OPEN: () => new PlsqlError('CURSOR_ALREADY_OPEN', -6511, 'ORA-06511: PL/SQL: cursor already open'),
  };

  /* ---------------- tokenizer ---------------- */
  function tokenize(src) {
    const toks = []; let i = 0, line = 1;
    const push = (t) => { t.line = line; toks.push(t); };
    while (i < src.length) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '-' && src[i + 1] === '-') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
      const start = i;
      if (c === "'") {
        let s = ''; i++;
        while (i < src.length) { if (src[i] === "'") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } break; } s += src[i++]; }
        i++; push({ t: 'str', v: s, start, end: i }); continue;
      }
      if (c === '"') { let s = ''; i++; while (i < src.length && src[i] !== '"') s += src[i++]; i++; push({ t: 'id', v: s, u: s.toUpperCase(), quoted: true, start, end: i }); continue; }
      const prev = toks[toks.length - 1];
      if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] || '') && !(prev && (prev.t === 'id' || prev.t === 'num' || prev.t === 'str' || prev.v === ')')))) {
        let s = '';
        while (/\d/.test(src[i] || '')) s += src[i++];
        if (src[i] === '.' && src[i + 1] !== '.') { s += src[i++]; while (/\d/.test(src[i] || '')) s += src[i++]; }
        if (/[eE]/.test(src[i] || '') && /[\d+-]/.test(src[i + 1] || '')) { s += src[i++]; if (/[+-]/.test(src[i])) s += src[i++]; while (/\d/.test(src[i] || '')) s += src[i++]; }
        push({ t: 'num', v: parseFloat(s), start, end: i }); continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let s = ''; while (/[\w$#]/.test(src[i] || '')) s += src[i++];
        push({ t: 'id', v: s, u: s.toUpperCase(), start, end: i }); continue;
      }
      if (c === ':' && /[A-Za-z_]/.test(src[i + 1] || '')) {
        i++; let s = ''; while (/[\w$#]/.test(src[i] || '')) s += src[i++];
        push({ t: 'id', v: s, u: s.toUpperCase(), bind: true, start, end: i }); continue;
      }
      if (c === '&' && /[A-Za-z_]/.test(src[i + 1] || '')) {
        i++; let s = ''; while (/[\w$#]/.test(src[i] || '')) s += src[i++];
        push({ t: 'amp', v: s, start, end: i }); continue;
      }
      const two = src.substr(i, 2);
      if ([':=', '=>', '..', '||', '<>', '!=', '<=', '>=', '**', '~='].includes(two)) { i += 2; push({ t: 'op', v: two, start, end: i }); continue; }
      i++; push({ t: 'op', v: c, start, end: i });
    }
    return toks;
  }

  const SQL_START = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'WITH', 'DESC', 'DESCRIBE', 'GRANT', 'REVOKE']);

  /* ---------------- parser ---------------- */
  class Parser {
    constructor(src) { this.src = src; this.toks = tokenize(src); this.p = 0; }
    peek(o = 0) { return this.toks[this.p + o]; }
    eof() { return this.p >= this.toks.length; }
    err(msg) { const t = this.peek() || this.toks[this.toks.length - 1]; const e = new Error((t ? 'line ' + t.line + ': ' : '') + msg + (t ? " (near '" + (t.v !== undefined ? t.v : '') + "')" : '')); e.syntax = true; return e; }
    isKw(w, o = 0) { const t = this.peek(o); return !!t && t.t === 'id' && !t.quoted && t.u === w; }
    isOp(v, o = 0) { const t = this.peek(o); return !!t && t.t === 'op' && t.v === v; }
    acceptKw(w) { if (this.isKw(w)) { this.p++; return true; } return false; }
    acceptOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
    expectKw(w) { if (!this.acceptKw(w)) throw this.err('expected ' + w); }
    expectOp(v) { if (!this.acceptOp(v)) throw this.err("expected '" + v + "'"); }
    ident() { const t = this.peek(); if (!t || t.t !== 'id') throw this.err('expected identifier'); this.p++; return t.quoted ? t.v : t.v.toLowerCase(); }

    /* capture raw tokens until ';' at depth 0 (not consumed) */
    captureSql() {
      const start = this.p; let d = 0;
      while (!this.eof()) {
        const t = this.peek();
        if (t.t === 'op') { if (t.v === '(') d++; else if (t.v === ')') d--; else if (t.v === ';' && d === 0) break; }
        this.p++;
      }
      return { t: 'sql', toks: this.toks.slice(start, this.p), src: this.src };
    }
    captureParen() { // at '(' ; returns tokens inside, consumes ')'
      this.expectOp('('); const start = this.p; let d = 1;
      while (!this.eof()) {
        const t = this.peek();
        if (t.t === 'op') { if (t.v === '(') d++; else if (t.v === ')') { d--; if (d === 0) break; } }
        this.p++;
      }
      const toks = this.toks.slice(start, this.p); this.expectOp(')');
      return { t: 'sql', toks, src: this.src };
    }

    /* ----- types ----- */
    parseType() {
      let name = this.ident();
      if (name === 'double' && this.isKw('PRECISION')) { this.p++; name = 'double'; }
      if (this.isOp('.')) { // table.column%TYPE
        this.p++; const col = this.ident();
        this.expectOp('%'); const k = this.ident();
        return { ref: { table: name, col, rowtype: k === 'rowtype' } };
      }
      if (this.isOp('%')) { this.p++; const k = this.ident(); return { ref: { table: name, rowtype: k === 'rowtype', typeOfVar: k === 'type' } }; }
      let size, scale;
      if (this.isOp('(')) { this.p++; size = this.peek().v; this.p++; if (this.acceptOp(',')) { scale = this.peek().v; this.p++; } if (this.isKw('BYTE') || this.isKw('CHAR')) this.p++; this.expectOp(')'); }
      return { name, size, scale };
    }

    /* ----- expressions ----- */
    parseExpr() { return this.parseOr(); }
    parseOr() { let l = this.parseAnd(); while (this.isKw('OR')) { this.p++; l = { t: 'bin', op: 'OR', l, r: this.parseAnd() }; } return l; }
    parseAnd() { let l = this.parseNot(); while (this.isKw('AND')) { this.p++; l = { t: 'bin', op: 'AND', l, r: this.parseNot() }; } return l; }
    parseNot() { if (this.isKw('NOT')) { this.p++; return { t: 'un', op: 'NOT', e: this.parseNot() }; } return this.parseCmp(); }
    parseCmp() {
      let l = this.parseConcat();
      for (; ;) {
        const t = this.peek(); if (!t) break;
        if (t.t === 'op' && ['=', '<>', '!=', '<', '>', '<=', '>=', '~='].includes(t.v)) { this.p++; l = { t: 'bin', op: t.v === '!=' || t.v === '~=' ? '<>' : t.v, l, r: this.parseConcat() }; continue; }
        if (this.isKw('IS')) { this.p++; const not = this.acceptKw('NOT'); this.expectKw('NULL'); l = { t: 'isnull', e: l, not }; continue; }
        let not = false, save = this.p;
        if (this.isKw('NOT')) { this.p++; not = true; }
        if (this.isKw('BETWEEN')) { this.p++; const lo = this.parseConcat(); this.expectKw('AND'); const hi = this.parseConcat(); l = { t: 'between', e: l, lo, hi, not }; continue; }
        if (this.isKw('LIKE')) { this.p++; const pat = this.parseConcat(); let esc = null; if (this.acceptKw('ESCAPE')) esc = this.parseConcat(); l = { t: 'like', e: l, pat, esc, not }; continue; }
        if (this.isKw('IN')) {
          this.p++; this.expectOp('('); const list = [this.parseExpr()]; while (this.acceptOp(',')) list.push(this.parseExpr()); this.expectOp(')');
          l = { t: 'in', e: l, list, not }; continue;
        }
        this.p = save; break;
      }
      return l;
    }
    parseConcat() { let l = this.parseAdd(); while (this.isOp('||')) { this.p++; l = { t: 'bin', op: '||', l, r: this.parseAdd() }; } return l; }
    parseAdd() { let l = this.parseMul(); while (this.isOp('+') || this.isOp('-')) { const op = this.peek().v; this.p++; l = { t: 'bin', op, l, r: this.parseMul() }; } return l; }
    parseMul() { let l = this.parsePow(); while (this.isOp('*') || this.isOp('/')) { const op = this.peek().v; this.p++; l = { t: 'bin', op, l, r: this.parsePow() }; } return l; }
    parsePow() { let l = this.parseUnary(); while (this.isOp('**')) { this.p++; l = { t: 'bin', op: '**', l, r: this.parseUnary() }; } return l; }
    parseUnary() {
      if (this.isOp('-')) { this.p++; return { t: 'un', op: '-', e: this.parseUnary() }; }
      if (this.isOp('+')) { this.p++; return this.parseUnary(); }
      return this.parsePrimary();
    }
    parseArgs() {
      const args = []; this.expectOp('(');
      if (!this.isOp(')')) {
        do {
          let name = null;
          if (this.peek().t === 'id' && this.isOp('=>', 1)) { name = this.ident(); this.p++; }
          args.push({ name, e: this.parseExpr() });
        } while (this.acceptOp(','));
      }
      this.expectOp(')'); return args;
    }
    parsePrimary() {
      const t = this.peek(); if (!t) throw this.err('unexpected end of input in expression');
      if (t.t === 'num') { this.p++; return { t: 'num', v: t.v }; }
      if (t.t === 'str') { this.p++; return { t: 'str', v: t.v }; }
      if (t.t === 'amp') { this.p++; return { t: 'amp', name: t.v }; }
      if (t.t === 'op' && t.v === '(') { this.p++; const e = this.parseExpr(); this.expectOp(')'); return e; }
      if (t.t === 'id') {
        if (!t.quoted) {
          if (t.u === 'NULL') { this.p++; return { t: 'null' }; }
          if (t.u === 'TRUE') { this.p++; return { t: 'bool', v: true }; }
          if (t.u === 'FALSE') { this.p++; return { t: 'bool', v: false }; }
          if (t.u === 'CASE') return this.parseCaseExpr();
          if (t.u === 'SYSDATE' || t.u === 'SYSTIMESTAMP' || t.u === 'CURRENT_DATE') { this.p++; return { t: 'call', name: 'sysdate', args: [] }; }
        }
        this.p++;
        const name = t.quoted ? t.v : t.v.toLowerCase();
        // attributes  x%FOUND
        if (this.isOp('%') && this.peek(1) && this.peek(1).t === 'id') { this.p++; const a = this.ident(); return { t: 'attr', of: name, attr: a }; }
        if (this.isOp('.') && this.peek(1) && this.peek(1).t === 'id') {
          this.p++; const f = this.ident();
          if (this.isOp('(')) { const args = this.parseArgs(); return { t: 'call', name: name + '.' + f, args }; }
          return { t: 'field', base: name, name: f };
        }
        if (this.isOp('(')) { const args = this.parseArgs(); return { t: 'call', name, args }; }
        return { t: 'id', name };
      }
      throw this.err('unexpected token in expression');
    }
    parseCaseExpr() {
      this.expectKw('CASE'); let operand = null;
      if (!this.isKw('WHEN')) operand = this.parseExpr();
      const whens = []; let els = null;
      while (this.acceptKw('WHEN')) { const c = this.parseExpr(); this.expectKw('THEN'); const r = this.parseExpr(); whens.push({ c, r }); }
      if (this.acceptKw('ELSE')) els = this.parseExpr();
      this.expectKw('END'); return { t: 'case', operand, whens, els };
    }

    /* ----- statements ----- */
    parseStmts(stops) {
      const out = [];
      for (; ;) {
        if (this.eof()) break;
        const t = this.peek();
        if (t.t === 'id' && !t.quoted && stops.includes(t.u)) break;
        if (this.acceptOp(';')) continue;
        out.push(this.parseStmt());
      }
      return out;
    }
    endStmt() { if (!this.acceptOp(';') && !this.eof()) throw this.err("expected ';'"); }

    parseStmt() {
      const t = this.peek();
      if (t.t === 'op' && t.v === '<' && this.isOp('<', 1)) { // <<label>>
        this.p += 2; this.ident(); this.expectOp('>'); this.expectOp('>'); return this.parseStmt();
      }
      if (t.t !== 'id') throw this.err('unexpected token');
      const u = t.quoted ? '' : t.u;
      switch (u) {
        case 'IF': return this.parseIf();
        case 'CASE': return this.parseCaseStmt();
        case 'LOOP': { this.p++; const body = this.parseStmts(['END']); this.expectKw('END'); this.expectKw('LOOP'); this.endStmt(); return { t: 'loop', body }; }
        case 'WHILE': { this.p++; const cond = this.parseExpr(); this.expectKw('LOOP'); const body = this.parseStmts(['END']); this.expectKw('END'); this.expectKw('LOOP'); this.endStmt(); return { t: 'while', cond, body }; }
        case 'FOR': return this.parseFor();
        case 'EXIT': case 'CONTINUE': { this.p++; let when = null; if (this.acceptKw('WHEN')) when = this.parseExpr(); this.endStmt(); return { t: u.toLowerCase(), when }; }
        case 'RETURN': { this.p++; let e = null; if (!this.isOp(';')) e = this.parseExpr(); this.endStmt(); return { t: 'return', e }; }
        case 'NULL': this.p++; this.endStmt(); return { t: 'null' };
        case 'RAISE': { this.p++; let name = null; if (!this.isOp(';')) name = this.ident(); this.endStmt(); return { t: 'raise', name }; }
        case 'OPEN': { this.p++; const c = this.ident(); let args = []; if (this.isOp('(')) args = this.parseArgs(); this.endStmt(); return { t: 'open', c, args }; }
        case 'FETCH': {
          this.p++; const c = this.ident(); this.expectKw('INTO'); const into = [this.parseTarget()];
          while (this.acceptOp(',')) into.push(this.parseTarget()); this.endStmt(); return { t: 'fetch', c, into };
        }
        case 'CLOSE': { this.p++; const c = this.ident(); this.endStmt(); return { t: 'close', c }; }
        case 'DECLARE': case 'BEGIN': { const b = this.parseBlock(); this.endStmt(); return b; }
        case 'EXECUTE': if (this.isKw('IMMEDIATE', 1)) { this.p += 2; const e = this.parseExpr(); this.endStmt(); return { t: 'execimm', e }; } break;
        default: break;
      }
      if (SQL_START.has(u) && !(this.isOp(':=', 1) || this.isOp('.', 1) && false)) {
        const s = this.captureSql(); this.endStmt(); return s;
      }
      // assignment or call
      const target = this.parseTarget();
      if (this.acceptOp(':=')) { const e = this.parseExpr(); this.endStmt(); return { t: 'assign', target, e }; }
      // procedure call: target.name could be 'x' or 'pkg.proc'
      let name = target.t === 'id' ? target.name : target.t === 'field' ? target.base + '.' + target.name : null;
      let args = [];
      if (this.isOp('(')) args = this.parseArgs();
      if (!name) throw this.err('invalid statement');
      this.endStmt();
      return { t: 'callstmt', name, args };
    }
    parseTarget() {
      const t = this.peek(); if (!t || t.t !== 'id') throw this.err('expected identifier');
      const name = this.ident();
      if (this.isOp('.') && this.peek(1) && this.peek(1).t === 'id') { this.p++; const f = this.ident(); return { t: 'field', base: name, name: f }; }
      return { t: 'id', name };
    }
    parseIf() {
      this.expectKw('IF'); const branches = []; let els = null;
      let cond = this.parseExpr(); this.expectKw('THEN'); branches.push({ cond, body: this.parseStmts(['ELSIF', 'ELSEIF', 'ELSE', 'END']) });
      for (; ;) {
        if (this.isKw('ELSIF') || this.isKw('ELSEIF')) { this.p++; cond = this.parseExpr(); this.expectKw('THEN'); branches.push({ cond, body: this.parseStmts(['ELSIF', 'ELSEIF', 'ELSE', 'END']) }); }
        else if (this.isKw('ELSE')) { this.p++; els = this.parseStmts(['END']); }
        else break;
      }
      this.expectKw('END'); this.expectKw('IF'); this.endStmt();
      return { t: 'if', branches, els };
    }
    parseCaseStmt() {
      this.expectKw('CASE'); let operand = null;
      if (!this.isKw('WHEN')) operand = this.parseExpr();
      const whens = []; let els = null;
      while (this.acceptKw('WHEN')) { const c = this.parseExpr(); this.expectKw('THEN'); whens.push({ c, body: this.parseStmts(['WHEN', 'ELSE', 'END']) }); }
      if (this.acceptKw('ELSE')) els = this.parseStmts(['END']);
      this.expectKw('END'); this.expectKw('CASE'); this.endStmt();
      return { t: 'casestmt', operand, whens, els };
    }
    parseFor() {
      this.expectKw('FOR'); const v = this.ident(); this.expectKw('IN');
      let reverse = this.acceptKw('REVERSE');
      if (this.isOp('(') && this.isKw('SELECT', 1)) {
        const q = this.captureParen(); this.expectKw('LOOP'); const body = this.parseStmts(['END']); this.expectKw('END'); this.expectKw('LOOP'); this.endStmt();
        return { t: 'forquery', v, q, body };
      }
      const lo = this.parseExpr();
      if (this.acceptOp('..')) {
        const hi = this.parseExpr(); this.expectKw('LOOP'); const body = this.parseStmts(['END']); this.expectKw('END'); this.expectKw('LOOP'); this.endStmt();
        return { t: 'forrange', v, lo, hi, reverse, body };
      }
      // cursor name (maybe with args)
      let c, args = [];
      if (lo.t === 'id') c = lo.name; else if (lo.t === 'call') { c = lo.name; args = lo.args; } else throw this.err('bad FOR loop');
      this.expectKw('LOOP'); const body = this.parseStmts(['END']); this.expectKw('END'); this.expectKw('LOOP'); this.endStmt();
      return { t: 'forcursor', v, c, args, body };
    }

    /* ----- declarations / blocks ----- */
    parseDecls() {
      const decls = [];
      for (; ;) {
        const t = this.peek(); if (!t) break;
        if (this.isKw('BEGIN')) break;
        if (this.isKw('CURSOR')) {
          this.p++; const name = this.ident(); const params = [];
          if (this.acceptOp('(')) { do { const pn = this.ident(); this.acceptKw('IN'); const ty = this.parseType(); let def = null; if (this.acceptOp(':=') || this.acceptKw('DEFAULT')) def = this.parseExpr(); params.push({ name: pn, type: ty, def }); } while (this.acceptOp(',')); this.expectOp(')'); }
          this.expectKw('IS'); const q = this.captureSql(); this.expectOp(';');
          decls.push({ k: 'cursor', name, params, q }); continue;
        }
        if (this.isKw('PROCEDURE') || this.isKw('FUNCTION')) { decls.push({ k: 'sub', sub: this.parseSubprogram() }); continue; }
        if (this.isKw('TYPE') || this.isKw('SUBTYPE')) throw this.err('TYPE declarations are not supported in this simulator');
        const name = this.ident();
        if (this.acceptKw('EXCEPTION')) { this.expectOp(';'); decls.push({ k: 'exc', name }); continue; }
        let constant = this.acceptKw('CONSTANT');
        const type = this.parseType(); let notnull = false;
        if (this.isKw('NOT') && this.isKw('NULL', 1)) { this.p += 2; notnull = true; }
        let init = null;
        if (this.acceptOp(':=') || this.acceptKw('DEFAULT')) init = this.parseExpr();
        this.expectOp(';');
        decls.push({ k: 'var', name, type, constant, init, notnull });
      }
      return decls;
    }
    parseBody() { // after decls: BEGIN stmts [EXCEPTION ...] END [label];
      this.expectKw('BEGIN'); const body = this.parseStmts(['EXCEPTION', 'END']); const handlers = [];
      if (this.acceptKw('EXCEPTION')) {
        while (this.acceptKw('WHEN')) {
          const names = [this.ident()]; while (this.acceptKw('OR')) names.push(this.ident());
          this.expectKw('THEN'); handlers.push({ names, body: this.parseStmts(['WHEN', 'END']) });
        }
      }
      this.expectKw('END'); if (this.peek() && this.peek().t === 'id' && !this.isOp(';')) this.p++;
      return { body, handlers };
    }
    parseBlock() {
      let decls = [];
      if (this.acceptKw('DECLARE')) decls = this.parseDecls();
      const { body, handlers } = this.parseBody();
      return { t: 'block', decls, body, handlers };
    }
    parseSubprogram() {
      const kind = this.isKw('FUNCTION') ? 'function' : 'procedure'; this.p++;
      const name = this.ident(); const params = [];
      if (this.acceptOp('(')) {
        do {
          const pn = this.ident(); let mode = 'in';
          if (this.acceptKw('IN')) { if (this.acceptKw('OUT')) mode = 'inout'; } else if (this.acceptKw('OUT')) mode = 'out';
          this.acceptKw('NOCOPY');
          const ty = this.parseType(); let def = null;
          if (this.acceptOp(':=') || this.acceptKw('DEFAULT')) def = this.parseExpr();
          params.push({ name: pn, mode, type: ty, def });
        } while (this.acceptOp(','));
        this.expectOp(')');
      }
      let ret = null; if (kind === 'function') { this.expectKw('RETURN'); ret = this.parseType(); }
      if (!this.acceptKw('IS') && !this.acceptKw('AS')) throw this.err('expected IS or AS');
      const decls = this.parseDecls(); const { body, handlers } = this.parseBody();
      return { kind, name, params, ret, decls, body, handlers };
    }
    parseTrigger() {
      this.expectKw('TRIGGER'); const name = this.ident();
      let timing; if (this.acceptKw('BEFORE')) timing = 'BEFORE'; else if (this.acceptKw('AFTER')) timing = 'AFTER'; else if (this.isKw('INSTEAD')) { this.p++; this.expectKw('OF'); timing = 'INSTEAD'; } else throw this.err('expected BEFORE/AFTER');
      const events = [];
      do {
        if (this.acceptKw('INSERT')) events.push({ ev: 'INSERT' });
        else if (this.acceptKw('DELETE')) events.push({ ev: 'DELETE' });
        else if (this.acceptKw('UPDATE')) { const cols = []; if (this.acceptKw('OF')) { do cols.push(this.ident()); while (this.acceptOp(',')); } events.push({ ev: 'UPDATE', cols }); }
        else throw this.err('expected INSERT/UPDATE/DELETE');
      } while (this.acceptKw('OR'));
      this.expectKw('ON'); let table = this.ident(); if (this.acceptOp('.')) table = this.ident();
      while (this.peek() && !this.isKw('FOR') && !this.isKw('WHEN') && !this.isKw('DECLARE') && !this.isKw('BEGIN')) this.p++; // REFERENCING ...
      let row = false, when = null;
      if (this.acceptKw('FOR')) { this.expectKw('EACH'); this.expectKw('ROW'); row = true; }
      if (this.acceptKw('WHEN')) { this.expectOp('('); when = this.parseExpr(); this.expectOp(')'); }
      const block = this.parseBlock();
      return { name, timing, events, table, row, when, block };
    }
  }

  /* ---------------- values ---------------- */
  function fmtNum(n) {
    if (!isFinite(n)) return String(n);
    if (Number.isInteger(n)) return String(n);
    let s = String(+n.toPrecision(15));
    if (/e/i.test(s)) s = n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
    if (s.startsWith('0.')) s = s.slice(1); else if (s.startsWith('-0.')) s = '-' + s.slice(2);
    return s;
  }
  function toStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return fmtNum(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function toNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') throw E.VALUE_ERROR();
    const s = String(v).trim();
    if (s === '' || isNaN(Number(s))) throw E.INVALID_NUMBER();
    return Number(s);
  }
  function sqlLit(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  function likeToRegex(p, esc) {
    let r = '^';
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (esc && c === esc) { i++; r += (p[i] || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
      if (c === '%') r += '[\\s\\S]*'; else if (c === '_') r += '[\\s\\S]'; else r += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(r + '$');
  }

  /* ---------------- environment ---------------- */
  class Env {
    constructor(parent) { this.vars = new Map(); this.cursors = new Map(); this.excs = new Map(); this.subs = new Map(); this.parent = parent || null; }
    find(name) { let e = this; while (e) { if (e.vars.has(name)) return e; e = e.parent; } return null; }
    findMap(map, name) { let e = this; while (e) { if (e[map].has(name)) return e[map].get(name); e = e.parent; } return null; }
  }

  /* ---------------- session / interpreter ---------------- */
  class Session {
    constructor(db, opts) {
      this.db = db; this.opts = opts || {};
      this.global = new Env(null);
      this.procs = new Map(); this.funcs = new Map(); this.triggers = [];
      this.out = []; this.log = []; this.steps = 0; this.depth = 0;
      this.sqlCount = 0; this.sqlFound = null; this.sqlRows = null;
      this.pending = '';
    }
    emit(line) { this.out.push(line); this.log.push({ type: 'out', text: line }); }
    msg(text) { this.log.push({ type: 'msg', text }); }
    step() { if (++this.steps > 400000) throw new Error('Execution stopped: more than 400,000 steps (infinite loop?).'); }
    prompt(name) {
      if (this.opts.inputs && name in this.opts.inputs) return this.opts.inputs[name];
      if (this.opts.prompt) { const v = this.opts.prompt(name); if (v === null || v === undefined) throw new Error('Input cancelled for &' + name); return v; }
      throw new Error('Needs input for &' + name + ' – no prompt available');
    }

    /* ---- top level ---- */
    run(text) {
      this.out = []; this.log = []; this.steps = 0;
      let P;
      try { P = new Parser(text); } catch (e) { this.log.push({ type: 'error', text: e.message }); return this.result(); }
      while (!P.eof()) {
        const t = P.peek();
        if (t.t === 'op' && (t.v === ';' || (t.v === '/' && this.loneSlash(P)))) { P.p++; continue; }
        if (t.t === 'op' && t.v === '(') { // bracketed query, e.g. (SELECT …) UNION (SELECT …)
          try { const s = P.captureSql(); P.acceptOp(';'); this.runSqlStmt(s, this.global, true); } catch (e) { this.reportError(e); }
          continue;
        }
        if (t.t !== 'id') { this.log.push({ type: 'error', text: 'Unexpected token ' + t.v }); break; }
        const u = t.quoted ? '' : t.u;
        try {
          if (u === 'SET' || u === 'SPOOL' || u === 'PROMPT' || u === 'CLEAR' || u === 'COLUMN' || u === 'SHOW' || u === 'ACCEPT') {
            const ln = t.line; while (!P.eof() && P.peek().line === ln && !P.isOp(';')) P.p++; P.acceptOp(';'); continue;
          }
          if (u === 'DECLARE' || u === 'BEGIN') {
            const b = P.parseBlock(); P.acceptOp(';');
            this.runBlock(b, this.global);
            this.msg('PL/SQL procedure successfully completed.'); continue;
          }
          if (u === 'CREATE') { this.createObject(P); continue; }
          if (u === 'EXEC' || u === 'EXECUTE' || u === 'CALL') {
            P.p++; const e = P.parseExpr(); P.acceptOp(';');
            this.execCall(e); this.msg('PL/SQL procedure successfully completed.'); continue;
          }
          if (SQL_START.has(u)) {
            const s = P.captureSql(); P.acceptOp(';'); this.runSqlStmt(s, this.global, true); continue;
          }
          throw P.err('Unrecognised statement');
        } catch (e) {
          this.reportError(e);
          // a syntax error leaves the parser mid-unit: resync at the next lone '/' line
          if (e && e.syntax) { while (!P.eof() && !this.loneSlash(P)) P.p++; }
        }
      }
      return this.result();
    }
    loneSlash(P) {
      const t = P.peek(); if (!t || t.t !== 'op' || t.v !== '/') return false;
      const prev = P.toks[P.p - 1], next = P.toks[P.p + 1];
      return (!prev || prev.line !== t.line) && (!next || next.line !== t.line);
    }
    result() { return { log: this.log, output: this.out.slice() }; }
    reportError(e) {
      if (e instanceof PlsqlError) this.log.push({ type: 'error', text: e.pmsg });
      else this.log.push({ type: 'error', text: (e && e.syntax ? 'Syntax error – ' : '') + (e && e.message || String(e)) });
    }

    execCall(e) {
      if (e.t === 'id') e = { t: 'call', name: e.name, args: [] };
      if (e.t !== 'call') throw new Error('EXEC expects a procedure call');
      this.callProc(e.name, e.args, this.global);
    }

    /* ---- CREATE ... ---- */
    createObject(P) {
      P.expectKw('CREATE'); let replace = false;
      if (P.isKw('OR')) { P.p++; P.expectKw('REPLACE'); replace = true; }
      if (P.isKw('PROCEDURE') || P.isKw('FUNCTION')) {
        const sub = P.parseSubprogram(); P.acceptOp(';');
        if (sub.kind === 'procedure') { this.procs.set(sub.name, sub); this.msg('Procedure created.'); }
        else {
          this.funcs.set(sub.name, sub); this.msg('Function created.');
          try {
            const f = (args) => { const v = this.callFunction(sub.name, args); return typeof v === 'boolean' ? (v ? 1 : 0) : v; };
            const n = sub.params.length;
            const wrap = [() => f([]), (a) => f([a]), (a, b) => f([a, b]), (a, b, c) => f([a, b, c]), (a, b, c, d) => f([a, b, c, d]), (a, b, c, d, e) => f([a, b, c, d, e])][n];
            if (wrap) this.db.db.create_function(sub.name, wrap);
          } catch (e) { }
        }
        return;
      }
      if (P.isKw('TRIGGER')) {
        const tr = P.parseTrigger(); P.acceptOp(';');
        this.triggers = this.triggers.filter(x => x.name !== tr.name); this.triggers.push(tr);
        this.msg('Trigger created.'); return;
      }
      if (P.isKw('PACKAGE')) throw new Error('PACKAGE is not supported in this simulator.');
      // plain DDL (CREATE TABLE / VIEW / INDEX ...) – rewind to CREATE
      P.p--; if (replace) P.p -= 2;
      const s = P.captureSql(); P.acceptOp(';'); this.runSqlStmt(s, this.global, true);
    }

    /* ---- running blocks ---- */
    runBlock(b, parentEnv, preset) {
      const env = new Env(parentEnv);
      if (preset) for (const [k, v] of Object.entries(preset)) env.vars.set(k, v);
      this.declare(b.decls, env);
      try {
        const r = this.execStmts(b.body, env);
        return r;
      } catch (e) {
        if (!(e instanceof PlsqlError) && !(e && e.sqlErr)) throw e;
        const pe = this.toPlsqlError(e);
        for (const h of b.handlers) {
          if (h.names.some(n => n === 'others' || n === pe.pname.toLowerCase() || this.userExcMatch(env, n, pe))) {
            const henv = new Env(env); henv.vars.set('sqlerrm', { type: {}, value: pe.pmsg }); henv.vars.set('sqlcode', { type: {}, value: pe.code });
            this.sqlerr = pe;
            return this.execStmts(h.body, henv);
          }
        }
        throw pe;
      }
    }
    userExcMatch(env, n, pe) { const x = env.findMap('excs', n); return x && pe.pname === x.id; }
    toPlsqlError(e) {
      if (e instanceof PlsqlError) return e;
      const m = (e && e.message) || '';
      if (/unique constraint/i.test(m)) return E.DUP_VAL(m.replace(/^.*failed:\s*/i, ''));
      const c = Engine.cleanError(e).msg;
      return new PlsqlError('SQL_ERROR', -1, c);
    }
    declare(decls, env) {
      for (const d of decls) {
        if (d.k === 'var') {
          const ty = this.resolveType(d.type, env);
          let v = d.init ? this.coerce(ty, this.evalExpr(d.init, env)) : (ty.record ? this.emptyRecord(ty) : null);
          env.vars.set(d.name, { type: ty, value: v, constant: d.constant });
        } else if (d.k === 'cursor') env.cursors.set(d.name, { decl: d, state: null });
        else if (d.k === 'exc') env.excs.set(d.name, { id: 'USER_' + d.name.toUpperCase() + '_' + (++this.sqlCount) });
        else if (d.k === 'sub') env.subs.set(d.sub.name, d.sub);
      }
    }
    resolveType(t, env) {
      if (t.ref) {
        if (t.ref.rowtype) {
          let cols = null; const cur = env.findMap('cursors', t.ref.table);
          if (cur) cols = this.cursorColumns(cur.decl, env); else cols = this.tableColumns(t.ref.table).map(c => c.name);
          return { record: true, cols };
        }
        if (t.ref.col) { const c = this.tableColumns(t.ref.table).find(c => c.name.toLowerCase() === t.ref.col); if (c) return this.parseSqlType(c.type); return {}; }
        if (t.ref.typeOfVar) { const e = env.find(t.ref.table); if (e) return e.vars.get(t.ref.table).type; }
        return {};
      }
      return t;
    }
    parseSqlType(s) {
      const m = /^\s*(\w+)\s*(?:\(\s*(\d+)\s*(?:,\s*(-?\d+))?\s*\))?/.exec(s || '');
      if (!m) return {}; return { name: m[1].toLowerCase(), size: m[2] ? +m[2] : undefined, scale: m[3] !== undefined ? +m[3] : undefined };
    }
    tableColumns(table) {
      try { const r = this.db.db.exec(`SELECT name, type FROM pragma_table_info('${table}')`); return r.length ? r[0].values.map(v => ({ name: v[0], type: v[1] })) : []; } catch (e) { return []; }
    }
    emptyRecord(ty) { const r = {}; for (const c of ty.cols) r[c.toLowerCase()] = null; return r; }
    coerce(ty, v) {
      if (v === null || v === undefined || !ty || !ty.name) return v === undefined ? null : v;
      const n = ty.name.toLowerCase();
      if (['integer', 'int', 'smallint', 'pls_integer', 'binary_integer', 'natural', 'positive'].includes(n)) { const x = toNum(v); return x === null ? null : Math.round(x); }
      if (['number', 'decimal', 'numeric', 'dec'].includes(n)) {
        let x = toNum(v); if (x === null) return null;
        if (ty.scale !== undefined) { const k = Math.pow(10, ty.scale); x = Math.round(x * k) / k; }
        if (ty.size !== undefined) { const lim = Math.pow(10, ty.size - (ty.scale || 0)); if (Math.abs(x) >= lim) throw E.VALUE_ERROR('number precision too large'); }
        return x;
      }
      if (['real', 'float', 'double', 'binary_float', 'binary_double'].includes(n)) return toNum(v);
      if (['varchar2', 'varchar', 'char', 'nvarchar2', 'nchar', 'string'].includes(n)) {
        const s = toStr(v); if (ty.size !== undefined && s.length > ty.size) throw E.VALUE_ERROR('character string buffer too small'); return s;
      }
      if (n === 'boolean') return v;
      return v;
    }

    /* ---- statements ---- */
    execStmts(list, env) {
      for (const s of list) { const r = this.execStmt(s, env); if (r) return r; }
      return null;
    }
    truthy(v) { return v === true; }
    execStmt(s, env) {
      this.step();
      switch (s.t) {
        case 'null': return null;
        case 'assign': this.assign(s.target, this.evalExpr(s.e, env), env); return null;
        case 'if':
          for (const b of s.branches) if (this.truthy(this.evalExpr(b.cond, env))) return this.execStmts(b.body, env);
          if (s.els) return this.execStmts(s.els, env); return null;
        case 'casestmt': {
          const op = s.operand ? this.evalExpr(s.operand, env) : null;
          for (const w of s.whens) {
            const hit = s.operand ? this.cmp('=', op, this.evalExpr(w.c, env)) === true : this.truthy(this.evalExpr(w.c, env));
            if (hit) return this.execStmts(w.body, env);
          }
          if (s.els) return this.execStmts(s.els, env);
          throw new PlsqlError('CASE_NOT_FOUND', -6592, 'ORA-06592: CASE not found while executing CASE statement');
        }
        case 'loop': for (; ;) { this.step(); const r = this.execStmts(s.body, env); if (r) { if (r.ctl === 'exit') break; if (r.ctl === 'continue') continue; return r; } } return null;
        case 'while': while (this.truthy(this.evalExpr(s.cond, env))) { this.step(); const r = this.execStmts(s.body, env); if (r) { if (r.ctl === 'exit') break; if (r.ctl === 'continue') continue; return r; } } return null;
        case 'forrange': {
          const lo = Math.round(toNum(this.evalExpr(s.lo, env))), hi = Math.round(toNum(this.evalExpr(s.hi, env)));
          const e2 = new Env(env); const cell = { type: { name: 'integer' }, value: 0, constant: true }; e2.vars.set(s.v, cell);
          const seq = []; if (s.reverse) for (let i = hi; i >= lo; i--) seq.push(i); else for (let i = lo; i <= hi; i++) seq.push(i);
          for (const i of seq) { this.step(); cell.value = i; const r = this.execStmts(s.body, e2); if (r) { if (r.ctl === 'exit') break; if (r.ctl === 'continue') continue; return r; } }
          return null;
        }
        case 'forquery': case 'forcursor': {
          let res, cols, cur = null;
          if (s.t === 'forquery') { const q = this.runQuery(s.q, env); res = q.rows; cols = q.cols; }
          else {
            const c = env.findMap('cursors', s.c); if (!c) throw new Error("PLS-00201: identifier '" + s.c + "' must be declared");
            const q = this.openCursorQuery(c, s.args, env); res = q.rows; cols = q.cols; cur = c;
            c.state = { open: true, rows: res, cols, i: 0, found: null, rowcount: 0 };   // so c%ROWCOUNT etc. work inside the loop
          }
          const e2 = new Env(env); const rec = {}; const cell = { type: { record: true, cols }, value: rec, constant: false }; e2.vars.set(s.v, cell);
          let n = 0;
          try {
            for (const row of res) {
              this.step(); n++; const o = {}; cols.forEach((c, i) => o[c.toLowerCase()] = row[i]); cell.value = o;
              if (cur) { cur.state.rowcount = n; cur.state.found = true; cur.state.i = n; }
              const r = this.execStmts(s.body, e2); if (r) { if (r.ctl === 'exit') break; if (r.ctl === 'continue') continue; return r; }
            }
          } finally { if (cur) cur.state.open = false; }
          return null;
        }
        case 'exit': if (!s.when || this.truthy(this.evalExpr(s.when, env))) return { ctl: 'exit' }; return null;
        case 'continue': if (!s.when || this.truthy(this.evalExpr(s.when, env))) return { ctl: 'continue' }; return null;
        case 'return': return { ctl: 'return', value: s.e ? this.evalExpr(s.e, env) : null };
        case 'raise': {
          if (!s.name) { if (this.sqlerr) throw this.sqlerr; throw new Error('RAISE without exception'); }
          const x = env.findMap('excs', s.name);
          if (x) throw new PlsqlError(x.id, -20000, 'ORA-06510: PL/SQL: unhandled user-defined exception');
          const nm = s.name.toUpperCase(); if (E[nm]) throw E[nm](); throw new Error("PLS-00201: identifier '" + s.name + "' must be declared");
        }
        case 'block': { const r = this.runBlock(s, env); return r; }
        case 'sql': this.runSqlStmt(s, env, false); return null;
        case 'execimm': { const q = String(this.evalExpr(s.e, env)); this.runRaw(q); return null; }
        case 'open': {
          const c = env.findMap('cursors', s.c); if (!c) throw new Error("PLS-00201: identifier '" + s.c + "' must be declared");
          if (c.state && c.state.open) throw E.CURSOR_ALREADY_OPEN();
          const q = this.openCursorQuery(c, s.args, env); c.state = { open: true, rows: q.rows, cols: q.cols, i: 0, found: null, rowcount: 0 }; return null;
        }
        case 'fetch': {
          const c = env.findMap('cursors', s.c); if (!c || !c.state || !c.state.open) throw E.INVALID_CURSOR();
          const st = c.state;
          if (st.i >= st.rows.length) { st.found = false; return null; }
          const row = st.rows[st.i++]; st.found = true; st.rowcount++;
          if (s.into.length === 1 && s.into[0].t === 'id') {
            const cell = this.lookupVar(s.into[0].name, env);
            if (cell && cell.type && cell.type.record) { const o = {}; st.cols.forEach((cn, i) => o[cn.toLowerCase()] = row[i]); cell.value = o; return null; }
          }
          s.into.forEach((t, i) => this.assign(t, row[i] === undefined ? null : row[i], env));
          return null;
        }
        case 'close': { const c = env.findMap('cursors', s.c); if (!c || !c.state || !c.state.open) throw E.INVALID_CURSOR(); c.state.open = false; return null; }
        case 'callstmt': return this.callStmt(s, env);
      }
      throw new Error('Unsupported statement: ' + s.t);
    }

    callStmt(s, env) {
      const n = s.name;
      if (n === 'dbms_output.put_line' || n === 'dbms_output.put' || n === 'dbms_output.new_line') {
        if (n === 'dbms_output.new_line') { this.flushPut(); this.emit(''); return null; }
        const v = s.args.length ? this.evalExpr(s.args[0].e, env) : '';
        if (typeof v === 'boolean') throw new Error('PLS-00306: wrong number or types of arguments in call to PUT_LINE (BOOLEAN cannot be printed)');
        if (n === 'dbms_output.put') { this.pending += toStr(v); return null; }
        const line = this.pending + toStr(v); this.pending = ''; this.emit(line); return null;
      }
      if (n === 'raise_application_error') {
        const code = toNum(this.evalExpr(s.args[0].e, env)); const m = String(this.evalExpr(s.args[1].e, env));
        if (code > -20000 || code < -20999) throw new Error('ORA-21000: error number argument to raise_application_error of ' + code + ' is out of range');
        throw new PlsqlError('APP_ERROR', code, 'ORA' + code + ': ' + m);
      }
      this.callProc(n, s.args, env); return null;
    }
    flushPut() { if (this.pending) { this.emit(this.pending); this.pending = ''; } }

    lookupVar(name, env) { const e = env.find(name); return e ? e.vars.get(name) : null; }
    assign(target, value, env) {
      if (target.t === 'id') {
        const cell = this.lookupVar(target.name, env);
        if (!cell) throw new Error("PLS-00201: identifier '" + target.name.toUpperCase() + "' must be declared");
        if (cell.constant) throw new Error("PLS-00363: expression '" + target.name.toUpperCase() + "' cannot be used as an assignment target (it is a CONSTANT)");
        if (cell.type && cell.type.record && value && typeof value === 'object') { cell.value = Object.assign({}, value); return; }
        cell.value = this.coerce(cell.type, value); return;
      }
      if (target.t === 'field') {
        const cell = this.lookupVar(target.base, env);
        if (!cell || typeof cell.value !== 'object' || cell.value === null) throw new Error("PLS-00201: identifier '" + target.base.toUpperCase() + "' must be declared");
        cell.value[target.name] = value; return;
      }
      throw new Error('Bad assignment target');
    }

    /* ---- expressions ---- */
    cmp(op, a, b) {
      if (a === null || b === null || a === undefined || b === undefined) return null;
      if (typeof a === 'number' && typeof b === 'string') b = toNum(b);
      else if (typeof b === 'number' && typeof a === 'string') a = toNum(a);
      switch (op) {
        case '=': return a === b; case '<>': return a !== b;
        case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
      }
    }
    evalExpr(e, env) {
      switch (e.t) {
        case 'num': return e.v; case 'str': return e.v; case 'null': return null; case 'bool': return e.v;
        case 'amp': return this.prompt(e.name);
        case 'id': {
          const cell = this.lookupVar(e.name, env);
          if (cell) return cell.value;
          if (e.name === 'sqlerrm') return this.sqlerr ? this.sqlerr.pmsg : 'ORA-0000: normal, successful completion';
          if (e.name === 'sqlcode') return this.sqlerr ? this.sqlerr.code : 0;
          if (this.funcs.has(e.name) || env.findMap('subs', e.name)) return this.callFunc(e.name, [], env);
          throw new Error("PLS-00201: identifier '" + e.name.toUpperCase() + "' must be declared");
        }
        case 'field': {
          const cell = this.lookupVar(e.base, env);
          if (!cell) throw new Error("PLS-00201: identifier '" + e.base.toUpperCase() + "' must be declared");
          const rec = cell.value; if (!rec || typeof rec !== 'object') throw new Error("PLS-00487: '" + e.base.toUpperCase() + "' is not a record");
          if (!(e.name in rec)) throw new Error("PLS-00302: component '" + e.name.toUpperCase() + "' must be declared");
          return rec[e.name];
        }
        case 'attr': return this.evalAttr(e, env);
        case 'un': {
          const v = this.evalExpr(e.e, env);
          if (e.op === 'NOT') return v === null ? null : !v;
          return v === null ? null : -toNum(v);
        }
        case 'bin': return this.evalBin(e, env);
        case 'isnull': { const v = this.evalExpr(e.e, env); const r = v === null || v === undefined || v === ''; return e.not ? !r : r; }
        case 'between': {
          const v = this.evalExpr(e.e, env), lo = this.evalExpr(e.lo, env), hi = this.evalExpr(e.hi, env);
          const a = this.cmp('>=', v, lo), b = this.cmp('<=', v, hi); let r = (a === null || b === null) ? ((a === false || b === false) ? false : null) : (a && b);
          return e.not && r !== null ? !r : r;
        }
        case 'like': {
          const v = this.evalExpr(e.e, env), p = this.evalExpr(e.pat, env); if (v === null || p === null) return null;
          const esc = e.esc ? this.evalExpr(e.esc, env) : null; const r = likeToRegex(String(p), esc).test(toStr(v)); return e.not ? !r : r;
        }
        case 'in': {
          const v = this.evalExpr(e.e, env); if (v === null) return null; let r = false, sawNull = false;
          for (const x of e.list) { const y = this.evalExpr(x, env); if (y === null) sawNull = true; else if (this.cmp('=', v, y)) { r = true; break; } }
          if (e.not) return r ? false : (sawNull ? null : true); return r ? true : (sawNull ? null : false);
        }
        case 'case': {
          const op = e.operand ? this.evalExpr(e.operand, env) : null;
          for (const w of e.whens) { const hit = e.operand ? this.cmp('=', op, this.evalExpr(w.c, env)) === true : this.truthy(this.evalExpr(w.c, env)); if (hit) return this.evalExpr(w.r, env); }
          return e.els ? this.evalExpr(e.els, env) : null;
        }
        case 'call': return this.evalCall(e, env);
      }
      throw new Error('Unsupported expression ' + e.t);
    }
    evalAttr(e, env) {
      const a = e.attr.toLowerCase();
      if (e.of === 'sql') { if (a === 'rowcount') return this.sqlRows === null ? null : this.sqlRows; if (a === 'found') return this.sqlFound; if (a === 'notfound') return this.sqlFound === null ? null : !this.sqlFound; if (a === 'isopen') return false; }
      const c = env.findMap('cursors', e.of);
      if (!c) throw new Error("PLS-00201: identifier '" + e.of.toUpperCase() + "' must be declared");
      const st = c.state;
      if (a === 'isopen') return !!(st && st.open);
      if (!st || !st.open) throw E.INVALID_CURSOR();
      if (a === 'found') return st.found; if (a === 'notfound') return st.found === null ? null : !st.found; if (a === 'rowcount') return st.rowcount;
      throw new Error('Unknown cursor attribute %' + e.attr);
    }
    evalBin(e, env) {
      if (e.op === 'AND') { const a = this.evalExpr(e.l, env); if (a === false) return false; const b = this.evalExpr(e.r, env); if (b === false) return false; return (a === null || b === null) ? null : true; }
      if (e.op === 'OR') { const a = this.evalExpr(e.l, env); if (a === true) return true; const b = this.evalExpr(e.r, env); if (b === true) return true; return (a === null || b === null) ? null : false; }
      const a = this.evalExpr(e.l, env), b = this.evalExpr(e.r, env);
      switch (e.op) {
        case '||': return toStr(a) + toStr(b);
        case '+': case '-': case '*': case '/': case '**': {
          if (a === null || b === null) return null; const x = toNum(a), y = toNum(b);
          if (e.op === '+') return x + y; if (e.op === '-') return x - y; if (e.op === '*') return x * y;
          if (e.op === '/') { if (y === 0) throw E.ZERO_DIVIDE(); return x / y; }
          return Math.pow(x, y);
        }
        default: return this.cmp(e.op, a, b);
      }
    }
    evalCall(e, env) {
      const n = e.name;
      if (n === 'updating' && e.args.length) { const ch = this.lookupVar('__changed', env); const col = String(this.evalExpr(e.args[0].e, env)).toLowerCase(); return !!(ch && ch.value.includes(col)); }
      const sub = env.findMap('subs', n); if (sub && sub.kind === 'function') return this.invoke(sub, e.args, env);
      if (this.funcs.has(n)) return this.invoke(this.funcs.get(n), e.args, env);
      const args = e.args.map(a => this.evalExpr(a.e, env));
      return this.builtin(n, args, env);
    }
    callFunc(name, argExprs, env) { const sub = env.findMap('subs', name) || this.funcs.get(name); return this.invoke(sub, argExprs, env); }
    callFunction(name, vals) { // from SQL
      const f = this.funcs.get(name); const args = vals.map(v => ({ name: null, e: { t: 'lit', v } }));
      return this.invoke(f, args, this.global);
    }
    callProc(name, args, env) {
      const sub = env.findMap('subs', name) || this.procs.get(name);
      if (!sub) { if (this.funcs.has(name)) throw new Error('PLS-00221: ' + name.toUpperCase() + ' is not a procedure'); throw new Error("PLS-00201: identifier '" + name.toUpperCase() + "' must be declared"); }
      this.invoke(sub, args, env);
    }
    invoke(sub, args, callerEnv) {
      if (++this.depth > 200) { this.depth = 0; throw new Error('ORA-06512: stack overflow – recursion too deep'); }
      try {
        const env = new Env(this.global);
        const pos = args.filter(a => !a.name), named = args.filter(a => a.name);
        const outs = [];
        sub.params.forEach((p, i) => {
          let arg = i < pos.length ? pos[i] : named.find(a => a.name === p.name);
          let val = null;
          if (arg) {
            if (arg.e.t === 'lit') val = arg.e.v; else val = this.evalExpr(arg.e, callerEnv);
            if (p.mode !== 'in' && arg.e.t !== 'lit') outs.push({ p, target: arg.e });
          } else if (p.def) val = this.evalExpr(p.def, env);
          else throw new Error('PLS-00306: wrong number or types of arguments in call to ' + sub.name.toUpperCase());
          const ty = this.resolveType(p.type, env);
          env.vars.set(p.name, { type: ty.record ? ty : { name: ty.name && /^(integer|int|number|decimal|numeric|real|float)$/i.test(ty.name) ? 'number' : undefined }, value: p.mode === 'out' ? null : val, constant: p.mode === 'in' && false });
        });
        if (pos.length > sub.params.length) throw new Error('PLS-00306: wrong number or types of arguments in call to ' + sub.name.toUpperCase());
        const blk = { decls: sub.decls, body: sub.body, handlers: sub.handlers };
        const r = this.runBlock(blk, env);
        for (const o of outs) { const v = env.vars.get(o.p.name).value; try { this.assign(o.target.t === 'id' ? o.target : { t: 'field', base: o.target.base, name: o.target.name }, v, callerEnv); } catch (e) { } }
        if (sub.kind === 'function') {
          if (!r || r.ctl !== 'return') throw new Error('ORA-06503: PL/SQL: Function returned without value');
          const rty = this.resolveType(sub.ret, env);
          return this.coerce(rty, r.value);
        }
        return null;
      } finally { this.depth = Math.max(0, this.depth - 1); }
    }

    builtin(n, a, env) {
      const s = (i) => toStr(a[i]), num = (i) => toNum(a[i]);
      switch (n) {
        case 'length': return a[0] === null ? null : s(0).length;
        case 'upper': return a[0] === null ? null : s(0).toUpperCase();
        case 'lower': return a[0] === null ? null : s(0).toLowerCase();
        case 'initcap': return a[0] === null ? null : s(0).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        case 'substr': {
          if (a[0] === null) return null; const str = s(0); let st = num(1), len = a.length > 2 ? num(2) : undefined;
          if (st === 0) st = 1; if (st < 0) st = str.length + st + 1; if (len !== undefined && len < 1) return null; return str.substr(st - 1, len);
        }
        case 'instr': { if (a[0] === null) return null; const st = a.length > 2 ? num(2) : 1; const idx = s(0).indexOf(s(1), st - 1); return idx < 0 ? 0 : idx + 1; }
        case 'replace': return a[0] === null ? null : s(0).split(s(1)).join(a.length > 2 ? s(2) : '');
        case 'trim': return a[0] === null ? null : s(0).trim();
        case 'ltrim': return a[0] === null ? null : s(0).replace(/^\s+/, '');
        case 'rtrim': return a[0] === null ? null : s(0).replace(/\s+$/, '');
        case 'lpad': { let x = s(0); const L = num(1), p = a.length > 2 ? s(2) : ' '; while (x.length < L) x = p + x; return x.slice(0, L); }
        case 'rpad': { let x = s(0); const L = num(1), p = a.length > 2 ? s(2) : ' '; while (x.length < L) x = x + p; return x.slice(0, L); }
        case 'concat': return s(0) + s(1);
        case 'reverse': return a[0] === null ? null : s(0).split('').reverse().join('');
        case 'ascii': return s(0).charCodeAt(0);
        case 'chr': return String.fromCharCode(num(0));
        case 'abs': return a[0] === null ? null : Math.abs(num(0));
        case 'mod': { if (a[0] === null || a[1] === null) return null; const x = num(0), y = num(1); return y === 0 ? x : x - y * Math.trunc(x / y); }
        case 'round': { if (a[0] === null) return null; const d = a.length > 1 ? num(1) : 0, k = Math.pow(10, d); return Math.round((num(0) + Number.EPSILON * Math.sign(num(0))) * k) / k; }
        case 'trunc': { if (a[0] === null) return null; if (typeof a[0] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a[0])) return a[0].slice(0, 10); const d = a.length > 1 ? num(1) : 0, k = Math.pow(10, d); return Math.trunc(num(0) * k) / k; }
        case 'floor': return a[0] === null ? null : Math.floor(num(0));
        case 'ceil': return a[0] === null ? null : Math.ceil(num(0));
        case 'power': return a[0] === null ? null : Math.pow(num(0), num(1));
        case 'sqrt': return a[0] === null ? null : Math.sqrt(num(0));
        case 'sign': return a[0] === null ? null : Math.sign(num(0));
        case 'greatest': return a.some(x => x === null) ? null : a.reduce((m, x) => (x > m ? x : m));
        case 'least': return a.some(x => x === null) ? null : a.reduce((m, x) => (x < m ? x : m));
        case 'nvl': return a[0] === null ? a[1] : a[0];
        case 'nvl2': return a[0] === null ? a[2] : a[1];
        case 'coalesce': return a.find(x => x !== null && x !== undefined) ?? null;
        case 'nullif': return this.cmp('=', a[0], a[1]) ? null : a[0];
        case 'decode': { for (let i = 1; i + 1 < a.length; i += 2) if (a[0] === a[i] || (a[0] === null && a[i] === null)) return a[i + 1]; return a.length % 2 === 0 ? a[a.length - 1] : null; }
        case 'to_char': return a[0] === null ? null : (typeof a[0] === 'number' ? (a.length > 1 && /\./.test(s(1)) ? a[0].toFixed(s(1).split('.')[1].length) : fmtNum(a[0])) : s(0));
        case 'to_number': return a[0] === null ? null : num(0);
        case 'to_date': return s(0);
        case 'sysdate': return new Date().toISOString().slice(0, 10);
        case 'sqlerrm': return this.sqlerr ? this.sqlerr.pmsg : 'ORA-0000: normal, successful completion';
        case 'sqlcode': return this.sqlerr ? this.sqlerr.code : 0;
        case 'dbms_output.put_line': this.emit(s(0)); return null;
      }
      throw new Error("PLS-00201: identifier '" + n.toUpperCase() + "' must be declared");
    }

    /* ---- SQL inside PL/SQL ---- */
    buildSql(toks, src, env, skip) {
      let out = ''; let prevEnd = null;
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        const gap = prevEnd === null ? '' : src.slice(prevEnd, t.start);
        let text = null;
        if (skip && skip.has(i)) { prevEnd = t.end; continue; }
        if (t.t === 'amp') text = sqlLit(this.prompt(t.v));
        else if (t.t === 'id' && !t.quoted || t.t === 'id' && t.bind) {
          const prevDot = i > 0 && toks[i - 1].t === 'op' && toks[i - 1].v === '.';
          const nextDot = toks[i + 1] && toks[i + 1].t === 'op' && toks[i + 1].v === '.' && toks[i + 2] && toks[i + 2].t === 'id';
          const nm = t.v.toLowerCase();
          if (!prevDot) {
            const cell = this.lookupVar(nm, env);
            if (nextDot && cell && cell.value && typeof cell.value === 'object') {
              const f = toks[i + 2].v.toLowerCase(); text = sqlLit(cell.value[f]); i += 2; prevEnd = toks[i].end; out += gap + text; continue;
            }
            if (!nextDot && cell && !(cell.value && typeof cell.value === 'object')) text = sqlLit(cell.value);
          }
        }
        out += gap + (text !== null ? text : src.slice(t.start, t.end)); prevEnd = t.end;
      }
      return out.trim();
    }
    runQuery(s, env) { // s: {toks, src}
      const sql = this.buildSql(s.toks, s.src, env);
      return this.db.one(sql);
    }
    cursorColumns(decl, env) {
      try {
        const e2 = new Env(env); decl.params.forEach(p => e2.vars.set(p.name, { type: {}, value: null }));
        const sql = this.buildSql(decl.q.toks, decl.q.src, e2); const st = this.db.db.prepare(Engine.toSqlite(sql).sql); const c = st.getColumnNames(); st.free(); return c;
      } catch (e) { return []; }
    }
    openCursorQuery(c, args, env) {
      const e2 = new Env(env); const decl = c.decl;
      decl.params.forEach((p, i) => {
        const a = args[i]; let v = a ? this.evalExpr(a.e, env) : (p.def ? this.evalExpr(p.def, env) : null);
        e2.vars.set(p.name, { type: {}, value: v });
      });
      const sql = this.buildSql(decl.q.toks, decl.q.src, e2);
      try { return this.db.one(sql); } catch (e) { throw this.toPlsqlError(e); }
    }
    runRaw(sql) {
      const stmts = Engine.splitStatements(sql);
      for (const st of stmts) this.runSqlText(st);
    }

    runSqlStmt(s, env, top) {
      const first = s.toks[0].u;
      // SELECT ... INTO
      if (first === 'SELECT' && !top) {
        let d = 0, intoAt = -1, fromAt = -1;
        s.toks.forEach((t, i) => { if (t.t === 'op') { if (t.v === '(') d++; else if (t.v === ')') d--; } else if (d === 0 && t.t === 'id' && !t.quoted) { if (t.u === 'INTO' && intoAt < 0) intoAt = i; if (t.u === 'FROM' && fromAt < 0) fromAt = i; } });
        if (intoAt >= 0) {
          const end = fromAt > intoAt ? fromAt : s.toks.length;
          const targets = []; let cur = [];
          for (let i = intoAt + 1; i < end; i++) { const t = s.toks[i]; if (t.t === 'op' && t.v === ',') { targets.push(cur); cur = []; } else cur.push(t); }
          targets.push(cur);
          const skip = new Set(); for (let i = intoAt; i < end; i++) skip.add(i);
          const sql = this.buildSql(s.toks, s.src, env, skip);
          let r;
          try { r = this.db.one(sql); } catch (e) { throw this.toPlsqlError(e); }
          if (r.rows.length === 0) { this.sqlFound = false; this.sqlRows = 0; throw E.NO_DATA_FOUND(); }
          if (r.rows.length > 1) { this.sqlFound = true; this.sqlRows = r.rows.length; throw E.TOO_MANY_ROWS(); }
          this.sqlFound = true; this.sqlRows = 1;
          const row = r.rows[0];
          if (targets.length === 1 && targets[0].length === 1) {
            const cell = this.lookupVar(targets[0][0].v.toLowerCase(), env);
            if (cell && cell.type && cell.type.record) { const o = {}; r.cols.forEach((c, i) => o[c.toLowerCase()] = row[i]); cell.value = o; return; }
          }
          targets.forEach((tt, i) => {
            const tgt = tt.length === 3 ? { t: 'field', base: tt[0].v.toLowerCase(), name: tt[2].v.toLowerCase() } : { t: 'id', name: tt[0].v.toLowerCase() };
            this.assign(tgt, row[i] === undefined ? null : row[i], env);
          });
          return;
        }
      }
      const sql = this.buildSql(s.toks, s.src, env);
      this.runSqlText(sql, top);
    }

    /* execute one SQL statement text (handles triggers for DML, result display at top level) */
    runSqlText(sql, top) {
      const m = /^\s*(insert|update|delete)\b/i.exec(sql);
      try {
        if (m && this.triggers.length) {
          const table = this.dmlTable(sql, m[1].toLowerCase());
          if (table && this.triggers.some(t => t.table === table.toLowerCase())) { const n = this.dmlWithTriggers(sql, m[1].toLowerCase(), table.toLowerCase()); this.sqlRows = n; this.sqlFound = n > 0; if (top) this.msg(n + (m[1].toLowerCase() === 'insert' ? (n === 1 ? ' row created.' : ' rows created.') : m[1].toLowerCase() === 'update' ? (n === 1 ? ' row updated.' : ' rows updated.') : (n === 1 ? ' row deleted.' : ' rows deleted.'))); return; }
        }
        const r = this.db.one(sql);
        if (r.cols) { if (top) this.log.push({ type: 'table', cols: r.cols, rows: r.rows }); return r; }
        this.sqlRows = r.changes; this.sqlFound = r.changes > 0;
        if (top) this.msg(r.msg);
        return r;
      } catch (e) {
        if (e instanceof PlsqlError) throw e;
        throw this.toPlsqlError(e);
      }
    }

    /* ---- triggers (simulated) ---- */
    dmlTable(sql, kind) {
      const re = kind === 'insert' ? /^\s*insert\s+into\s+([A-Za-z_][\w$#]*)/i : kind === 'update' ? /^\s*update\s+([A-Za-z_][\w$#]*)/i : /^\s*delete\s+(?:from\s+)?([A-Za-z_][\w$#]*)/i;
      const m = re.exec(sql); return m ? m[1] : null;
    }
    fireTriggers(table, timing, ev, row, oldRec, newRec, changedCols) {
      for (const tr of this.triggers) {
        if (tr.table !== table || tr.timing !== timing || tr.row !== row) continue;
        const e = tr.events.find(x => x.ev === ev); if (!e) continue;
        if (ev === 'UPDATE' && e.cols && e.cols.length && changedCols && !e.cols.some(c => changedCols.includes(c))) continue;
        const env = new Env(this.global);
        env.vars.set('old', { type: { record: true }, value: oldRec ? oldRec : this.nullRec(table) });
        env.vars.set('new', { type: { record: true }, value: newRec ? newRec : this.nullRec(table) });
        env.vars.set('inserting', { type: {}, value: ev === 'INSERT' }); env.vars.set('updating', { type: {}, value: ev === 'UPDATE' }); env.vars.set('deleting', { type: {}, value: ev === 'DELETE' });
        env.vars.set('__changed', { type: {}, value: changedCols || [] });
        if (tr.when) { const w = this.evalExpr(tr.when, env); if (!this.truthy(w)) continue; }
        this.runBlock(tr.block, env);
      }
    }
    nullRec(table) { const r = {}; this.tableColumns(table).forEach(c => r[c.name.toLowerCase()] = null); return r; }
    dmlWithTriggers(sql, kind, table) {
      const db = this.db.db; const cols = this.tableColumns(table).map(c => c.name);
      const lc = cols.map(c => c.toLowerCase()); let count = 0;
      db.run('SAVEPOINT plsql_dml');
      try {
        const EV = kind.toUpperCase();
        this.fireTriggers(table, 'BEFORE', EV, false, null, null);
        if (kind === 'insert') {
          const mm = /^\s*insert\s+into\s+\S+\s*(\(([^)]*)\))?\s*(values|select)\b([\s\S]*)$/i.exec(sql);
          if (!mm) throw new Error('Trigger simulator: unsupported INSERT form');
          const named = mm[2] ? mm[2].split(',').map(x => x.trim().toLowerCase()) : lc;
          let rows;
          if (mm[3].toLowerCase() === 'values') { const r = this.db.one('SELECT ' + mm[4].trim().replace(/^\(/, '').replace(/\)\s*;?\s*$/, '')); rows = r.rows; }
          else rows = this.db.one('SELECT ' + mm[4]).rows;
          for (const vals of rows) {
            const nrec = {}; lc.forEach(c => nrec[c] = null); named.forEach((c, i) => nrec[c] = vals[i] === undefined ? null : vals[i]);
            this.fireTriggers(table, 'BEFORE', EV, true, null, nrec);
            const ph = lc.map(() => '?').join(',');
            db.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph})`, lc.map(c => nrec[c]));
            this.fireTriggers(table, 'AFTER', EV, true, null, nrec); count++;
          }
        } else if (kind === 'update') {
          const mm = /^\s*update\s+\S+\s+set\s+([\s\S]*?)(\s+where\s+([\s\S]*))?$/i.exec(sql);
          if (!mm) throw new Error('Trigger simulator: unsupported UPDATE form');
          const sets = splitTop(mm[1]).map(x => { const i = x.indexOf('='); return { col: x.slice(0, i).trim().toLowerCase(), expr: x.slice(i + 1).trim() }; });
          const where = mm[3] ? ' WHERE ' + mm[3] : '';
          const r = this.db.one(`SELECT rowid AS _rid, ${cols.join(',')} FROM ${table}${where}`);
          for (const row of r.rows) {
            const rid = row[0]; const orec = {}; lc.forEach((c, i) => orec[c] = row[i + 1]); const nrec = Object.assign({}, orec);
            for (const sset of sets) { nrec[sset.col] = this.db.one(`SELECT ${sset.expr} FROM ${table} WHERE rowid = ${rid}`).rows[0][0]; }
            this.fireTriggers(table, 'BEFORE', EV, true, orec, nrec, sets.map(x => x.col));
            db.run(`UPDATE ${table} SET ${cols.map(c => c + '=?').join(',')} WHERE rowid=?`, lc.map(c => nrec[c]).concat([rid]));
            this.fireTriggers(table, 'AFTER', EV, true, orec, nrec, sets.map(x => x.col)); count++;
          }
        } else {
          const mm = /^\s*delete\s+(?:from\s+)?\S+(\s+where\s+([\s\S]*))?$/i.exec(sql);
          const where = mm && mm[2] ? ' WHERE ' + mm[2] : '';
          const r = this.db.one(`SELECT rowid AS _rid, ${cols.join(',')} FROM ${table}${where}`);
          for (const row of r.rows) {
            const rid = row[0]; const orec = {}; lc.forEach((c, i) => orec[c] = row[i + 1]);
            this.fireTriggers(table, 'BEFORE', EV, true, orec, null);
            db.run(`DELETE FROM ${table} WHERE rowid=?`, [rid]);
            this.fireTriggers(table, 'AFTER', EV, true, orec, null); count++;
          }
        }
        this.fireTriggers(table, 'AFTER', EV, false, null, null);
        db.run('RELEASE plsql_dml');
        return count;
      } catch (e) {
        try { db.run('ROLLBACK TO plsql_dml; RELEASE plsql_dml'); } catch (e2) { }
        throw e;
      }
    }
  }

  function splitTop(s) {
    const out = []; let d = 0, cur = '', inS = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inS) { cur += c; if (c === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else inS = false; } continue; }
      if (c === "'") { inS = true; cur += c; continue; }
      if (c === '(') d++; if (c === ')') d--;
      if (c === ',' && d === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur); return out;
  }

  // 'lit' expression node used when calling stored functions from SQL
  const origEval = Session.prototype.evalExpr;
  Session.prototype.evalExpr = function (e, env) { if (e.t === 'lit') return e.v; return origEval.call(this, e, env); };

  const Plsql = { Session, Parser, tokenize, PlsqlError };
  G.Plsql = Plsql;
  if (typeof module !== 'undefined') module.exports = Plsql;
})(typeof window !== 'undefined' ? window : globalThis);
