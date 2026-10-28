/* Tiny helpers for writing lesson content */
window.D = {
  h: t => ({ k: 'h', t }), h3: t => ({ k: 'h3', t }), p: t => ({ k: 'p', t }),
  list: (...items) => ({ k: 'list', items }), olist: (...items) => ({ k: 'list', items, ordered: true }),
  sql: (t, o) => Object.assign({ k: 'code', lang: 'sql', t }, o || {}),
  pl: (t, o) => Object.assign({ k: 'code', lang: 'plsql', t }, o || {}),
  tip: t => ({ k: 'callout', kind: 'tip', t }), trap: t => ({ k: 'callout', kind: 'trap', t }),
  exam: t => ({ k: 'callout', kind: 'exam', t }), note: t => ({ k: 'callout', kind: 'note', t }),
  table: (head, rows) => ({ k: 'table', head, rows }), cmp: (a, b) => ({ k: 'cmp', a, b }),
  flow: (...steps) => ({ k: 'flow', steps }), normlab: preset => ({ k: 'normlab', preset })
};
