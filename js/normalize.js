/* ============================================================
   Normalization toolkit: FD closure, keys, BCNF/3NF, lossless join
   Attributes are single letters (A,B,C...) – sets are sorted strings
   ============================================================ */
(function (G) {
  'use strict';
  const N = {};
  const uniq = (s) => Array.from(new Set(s.toUpperCase().replace(/[^A-Z]/g, '').split(''))).sort().join('');
  const sub = (a, b) => [...a].every(c => b.includes(c));          // a ⊆ b
  const union = (a, b) => uniq(a + b);
  const minus = (a, b) => [...a].filter(c => !b.includes(c)).join('');
  N.uniq = uniq;

  // "AB->C; C->D,E"  ->  [{l:'AB', r:'C'}, ...]
  N.parseFDs = function (txt) {
    const out = [];
    txt.split(/[;\n]+/).map(x => x.trim()).filter(Boolean).forEach(line => {
      const m = /^\{?([A-Za-z, ]+?)\s*(?:->|→|-->|=>)\s*([A-Za-z, ]+?)\}?$/.exec(line);
      if (!m) throw new Error('Cannot read FD: "' + line + '" (write like AB->C)');
      const l = uniq(m[1]), r = uniq(m[2]);
      if (!l || !r) throw new Error('Empty side in FD: "' + line + '"');
      out.push({ l, r });
    });
    return out;
  };
  N.fdStr = (f) => f.l + ' → ' + f.r;

  // closure with step trace
  N.closure = function (X, fds, trace) {
    let res = uniq(X); let changed = true;
    if (trace) trace.push({ set: res, why: 'start with ' + res });
    while (changed) {
      changed = false;
      for (const f of fds) {
        if (sub(f.l, res) && !sub(f.r, res)) {
          const add = minus(f.r, res); res = union(res, f.r); changed = true;
          if (trace) trace.push({ set: res, why: `${f.l} ⊆ current, so ${f.l} → ${f.r} adds ${add}` });
        }
      }
    }
    return res;
  };

  const subsets = function* (attrs) {
    const n = attrs.length;
    for (let m = 1; m < (1 << n); m++) { let s = ''; for (let i = 0; i < n; i++) if (m & (1 << i)) s += attrs[i]; yield s; }
  };

  N.isSuperkey = (X, R, fds) => sub(R, N.closure(X, fds));
  N.candidateKeys = function (R, fds) {
    R = uniq(R);
    const keys = [];
    // attributes never on RHS must be in every key; start from them
    const rhs = fds.map(f => f.r).join('');
    const must = [...R].filter(c => !rhs.includes(c)).join('');
    const rest = minus(R, must);
    const all = [...subsets(rest)]; all.unshift('');
    all.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    for (const s of all) {
      const cand = uniq(must + s);
      if (!cand) continue;
      if (keys.some(k => sub(k, cand))) continue;
      if (N.isSuperkey(cand, R, fds)) keys.push(cand);
    }
    return keys;
  };

  // all FDs of F+ restricted to R' (projection) – singleton-closure version: X -> (X+ ∩ R') \ X for each subset X of R'
  N.project = function (Rp, fds) {
    const out = [];
    for (const X of subsets(Rp)) {
      const c = N.closure(X, fds); const r = minus([...c].filter(a => Rp.includes(a)).join(''), X);
      if (r) out.push({ l: X, r: uniq(r) });
    }
    return out;
  };
  // minimal-ish cover of projected FDs to keep display small (drop FDs implied by others of smaller LHS)
  N.reduceFDs = function (fds) {
    const out = [];
    const sorted = [...fds].sort((a, b) => a.l.length - b.l.length);
    for (const f of sorted) {
      // split RHS into single attrs not already derivable from out
      const cl = N.closure(f.l, out);
      const need = minus(f.r, cl);
      if (need) out.push({ l: f.l, r: uniq(need) });
    }
    return out;
  };

  N.bcnfViolations = function (R, fds) {
    const v = [];
    for (const f of fds) {
      const lhsC = N.closure(f.l, fds);
      const nontrivial = minus(f.r, f.l);
      if (nontrivial && sub(f.l, R) && !sub(R, lhsC)) v.push(f);
    }
    return v;
  };
  N.isBCNF = (R, fds) => N.bcnfViolations(R, fds).length === 0;
  N.is3NF = function (R, fds) {
    const keys = N.candidateKeys(R, fds); const prime = uniq(keys.join(''));
    for (const f of fds) {
      const nt = minus(f.r, f.l); if (!nt) continue;
      if (N.isSuperkey(f.l, R, fds)) continue;
      if (![...nt].every(a => prime.includes(a))) return false;
    }
    return true;
  };

  // BCNF decomposition (textbook algorithm) with steps
  N.bcnfDecompose = function (R, fds) {
    R = uniq(R); const steps = []; let result = [R]; let guard = 0;
    for (; ;) {
      if (++guard > 30) break;
      let found = null;
      for (const Ri of result) {
        const local = N.reduceFDs(N.project(Ri, fds));
        const viol = N.bcnfViolations(Ri, local);
        if (viol.length) { found = { Ri, f: viol[0], local }; break; }
      }
      if (!found) break;
      const { Ri, f } = found;
      const Xplus = [...N.closure(f.l, fds)].filter(a => Ri.includes(a)).join('');
      const R1 = uniq(Xplus), R2 = uniq(f.l + minus(Ri, Xplus));
      steps.push({ split: Ri, fd: f, R1, R2 });
      result = result.filter(r => r !== Ri).concat([R1, R2]);
    }
    return { relations: result, steps };
  };

  // lossless join via chase
  N.chase = function (R, fds, rels) {
    R = uniq(R); const attrs = [...R];
    const tab = rels.map((r, i) => { const row = {}; attrs.forEach(a => row[a] = r.includes(a) ? 'a' + a : 'b' + (i + 1) + a); return row; });
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of fds) {
        for (let i = 0; i < tab.length; i++) for (let j = i + 1; j < tab.length; j++) {
          if ([...f.l].every(a => tab[i][a] === tab[j][a])) {
            for (const a of f.r) {
              if (tab[i][a] !== tab[j][a]) {
                const keep = tab[i][a].startsWith('a') ? tab[i][a] : tab[j][a].startsWith('a') ? tab[j][a] : (tab[i][a] < tab[j][a] ? tab[i][a] : tab[j][a]);
                const drop = keep === tab[i][a] ? tab[j][a] : tab[i][a];
                tab.forEach(row => { if (row[a] === drop) row[a] = keep; }); changed = true;
              }
            }
          }
        }
      }
    }
    const lossless = tab.some(row => attrs.every(a => row[a] === 'a' + a));
    return { lossless, table: tab, attrs };
  };

  // dependency preservation: for every FD X->Y check Y ⊆ closure_G(X) using only projected FDs
  N.preserved = function (R, fds, rels) {
    const lost = [];
    for (const f of fds) {
      let z = f.l; let ch = true;
      while (ch) {
        ch = false;
        for (const Ri of rels) {
          const inter = [...z].filter(a => Ri.includes(a)).join('');
          if (!inter) continue;
          const cl = N.closure(inter, fds);
          const add = [...cl].filter(a => Ri.includes(a)).join('');
          const nz = union(z, add); if (nz !== z) { z = nz; ch = true; }
        }
      }
      if (!sub(f.r, z)) lost.push(f);
    }
    return { preserved: lost.length === 0, lost };
  };

  // all-subsets closure table  (for "F+ summary")
  N.closureTable = function (R, fds) {
    const rows = [];
    for (const X of subsets(uniq(R))) rows.push({ X, plus: N.closure(X, fds) });
    return rows;
  };

  /* ---------- random drill generator ---------- */
  N.randomProblem = function (rng) {
    rng = rng || Math.random;
    const pick = (a) => a[Math.floor(rng() * a.length)];
    for (let tries = 0; tries < 200; tries++) {
      const n = 4 + Math.floor(rng() * 2); const R = 'ABCDE'.slice(0, n); const fds = []; const k = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < k; i++) {
        const ls = 1 + Math.floor(rng() * 2); let l = ''; while (uniq(l).length < ls) l += pick([...R]);
        let r = pick([...R]); l = uniq(l); r = uniq(r);
        if (sub(r, l)) continue;
        if (!fds.some(f => f.l === l && f.r === r)) fds.push({ l, r });
      }
      if (fds.length < 3) continue;
      const keys = N.candidateKeys(R, fds);
      if (keys.length > 4 || keys.some(k => k.length === R.length)) continue;
      return { R, fds, fdText: fds.map(f => f.l + '->' + f.r).join('; ') };
    }
    return { R: 'ABCD', fds: N.parseFDs('AB->C;C->D;D->A'), fdText: 'AB->C; C->D; D->A' };
  };

  G.Norm = N;
  if (typeof module !== 'undefined') module.exports = N;
})(typeof window !== 'undefined' ? window : globalThis);
