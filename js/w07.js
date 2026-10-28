(function () {
  const { h, h3, p, list, olist, sql, tip, trap, exam, note, table, cmp, flow } = D;
  const DS = `
CREATE TABLE Faculty (fid NUMBER PRIMARY KEY, fname VARCHAR2(15), deptid NUMBER);
CREATE TABLE Class (name VARCHAR2(15) PRIMARY KEY, meets_at VARCHAR2(6), room VARCHAR2(6), fid NUMBER REFERENCES Faculty);
CREATE TABLE Student (snum NUMBER PRIMARY KEY, sname VARCHAR2(15), major VARCHAR2(10), level VARCHAR2(2), age NUMBER(3));
CREATE TABLE Enrolled (snum NUMBER REFERENCES Student, cname VARCHAR2(15) REFERENCES Class);
INSERT INTO Faculty VALUES (1,'Ravi',10); INSERT INTO Faculty VALUES (2,'Meena',10); INSERT INTO Faculty VALUES (3,'Kumar',20);
INSERT INTO Faculty VALUES (4,'Latha',20); INSERT INTO Faculty VALUES (5,'Suresh',30);
INSERT INTO Class VALUES ('DBMS','10:00','R128',1); INSERT INTO Class VALUES ('OS','10:00','R101',1);
INSERT INTO Class VALUES ('AI','11:00','R128',2); INSERT INTO Class VALUES ('Networks','11:00','R202',3);
INSERT INTO Class VALUES ('Maths','09:00','R128',3); INSERT INTO Class VALUES ('Statistics','14:00','R101',3);
INSERT INTO Class VALUES ('Physics','09:00','R101',4); INSERT INTO Class VALUES ('History101','13:00','R128',5);
INSERT INTO Student VALUES (1,'Arun','CS','JR',20); INSERT INTO Student VALUES (2,'Bala','History','SR',22);
INSERT INTO Student VALUES (3,'Chitra','CS','JR',19); INSERT INTO Student VALUES (4,'Deepa','Maths','SO',18);
INSERT INTO Student VALUES (5,'Esha','History','JR',21); INSERT INTO Student VALUES (6,'Farhan','CS','FR',18);
INSERT INTO Student VALUES (7,'Gita','Physics','SO',19); INSERT INTO Student VALUES (8,'Hari','Maths','FR',18);
INSERT INTO Student VALUES (9,'Indu','CS','SR',23); INSERT INTO Student VALUES (10,'Jai','History','FR',18);
INSERT INTO Enrolled VALUES (1,'DBMS'); INSERT INTO Enrolled VALUES (1,'OS'); INSERT INTO Enrolled VALUES (3,'OS');
INSERT INTO Enrolled VALUES (3,'Networks'); INSERT INTO Enrolled VALUES (2,'History101'); INSERT INTO Enrolled VALUES (2,'AI');
INSERT INTO Enrolled VALUES (5,'History101'); INSERT INTO Enrolled VALUES (5,'Networks'); INSERT INTO Enrolled VALUES (9,'Networks');
INSERT INTO Enrolled VALUES (9,'DBMS'); INSERT INTO Enrolled VALUES (9,'Maths'); INSERT INTO Enrolled VALUES (7,'Physics');
INSERT INTO Enrolled VALUES (4,'Maths'); INSERT INTO Enrolled VALUES (4,'Networks'); INSERT INTO Enrolled VALUES (6,'Networks');
-- lecture / practice sheet tables
CREATE TABLE stu (regno NUMBER, name VARCHAR2(10), cgpa NUMBER(3,1));
INSERT INTO stu VALUES (101,'sai',7.3); INSERT INTO stu VALUES (102,'jai',8.2); INSERT INTO stu VALUES (103,NULL,8.9);
INSERT INTO stu VALUES (104,'raj',9.9); INSERT INTO stu VALUES (106,'david',9.5);
CREATE TABLE stu_hobby (regno NUMBER, hobby VARCHAR2(10));
INSERT INTO stu_hobby VALUES (101,'reading'); INSERT INTO stu_hobby VALUES (102,'playing'); INSERT INTO stu_hobby VALUES (102,'singing');
INSERT INTO stu_hobby VALUES (104,NULL); INSERT INTO stu_hobby VALUES (105,'rahul');
CREATE TABLE Sailors (sid NUMBER PRIMARY KEY, sname VARCHAR2(10), rating NUMBER, age NUMBER(4,1));
CREATE TABLE Boats (bid NUMBER PRIMARY KEY, bname VARCHAR2(10), color VARCHAR2(6));
CREATE TABLE Reserves (sid NUMBER, bid NUMBER, day VARCHAR2(10));
INSERT INTO Sailors VALUES (22,'Dustin',7,45); INSERT INTO Sailors VALUES (29,'Brutus',1,33); INSERT INTO Sailors VALUES (31,'Lubber',8,55.5);
INSERT INTO Sailors VALUES (32,'Andy',8,25.5); INSERT INTO Sailors VALUES (58,'Rusty',10,35); INSERT INTO Sailors VALUES (64,'Horatio',7,35);
INSERT INTO Sailors VALUES (71,'Zorba',10,16); INSERT INTO Sailors VALUES (74,'Horatio',9,35); INSERT INTO Sailors VALUES (85,'Art',3,25.5); INSERT INTO Sailors VALUES (95,'Bob',3,63.5);
INSERT INTO Boats VALUES (101,'Interlake','blue'); INSERT INTO Boats VALUES (102,'Interlake','red'); INSERT INTO Boats VALUES (103,'Clipper','green'); INSERT INTO Boats VALUES (104,'Marine','red');
INSERT INTO Reserves VALUES (22,101,'1998-10-10'); INSERT INTO Reserves VALUES (22,102,'1998-10-10'); INSERT INTO Reserves VALUES (22,103,'1998-08-10'); INSERT INTO Reserves VALUES (22,104,'1998-07-10');
INSERT INTO Reserves VALUES (31,102,'1998-10-11'); INSERT INTO Reserves VALUES (31,103,'1998-06-11'); INSERT INTO Reserves VALUES (31,104,'1998-12-11');
INSERT INTO Reserves VALUES (64,101,'1998-05-09'); INSERT INTO Reserves VALUES (64,102,'1998-08-09'); INSERT INTO Reserves VALUES (74,103,'1998-08-09');
`.trim();

  Weeks.push({
    id: 'w7', num: 7, nav: 'Subqueries', title: 'Nested Subqueries & Set Operations', lab: 'Lab sheet 7', time: '55 min',
    summary: 'A query inside a query: IN / NOT IN, comparison with a single value, ANY/ALL, EXISTS, correlated subqueries, subqueries in FROM/HAVING, and UNION / INTERSECT / MINUS.',
    blurb: 'IN · NOT IN · ANY/ALL · EXISTS · correlated · UNION / INTERSECT / MINUS.',
    tldr: [
      'Inner query runs first (uncorrelated) and hands a **value** (`=`, `<`…) or a **list** (`IN`, `ANY`, `ALL`) to the outer query.',
      '`> ALL (…)` = bigger than every one · `> ANY/SOME (…)` = bigger than at least one. “Highest” ⇒ `>= ALL`.',
      '`EXISTS (subquery)` is true if it returns ≥ 1 row. **Correlated** = the inner query uses a column of the outer row (runs once per outer row).',
      '**NOT IN + a NULL in the list returns no rows at all.** Use `NOT EXISTS` when NULLs are possible.',
      'Set operations (`UNION`, `INTERSECT`, `MINUS`) need the same number/type of columns; `UNION` removes duplicates (`UNION ALL` keeps them).'
    ],
    lesson: [
      h('Where a subquery can sit'),
      table(['Position', 'Example', 'Must return'], [
        ['`WHERE` / `HAVING`', '`WHERE x IN (SELECT …)` · `WHERE x = (SELECT MAX …)`', 'a list (IN/ANY/ALL) or **one value** (=, <, >)'],
        ['`FROM` (inline view)', '`FROM (SELECT … GROUP BY …) t`', 'a table – needs an alias'],
        ['`SELECT` list', '`SELECT name, (SELECT COUNT(*) …) AS n`', 'exactly **one value**']]),
      flow('inner query runs', 'result is passed up', 'outer query uses it'),

      h('1 · Set membership: IN / NOT IN'),
      p('Tables used here: `stu(regno, name, cgpa)` and `stu_hobby(regno, hobby)`.'),
      sql(`-- students whose hobby is 'playing'
SELECT * FROM stu WHERE regno IN (SELECT regno FROM stu_hobby WHERE hobby = 'playing');

-- students with no 'playing' hobby
SELECT * FROM stu WHERE regno NOT IN (SELECT regno FROM stu_hobby WHERE hobby = 'playing');`),
      trap('**NULL trap:** `x NOT IN (1, 2, NULL)` is never true (it expands to `x<>1 AND x<>2 AND x<>NULL`, the last term UNKNOWN). If the subquery can return NULL, `NOT IN` returns **zero rows**. Use `NOT EXISTS`, or filter `WHERE col IS NOT NULL` inside the subquery.'),
      sql(`-- hobby column contains a NULL (regno 104):
SELECT * FROM stu WHERE regno NOT IN (SELECT hobby FROM stu_hobby);        -- compares to text + NULL → no rows
SELECT * FROM stu s WHERE NOT EXISTS (SELECT 1 FROM stu_hobby h WHERE h.regno = s.regno AND h.hobby IS NULL);`),
      p('Deep nesting works the same way – sailors who reserved a **red** boat:'),
      sql(`SELECT sname FROM Sailors
WHERE sid IN (SELECT sid FROM Reserves
              WHERE bid IN (SELECT bid FROM Boats WHERE color = 'red'));`),
      table(['Variation', 'Means'], [
        ['`sid IN (… bid IN (red))`', 'reserved a red boat'],
        ['`sid NOT IN (… bid IN (red))`', 'has **not** reserved any red boat'],
        ['`sid IN (… bid NOT IN (red))`', 'reserved some **non-red** boat'],
        ['`sid NOT IN (… bid NOT IN (red))`', 'has not reserved a non-red boat ⇒ only red boats (or none)']]),

      h('2 · Comparison with a single value'),
      sql(`-- the student(s) with the highest CGPA
SELECT * FROM stu WHERE cgpa = (SELECT MAX(cgpa) FROM stu);

-- above-average
SELECT name, cgpa FROM stu WHERE cgpa > (SELECT AVG(cgpa) FROM stu);`),
      note('If a subquery used with `=`/`<`/`>` returns **more than one row** you get *ORA-01427 single-row subquery returns more than one row*. Switch to `IN`, `ANY` or `ALL`.'),

      h('3 · ANY / SOME / ALL'),
      table(['Expression', 'True when…', 'Empty subquery'], [
        ['`x > ANY (…)` / `> SOME`', 'x is larger than **at least one** value (≈ larger than the minimum)', 'FALSE'],
        ['`x > ALL (…)`', 'x is larger than **every** value (≈ larger than the maximum)', 'TRUE (!)'],
        ['`x = ANY (…)`', 'same as `x IN (…)`', 'FALSE'],
        ['`x <> ALL (…)`', 'same as `x NOT IN (…)`', 'TRUE']]),
      sql(`SELECT regno FROM stu WHERE cgpa >  SOME (SELECT cgpa FROM stu);   -- everyone except the lowest
SELECT regno FROM stu WHERE cgpa >  ALL  (SELECT cgpa FROM stu);   -- nobody: can't beat yourself
SELECT regno FROM stu WHERE cgpa >= ALL  (SELECT cgpa FROM stu);   -- the maximum(s)`, { note: 'To find the top value with ALL you need **>=**, because the top row is compared with itself too.' }),

      h('4 · EXISTS / NOT EXISTS and correlation'),
      p('`EXISTS` only asks “did the subquery return any row?” – what it selects doesn’t matter (`SELECT 1` is the habit). A **correlated** subquery refers to the outer row’s columns:'),
      sql(`-- same as the IN version above, written with EXISTS
SELECT sname FROM Sailors s
WHERE EXISTS (SELECT 1 FROM Reserves r WHERE r.sid = s.sid AND r.bid = 101);

-- sailors who reserved NOTHING
SELECT sname FROM Sailors s
WHERE NOT EXISTS (SELECT 1 FROM Reserves r WHERE r.sid = s.sid);`, { note: '`r.sid = s.sid` ties the inner query to the current outer row `s` – the inner query is evaluated once per sailor.' }),
      h3('“for ALL …” = double NOT EXISTS (relational division)'),
      p('*“Sailors who reserved **every** boat”* = there is **no boat** that this sailor has **not** reserved.'),
      sql(`SELECT s.sname FROM Sailors s
WHERE NOT EXISTS (SELECT * FROM Boats b
                  WHERE NOT EXISTS (SELECT * FROM Reserves r WHERE r.sid = s.sid AND r.bid = b.bid));`, { note: 'Read it as: for sailor s, there is no boat b such that no reservation (s, b) exists.' }),
      exam('Whenever the wording is “**every / all** …” or “**at least … of all**” → think `NOT EXISTS (… NOT EXISTS …)` or a `COUNT` comparison.'),

      h('5 · Subqueries in FROM and HAVING'),
      sql(`-- inline view: age of the youngest sailor (>= 18) per rating, only ratings having at least 2 such sailors
SELECT t.rating, t.minage
FROM  (SELECT rating, MIN(age) AS minage, COUNT(*) AS n FROM Sailors WHERE age >= 18 GROUP BY rating) t
WHERE t.n > 1;

-- the same with HAVING
SELECT rating, MIN(age) FROM Sailors WHERE age >= 18 GROUP BY rating HAVING COUNT(*) > 1;`),
      p('Use an inline view when you need an aggregate **of an aggregate** or want to filter on a computed column – for example the number of customers with more than one loan (Week 4, Q7).'),

      h('6 · Set operations'),
      table(['Operator', 'Result', 'Oracle name'], [
        ['`A UNION B`', 'rows in A **or** B, duplicates removed', 'UNION'],
        ['`A UNION ALL B`', 'all rows, duplicates kept', 'UNION ALL'],
        ['`A INTERSECT B`', 'rows in **both**', 'INTERSECT'],
        ['`A MINUS B`', 'rows in A **not** in B', '**MINUS** (standard SQL: EXCEPT)']]),
      sql(`(SELECT regno FROM stu)      UNION     (SELECT regno FROM stu_hobby);   -- have academic OR hobby info
(SELECT regno FROM stu)      INTERSECT (SELECT regno FROM stu_hobby);   -- have both
(SELECT regno FROM stu)      MINUS     (SELECT regno FROM stu_hobby);   -- academic but no hobby
(SELECT regno FROM stu_hobby) MINUS    (SELECT regno FROM stu);         -- hobby but no academic record`),
      trap('`A MINUS B` is **not** `B MINUS A`. Both sides need the same number of columns with compatible types; column names come from the first query.'),

      h('7 · UPDATE / DELETE with subqueries'),
      sql(`UPDATE stu SET cgpa = cgpa + 0.1 WHERE regno IN (SELECT regno FROM stu_hobby);   -- +0.1 for students with a hobby
DELETE FROM stu WHERE regno NOT IN (SELECT regno FROM stu_hobby WHERE regno IS NOT NULL);
SELECT * FROM stu;`),

      h('Choosing the right tool'),
      table(['Task', 'Pattern'], [
        ['“… who did X” (membership)', '`IN` / `EXISTS`'],
        ['“… who did not do X”', '`NOT EXISTS` (safe) / `NOT IN` (watch NULLs) / LEFT JOIN … IS NULL'],
        ['“the one with the max/min”', '`= (SELECT MAX …)` or `>= ALL (…)`'],
        ['“better than some / every …”', '`> ANY` / `> ALL`'],
        ['“for every / all …”', 'double `NOT EXISTS`'],
        ['“in both lists / in one but not the other”', '`INTERSECT` / `MINUS`']])
    ],
    cheat: [
      ['in / exists', 'WHERE x IN (SELECT …)   WHERE EXISTS (SELECT 1 FROM t2 WHERE t2.k = t1.k)'],
      ['max row', 'WHERE x = (SELECT MAX(x) FROM t)   WHERE x >= ALL (SELECT x FROM t)'],
      ['for every', 'WHERE NOT EXISTS (SELECT * FROM B WHERE NOT EXISTS (SELECT * FROM R WHERE R.a = A.a AND R.b = B.b))'],
      ['set ops', '(q1) UNION | UNION ALL | INTERSECT | MINUS (q2)'],
      ['inline view', 'SELECT … FROM (SELECT … GROUP BY …) t WHERE t.col > …']
    ],
    sheetTitle: 'Lab Sheet 7 – Subqueries',
    scenario: 'Schema **Student(snum, sname, major, level, age) · Class(name, meets_at, room, fid) · Enrolled(snum, cname) · Faculty(fid, fname, deptid)**. The sheet asks you to execute any 10 of the 12 questions – here you can do all 12, then the lecture drills.',
    dataset: { name: 'Student / Class / Enrolled / Faculty + stu, sailors', sql: DS, note: 'Data is chosen so every one of the 12 lab questions returns rows.' },
    practice: [
      { id: 'l1', type: 'sql', q: '**1.** Find the names of all **Juniors** (`level = \'JR\'`) who are enrolled in a class taught by `Ravi`.', answer: "SELECT DISTINCT s.sname FROM Student s WHERE s.level = 'JR' AND s.snum IN (SELECT e.snum FROM Enrolled e WHERE e.cname IN (SELECT c.name FROM Class c WHERE c.fid IN (SELECT f.fid FROM Faculty f WHERE f.fname = 'Ravi')));", hint: 'Build from the inside: Ravi’s fid → his classes → students enrolled in them → keep Juniors.' },
      { id: 'l2', type: 'sql', q: '**2.** Find the **age of the oldest student** who is either a `History` major or enrolled in a course taught by `Ravi`.', answer: "SELECT MAX(age) FROM Student WHERE major = 'History' OR snum IN (SELECT e.snum FROM Enrolled e JOIN Class c ON e.cname = c.name JOIN Faculty f ON c.fid = f.fid WHERE f.fname = 'Ravi');", hint: 'WHERE major = … OR snum IN (…), then MAX(age).' },
      { id: 'l3', type: 'sql', q: '**3.** Find the names of all classes that either **meet in room R128** or have **five or more students** enrolled.', answer: "SELECT name FROM Class WHERE room = 'R128' OR name IN (SELECT cname FROM Enrolled GROUP BY cname HAVING COUNT(*) >= 5);" },
      { id: 'l4', type: 'sql', q: '**4.** Find the names of all students who are enrolled in **two classes that meet at the same time**.', answer: 'SELECT DISTINCT s.sname FROM Student s WHERE s.snum IN (SELECT e1.snum FROM Enrolled e1, Enrolled e2, Class c1, Class c2 WHERE e1.snum = e2.snum AND e1.cname <> e2.cname AND e1.cname = c1.name AND e2.cname = c2.name AND c1.meets_at = c2.meets_at);', hint: 'Self-join Enrolled and Class, require different classes with equal meets_at.' },
      { id: 'l5', type: 'sql', q: '**5.** Find the names of **faculty members who teach in every room** in which some class is taught.', answer: 'SELECT f.fname FROM Faculty f WHERE NOT EXISTS (SELECT c.room FROM Class c WHERE NOT EXISTS (SELECT 1 FROM Class c2 WHERE c2.fid = f.fid AND c2.room = c.room));', hint: 'Division: no room exists in which this faculty has no class.', explain: 'Only Kumar teaches in R128, R101 and R202.' },
      { id: 'l6', type: 'sql', q: '**6.** Find the names of faculty members for whom the **combined enrolment of the courses they teach is less than five**.', answer: 'SELECT f.fname FROM Faculty f WHERE 5 > (SELECT COUNT(e.snum) FROM Class c JOIN Enrolled e ON c.name = e.cname WHERE c.fid = f.fid);', hint: 'A correlated scalar subquery returns the total enrolment for each faculty f.' },
      { id: 'l7', type: 'sql', q: '**7.** For each **level**, print the level and the **average age** of students for that level.', answer: 'SELECT level, AVG(age) FROM Student GROUP BY level;' },
      { id: 'l8', type: 'sql', q: '**8.** For all levels **except JR**, print the level and the average age of students for that level.', answer: "SELECT level, AVG(age) FROM Student WHERE level <> 'JR' GROUP BY level;", hint: 'WHERE (row filter) vs HAVING (group filter): either works here, WHERE is cheaper.' },
      { id: 'l9', type: 'sql', q: '**9.** For each faculty member that has taught classes **only in room R128**, print the faculty member’s name and the **total number of classes** she or he has taught.', answer: "SELECT f.fname, COUNT(*) FROM Faculty f JOIN Class c ON f.fid = c.fid WHERE f.fid NOT IN (SELECT fid FROM Class WHERE room <> 'R128') GROUP BY f.fid, f.fname;", hint: 'Exclude anyone who ever taught outside R128 with NOT IN, then COUNT their classes.' },
      { id: 'l10', type: 'sql', q: '**10.** Find the names of students enrolled in the **maximum number of classes**.', answer: 'SELECT s.sname FROM Student s WHERE s.snum IN (SELECT snum FROM Enrolled GROUP BY snum HAVING COUNT(*) >= ALL (SELECT COUNT(*) FROM Enrolled GROUP BY snum));', hint: 'COUNT per student, keep those whose count is >= ALL counts.' },
      { id: 'l11', type: 'sql', q: '**11.** Find the names of students **not enrolled in any class**.', answer: 'SELECT sname FROM Student s WHERE NOT EXISTS (SELECT 1 FROM Enrolled e WHERE e.snum = s.snum);', hint: 'NOT EXISTS (safe) or NOT IN (fine here – snum is never NULL).' },
      { id: 'l12', type: 'sql', q: '**12.** For each **age** value that appears in Student, find the **level** value that appears **most often**. E.g. if FR is the most common level among 18-year-olds, print `(18, FR)`.', answer: 'SELECT s.age, s.level FROM Student s GROUP BY s.age, s.level HAVING COUNT(*) >= ALL (SELECT COUNT(*) FROM Student s2 WHERE s2.age = s.age GROUP BY s2.level);', hint: 'Group by (age, level); keep groups whose COUNT is >= every COUNT within the same age (correlated).', explain: 'The inner query is correlated on `age`, so “>= ALL” compares only within the same age.' },
      { id: 's1', type: 'sql', q: '**Membership.** From `stu`, list the students whose hobby is `playing`.', answer: "SELECT * FROM stu WHERE regno IN (SELECT regno FROM stu_hobby WHERE hobby = 'playing');" },
      { id: 's2', type: 'sql', q: '**Set ops.** List regnos that have academic **or** hobby information.', answer: 'SELECT regno FROM stu UNION SELECT regno FROM stu_hobby;' },
      { id: 's3', type: 'sql', q: '**Set ops.** List regnos that have academic information **but no hobby** information (use `MINUS`).', answer: 'SELECT regno FROM stu MINUS SELECT regno FROM stu_hobby;', hint: 'Order matters: `stu MINUS stu_hobby`.' },
      { id: 's4', type: 'sql', q: '**Set comparison.** List the regnos of the students having the **maximum** CGPA using `>= ALL`.', answer: 'SELECT regno FROM stu WHERE cgpa >= ALL (SELECT cgpa FROM stu);' },
      { id: 's5', type: 'sql', q: '**Update with a subquery.** Increase the CGPA by 0.1 of every student who has a hobby entry.', answer: 'UPDATE stu SET cgpa = cgpa + 0.1 WHERE regno IN (SELECT regno FROM stu_hobby);', verify: 'SELECT * FROM stu ORDER BY regno' },
      { id: 's6', type: 'sql', q: '**Delete with a subquery.** Delete the academic records (`stu`) of students who have **no** row in `stu_hobby`.', answer: 'DELETE FROM stu WHERE regno NOT IN (SELECT regno FROM stu_hobby);', verify: 'SELECT * FROM stu ORDER BY regno', hint: 'Check that `stu_hobby.regno` has no NULLs first (it doesn’t) – otherwise NOT IN would delete nothing.' },
      { id: 'b1', type: 'sql', q: '**Sailors.** Names of sailors who have **not** reserved a red boat (use sids – names aren’t unique).', answer: "SELECT sname FROM Sailors WHERE sid NOT IN (SELECT r.sid FROM Reserves r WHERE r.bid IN (SELECT bid FROM Boats WHERE color = 'red'));" },
      { id: 'b2', type: 'sql', q: '**Sailors.** Names of sailors who reserved **both a red and a green boat** (compare by `sid`, not by name).', answer: "SELECT s.sname FROM Sailors s WHERE s.sid IN (SELECT r.sid FROM Reserves r JOIN Boats b ON r.bid = b.bid WHERE b.color = 'red') AND s.sid IN (SELECT r.sid FROM Reserves r JOIN Boats b ON r.bid = b.bid WHERE b.color = 'green');", hint: 'Two IN conditions joined by AND – or INTERSECT on sid.', explain: 'Intersecting on `sname` would be a subtle bug when two sailors share a name (the two Horatios).' },
      { id: 'b3', type: 'sql', q: '**Sailors – division.** Names of sailors who reserved **all** boats.', answer: 'SELECT s.sname FROM Sailors s WHERE NOT EXISTS (SELECT * FROM Boats b WHERE NOT EXISTS (SELECT * FROM Reserves r WHERE r.sid = s.sid AND r.bid = b.bid));' },
      { id: 'b4', type: 'sql', q: '**Sailors.** Name and age of the **oldest** sailor.', answer: 'SELECT sname, age FROM Sailors WHERE age = (SELECT MAX(age) FROM Sailors);', hint: '`SELECT sname, MAX(age)` alone is illegal.' },
      { id: 'b5', type: 'sql', q: '**Sailors – inline view.** For each rating, the age of the youngest sailor with age ≥ 18, but only for ratings with **at least 2** such sailors (use a subquery in FROM).', answer: 'SELECT t.rating, t.minage FROM (SELECT rating, MIN(age) AS minage, COUNT(*) AS n FROM Sailors WHERE age >= 18 GROUP BY rating) t WHERE t.n > 1;' },
      { id: 'm1', type: 'mcq', q: '`SELECT COUNT(*) FROM stu WHERE regno NOT IN (SELECT hobby FROM stu_hobby);` – the `hobby` column contains a NULL. What is the count?', opts: ['0 – NOT IN with a NULL in the list is never true', '5 – all students', '4', 'An error'], a: 0, why: '`x NOT IN (…, NULL)` evaluates to UNKNOWN for every x.' },
      { id: 'm2', type: 'mcq', q: 'Which is equivalent to `x <> ALL (SELECT y FROM t)`?', opts: ['x NOT IN (SELECT y FROM t)', 'x IN (SELECT y FROM t)', 'x > ANY (SELECT y FROM t)', 'NOT EXISTS (SELECT y FROM t)'], a: 0, why: '`<> ALL` and `NOT IN` mean the same thing.' }
    ],
    quiz: [
      { q: 'Find the student(s) with the highest cgpa. Which is correct?', opts: ['WHERE cgpa >= ALL (SELECT cgpa FROM stu)', 'WHERE cgpa > ALL (SELECT cgpa FROM stu)', 'WHERE cgpa > ANY (SELECT cgpa FROM stu)', 'WHERE cgpa = ANY (SELECT MIN(cgpa) FROM stu)'], a: 0, why: '`> ALL` fails because a row can’t exceed itself; `>= ALL` includes it.' },
      { q: 'A correlated subquery…', opts: ['refers to a column of the outer query and is re-evaluated per outer row', 'is always faster than a join', 'cannot use EXISTS', 'runs once before the outer query'], a: 0, why: 'That’s the definition.' },
      { q: '`WHERE amount > (SELECT amount FROM loan)` fails when the subquery returns 3 rows because…', opts: ['a single-value comparison needs one row (use ANY/ALL/IN)', 'subqueries can’t be in WHERE', 'amount must be an alias', 'you forgot DISTINCT'], a: 0, why: 'ORA-01427.' },
      { q: 'Which operator returns rows of A that are not in B?', opts: ['A MINUS B', 'A INTERSECT B', 'A UNION B', 'B MINUS A'], a: 0, why: 'MINUS = set difference (EXCEPT in standard SQL).' },
      { q: 'Subquery returns an **empty** set. `x > ALL (empty)` is…', opts: ['TRUE', 'FALSE', 'NULL', 'an error'], a: 0, why: '“All of nothing” is vacuously true – a classic trap. `> ANY (empty)` is FALSE.' },
      { q: '`EXISTS (SELECT … )` is TRUE when the subquery…', opts: ['returns at least one row', 'returns the value 1', 'returns a non-NULL value', 'returns exactly one row'], a: 0, why: 'Only existence of rows matters.' },
      { q: 'Best way to say “sailors who reserved **every** boat”:', opts: ['NOT EXISTS (boat) such that NOT EXISTS (reservation)', 'sid IN (SELECT sid FROM reserves)', 'COUNT(*) > 1', 'sid = ALL (SELECT bid …)'], a: 0, why: 'Relational division = double NOT EXISTS.' }
    ]
  });
})();
