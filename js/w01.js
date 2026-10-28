(function () {
  const { h, h3, p, list, olist, sql, tip, trap, exam, note, table, cmp, flow, normlab } = D;
  Weeks.push({
    id: 'w1', num: 1, nav: 'Normalization', title: 'Functional Dependencies & Normalization', lab: 'Class exercises', time: '35 min',
    summary: 'How to decide whether a table design is good: attribute closure, candidate keys, BCNF/3NF, and lossless decomposition.',
    blurb: 'Closure, keys, BCNF/3NF, lossless joins – the pen-and-paper part of the exam.',
    tldr: [
      '**FD** `X → Y`: if two rows agree on X they must agree on Y.',
      '**Closure X⁺** = every attribute you can reach from X using the FDs. If X⁺ = all attributes, X is a **superkey**.',
      '**Candidate key** = a minimal superkey. Attributes that never appear on a right-hand side are in *every* key.',
      '**BCNF**: for every non-trivial FD `X → Y`, X must be a superkey. **3NF**: …or Y is a *prime* attribute (part of some key).',
      'A decomposition is **lossless** if `R1 ∩ R2` is a key of R1 or R2.'
    ],
    lesson: [
      h('Why bother? Anomalies'),
      p('A badly designed table repeats facts. Say `Enrol(student, course, instructor, instructor_office)`. The office is stored once per *row*, not once per instructor:'),
      list('**Update anomaly** – change an office and you must edit many rows (miss one → inconsistent data).', '**Insert anomaly** – you cannot record a new instructor until they teach a course.', '**Delete anomaly** – deleting the last enrolment also deletes the instructor’s office.'),
      p('Normalization = splitting the table along its functional dependencies until these go away.'),

      h('Functional dependencies'),
      p('`X → Y` reads “X determines Y”. Example: `regno → name, dept` (same reg. no. ⇒ same name & dept). It is a rule about *all possible data*, not about the rows you see today.'),
      table(['Rule (Armstrong)', 'Meaning', 'Use it for'], [
        ['Reflexivity', 'if `Y ⊆ X` then `X → Y`', 'trivial FDs like `AB → A`'],
        ['Augmentation', '`X → Y` ⇒ `XZ → YZ`', 'adding the same attributes both sides'],
        ['Transitivity', '`X → Y` and `Y → Z` ⇒ `X → Z`', 'chaining FDs'],
        ['Union / Decomposition', '`X→Y, X→Z` ⇔ `X→YZ`', 'splitting/merging right sides']]),
      note('You almost never apply the axioms by hand. You compute **closures** (next section) – it is faster and mistake-proof.'),

      h('Attribute closure  X⁺  (the one skill you must have)'),
      flow('start with X', 'find an FD whose LEFT side ⊆ current set', 'add its RIGHT side', 'repeat until nothing new'),
      p('**Worked example** – R(A,B,C,D) with `AB→C, BC→D, CD→A`. Find `AB⁺`:'),
      table(['Step', 'Current set', 'Why'], [['0', '{A, B}', 'start'], ['1', '{A, B, C}', '`AB → C` applies (AB ⊆ set)'], ['2', '{A, B, C, D}', '`BC → D` applies (BC ⊆ set)'], ['—', 'all four attributes', 'so `AB⁺ = ABCD` → **AB is a superkey**']]),
      normlab({ R: 'ABCD', fds: 'AB->C; BC->D; CD->A', X: 'AB' }),

      h('Keys'),
      list('**Superkey** – any set whose closure is *all* attributes.', '**Candidate key** – a superkey with no removable attribute (minimal).', '**Prime attribute** – belongs to at least one candidate key.'),
      p('**Shortcut to find keys fast:** attributes that appear on **no right-hand side** must be in every key. Start with them, add attributes until the closure is everything, then check for other minimal sets.'),
      exam('Exam answer format: “Attributes not on any RHS: {A, D}. AD⁺ = ABCDE ⇒ AD is the only candidate key.” Show the closure steps – marks are for the method.'),

      h('Normal forms – one line each'),
      table(['Form', 'Rule', 'Violated by'], [
        ['1NF', 'every cell holds one atomic value', 'a “phones” column storing `98.., 97..`'],
        ['2NF', '1NF + no **partial** dependency (non-prime attr depending on *part* of a key)', 'key `(student, course)` but `student → name`'],
        ['3NF', '2NF + no **transitive** dependency: for `X→A`, X is a superkey **or A is prime**', '`dept → hod` in `Emp(id, dept, hod)`'],
        ['BCNF', 'for every non-trivial `X→A`, **X is a superkey** (no exception)', 'any FD whose left side is not a key']]),
      tip('BCNF ⊂ 3NF ⊂ 2NF ⊂ 1NF. If a table is in BCNF it is automatically in 3NF. The *only* gap between them: an FD `X→A` where X is not a key but A is prime.'),
      trap('“Is R in BCNF?” → check **every** FD in F (and what it implies), not just the first one. One violation is enough to say *No*.'),

      h('BCNF decomposition algorithm'),
      olist('Find a violating FD `X → Y` (X not a superkey).', 'Compute `X⁺`. Split R into **R1 = X⁺** and **R2 = X ∪ (R − X⁺)**.', 'Repeat on R1 and R2 (using the FDs that still fit inside each) until all pieces are in BCNF.'),
      p('**Class exercise 2 worked:** R(A,B,C,D,E), `AB→C, D→E, DE→B`. Key = **AD** (A and D are on no RHS; AD⁺ = ABCDE). `AB→C` violates BCNF (AB is not a superkey) ⇒ R1 = (A,B,C), R2 = (A,B,D,E). In R2, `D → B,E` still violates ⇒ split into (B,D,E) and (A,D). **Result: {ABC, BDE, AD}.** (Splitting on `D→BE` first gives {BDE, ACD} – also correct. BCNF answers aren’t unique.)'),

      h('Is a decomposition good?'),
      table(['Property', 'Question', 'Test'], [
        ['Lossless join', 'can we rebuild R exactly by joining the pieces?', 'for R1, R2: `R1 ∩ R2 → R1` or `R1 ∩ R2 → R2` must follow from F (closure!)'],
        ['Dependency preserving', 'can every FD still be checked inside one piece?', 'each FD’s attributes lie together in some Ri (or follow from projected FDs)']]),
      p('**Class exercise 1(c):** R(A,B,C,D), F = `AB→C, BC→D, CD→A`, split into R1(A,B,C) and R2(A,C,D). Common part = `{A, C}`. `AC⁺ = AC` (nothing fires) – it determines neither R1 nor R2 ⇒ **lossy: not a good decomposition.** (It also loses `BC → D`.)'),
      trap('BCNF decompositions are always lossless but may **lose dependencies**. 3NF can always be both lossless *and* dependency-preserving – that is why 3NF exists.'),
      tip('Use the lab above → “Check decomposition”: it runs the chase algorithm and shows the table. A row full of “a” symbols means lossless.')
    ],
    cheat: [
      ['closure', 'X⁺: repeat { if Lhs ⊆ X⁺ then X⁺ ∪= Rhs } until no change'],
      ['keys', 'attrs on no RHS ∈ every key; X is superkey ⇔ X⁺ = R'],
      ['BCNF', 'every non-trivial X→A has X superkey'],
      ['3NF', 'BCNF, or A is prime'],
      ['BCNF split', 'violating X→Y: R1 = X⁺, R2 = X ∪ (R − X⁺)'],
      ['lossless', 'R1 ∩ R2 → R1  or  R1 ∩ R2 → R2']
    ],
    sheetTitle: 'Class Exercise Questions',
    scenario: 'The three class exercises from the sheet, with answers checked by the built-in closure engine. Show your working on paper like you would in the exam (use the lab above to verify).',
    practice: [
      { id: 'e1a', type: 'calc', kind: 'set', R: 'ABCD', fds: 'AB->C; BC->D; CD->A', q: '**Exercise 1(a)** Find the closure of **AB**.', solve: (R, f, N) => N.closure('AB', f), hint: 'AB → C gives C; then BC → D gives D.', worked: '`AB → C` (+C), `BC → D` (+D) ⇒ AB⁺ = ABCD, so AB is a superkey.' },
      { id: 'e1b', type: 'calc', kind: 'keys', R: 'ABCD', fds: 'AB->C; BC->D; CD->A', q: '**Exercise 1** List all **candidate keys** of R.', solve: (R, f, N) => N.candidateKeys(R, f), hint: 'B is on no right-hand side, so every key contains B. Try AB, BC, BD, CD…', worked: 'B is on no RHS ⇒ in every key. AB⁺ = ABCD ✔, BC⁺ = BCDA ✔ (BC→D, CD→A), BD⁺ = BD ✘. Keys: **AB, BC**.' },
      { id: 'e1c', type: 'calc', kind: 'bool', R: 'ABCD', fds: 'AB->C; BC->D; CD->A', q: '**Exercise 1(b)** Is R in **BCNF** (a “good schema”)?', solve: (R, f, N) => N.isBCNF(R, f), worked: 'No. `CD → A`: CD⁺ = CDA, not all of R, so CD is not a superkey – BCNF violated. (It *is* in 3NF, because A is prime.)' },
      { id: 'e1d', type: 'calc', kind: 'bool', R: 'ABCD', fds: 'AB->C; BC->D; CD->A', q: '**Exercise 1** Is R in **3NF**?', solve: (R, f, N) => N.is3NF(R, f), hint: 'For the violating FD CD → A: is A a prime attribute?', worked: 'Yes. The only BCNF violation is `CD → A`, and A belongs to key AB ⇒ A is prime ⇒ allowed in 3NF.' },
      { id: 'e1e', type: 'calc', kind: 'bool', R: 'ABCD', fds: 'AB->C; BC->D; CD->A', q: '**Exercise 1(c)** Decompose R into R1(A,B,C) and R2(A,C,D). Is this a **lossless** decomposition?', solve: (R, f, N) => N.chase(R, f, ['ABC', 'ACD']).lossless, hint: 'R1 ∩ R2 = AC. Compute AC⁺ – does it contain all of R1 or all of R2?', worked: 'AC⁺ = AC. It is not a key of R1 or R2 ⇒ **lossy**. The join would invent extra rows. (Also `BC → D` is lost.)' },
      { id: 'e2a', type: 'calc', kind: 'keys', R: 'ABCDE', fds: 'AB->C; D->E; DE->B', q: '**Exercise 2** Find the candidate key(s) of R(A,B,C,D,E).', solve: (R, f, N) => N.candidateKeys(R, f), hint: 'Which attributes are never on a right-hand side?', worked: 'A and D appear on no RHS ⇒ in every key. AD⁺: D→E gives E, DE→B gives B, AB→C gives C ⇒ ABCDE. Key: **AD**.' },
      { id: 'e2b', type: 'calc', kind: 'bool', R: 'ABCDE', fds: 'AB->C; D->E; DE->B', q: '**Exercise 2** Is R in BCNF?', solve: (R, f, N) => N.isBCNF(R, f), worked: 'No. Key is AD, but `AB → C` has LHS AB (AB⁺ = ABC ≠ R) – not a superkey. Also `D → E` violates.' },
      { id: 'e2c', type: 'mcq', q: '**Exercise 2** Which is a correct BCNF decomposition of R(A,B,C,D,E) with `AB→C, D→E, DE→B`?', opts: ['{ABC, BDE, AD}', '{ABC, ABDE}', '{AB, CD, E}', '{ABCDE} – already in BCNF'], a: 0, shuffle: true, why: '`AB→C` and `D→BE` are the violations. Splitting on AB→C gives ABC + ABDE; ABDE still has `D→BE` (D not a key of ABDE) ⇒ split to BDE + AD. Each piece has a key as its LHS ⇒ BCNF. (Option 2 stops too early; option 3 is lossy.) {BDE, ACD} is another valid answer.' },
      { id: 'e3a', type: 'calc', kind: 'keys', R: 'ABCDE', fds: 'A->BC; CD->E; B->D; E->A', q: '**Exercise 3** R(A,B,C,D,E) with `A→BC, CD→E, B→D, E→A`. List all **candidate keys**.', solve: (R, f, N) => N.candidateKeys(R, f), hint: 'Every attribute is on some RHS, so keys can be small. Try single attributes first: A⁺, B⁺, C⁺, D⁺, E⁺.', worked: 'A⁺ = ABCDE ✔ (A→BC, B→D, CD→E). E⁺ = EA… = ABCDE ✔ (E→A). BC⁺ = BCD→E→A ✔. CD⁺ = CDE→A→B ✔. Keys: **A, E, BC, CD**.' },
      { id: 'e3b', type: 'calc', kind: 'set', R: 'ABCDE', fds: 'A->BC; CD->E; B->D; E->A', q: '**Exercise 3** Compute **B⁺** (part of building the closure F⁺).', solve: (R, f, N) => N.closure('B', f), worked: 'B → D gives D. D alone fires nothing (CD→E needs C). B⁺ = {B, D}.' },
      { id: 'e3c', type: 'calc', kind: 'bool', R: 'ABCDE', fds: 'A->BC; CD->E; B->D; E->A', q: '**Exercise 3** Is R in BCNF?', solve: (R, f, N) => N.isBCNF(R, f), worked: 'No. `B → D`: B⁺ = BD – not a superkey. Violation. (3NF? D is non-prime? D is in key CD ⇒ prime ⇒ it **is** in 3NF.)' },
      { id: 'dr', type: 'mcq', q: 'Without computing anything: a relation has FDs `X → Y` where **every LHS is a candidate key**. Which is the strongest statement?', opts: ['It is in BCNF', 'It is only in 3NF', 'It may have update anomalies', 'It is not in 2NF'], a: 0, why: 'BCNF’s rule is literally “every LHS is a superkey”. Keys are superkeys ⇒ BCNF.' }
    ],
    quiz: [
      { q: 'Given `A → B` and `B → C`, which FD is always true?', opts: ['A → C', 'C → A', 'B → A', 'AC → B only'], a: 0, why: 'Transitivity.' },
      { q: 'Which FD is **trivial**?', opts: ['AB → A', 'A → AB', 'A → B', 'AB → C'], a: 0, why: 'Trivial means the right side is a subset of the left side (reflexivity).' },
      { q: 'R(A,B,C,D) with F = {A→B, B→C}. Attribute D is on no RHS. Therefore…', opts: ['D is in every candidate key', 'D is in no candidate key', 'D is a non-prime attribute', 'R has no key'], a: 0, why: 'Nothing can derive D, so any key must include it. Here key = AD.' },
      { q: 'What is the difference between 3NF and BCNF?', opts: ['3NF also allows `X → A` when A is prime and X is not a superkey', 'BCNF allows partial dependencies', 'There is no difference', '3NF requires all attributes to be prime'], a: 0, why: 'That single exception is the whole gap.' },
      { q: 'You decompose R into R1 and R2. The join is lossless when…', opts: ['R1 ∩ R2 is a key of R1 or R2', 'R1 and R2 have no common attribute', 'R1 and R2 have the same number of attributes', 'every FD is stored in R1'], a: 0, why: 'A common part that is a key of one side makes the join recreate exactly the original rows.' },
      { q: '`Enrol(student, course, student_name)` with key (student, course) and `student → student_name`. Highest normal form?', opts: ['1NF (partial dependency)', '2NF', '3NF', 'BCNF'], a: 0, why: 'student_name depends on only part of the key ⇒ not in 2NF ⇒ only 1NF.' },
      { q: 'True or false: every BCNF decomposition preserves all functional dependencies.', opts: ['False – BCNF can lose dependencies', 'True – always'], a: 0, why: 'Example: Exercise 2 – splitting on D→BE separates A,B (needed for AB→C).' }
    ]
  });
})();
