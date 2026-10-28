(function () {
  const { h, h3, p, list, olist, sql, pl, tip, trap, exam, note, table, cmp, flow } = D;
  const R = (re, msg) => ({ re, msg });
  const DS = `
CREATE TABLE TUTOR (CODE INT NOT NULL, SUBJECT VARCHAR(15) NOT NULL, TEACHER VARCHAR(15), REVIEWS VARCHAR(10) NOT NULL, PRIMARY KEY (CODE));
INSERT INTO TUTOR (CODE,SUBJECT,TEACHER,REVIEWS) VALUES (1, 'Automation', 'CV RAMAN', 'five stars');
INSERT INTO TUTOR (CODE,SUBJECT,TEACHER,REVIEWS) VALUES (4, 'PLSQL', 'APJ', 'four stars');
INSERT INTO TUTOR (CODE,SUBJECT,TEACHER,REVIEWS) VALUES (2, 'Performance', 'Aryabhata', 'four stars');
CREATE TABLE employee1 (
  empno NUMBER(4) NOT NULL CONSTRAINT emp_pk PRIMARY KEY, ename VARCHAR2(10), job VARCHAR2(9), mgr NUMBER(4), hiredate DATE,
  sal NUMBER(7,2) CONSTRAINT emp_sal_ck CHECK (sal > 0), comm NUMBER(7,2), deptno NUMBER(2));
INSERT INTO employee1 VALUES (7369,'SMITH','CLERK',7902,'17-DEC-80',800,NULL,20);
INSERT INTO employee1 VALUES (7499,'ALLEN','SALESMAN',7698,'20-FEB-81',1600,300,30);
INSERT INTO employee1 VALUES (7521,'WARD','SALESMAN',7698,'22-FEB-81',1250,500,30);
INSERT INTO employee1 VALUES (7566,'JONES','MANAGER',7839,'02-APR-81',2975,NULL,20);
INSERT INTO employee1 VALUES (7654,'MARTIN','SALESMAN',7698,'28-SEP-81',1250,1400,30);
INSERT INTO employee1 VALUES (7698,'BLAKE','MANAGER',7839,'01-MAY-81',2850,NULL,30);
INSERT INTO employee1 VALUES (7782,'CLARK','MANAGER',7839,'09-JUN-81',2450,NULL,10);
INSERT INTO employee1 VALUES (7788,'SCOTT','ANALYST',7566,'19-APR-87',3000,NULL,20);
INSERT INTO employee1 VALUES (7839,'KING','PRESIDENT',NULL,'17-NOV-81',5000,NULL,10);
INSERT INTO employee1 VALUES (7844,'TURNER','SALESMAN',7698,'08-SEP-81',1500,0,30);
INSERT INTO employee1 VALUES (7876,'ADAMS','CLERK',7788,'23-MAY-87',1100,NULL,20);
INSERT INTO employee1 VALUES (7900,'JAMES','CLERK',7698,'03-DEC-81',950,NULL,30);
INSERT INTO employee1 VALUES (7902,'FORD','ANALYST',7566,'03-DEC-81',3000,NULL,20);
INSERT INTO employee1 VALUES (7934,'MILLER','CLERK',7782,'23-JAN-82',1300,NULL,10);
CREATE TABLE TEMPLOYEE1 (EMPLOYEE1ID NUMBER(4), OLD NUMBER(7,2), NEW NUMBER(7,2));
`.trim();
  const VEMP = 'SELECT t.employee1id, t.old, t.new, e.sal FROM temployee1 t JOIN employee1 e ON e.empno = t.employee1id ORDER BY 1';

  Weeks.push({
    id: 'w10', num: 10, nav: 'Cursors', title: 'Cursors – row-by-row processing', lab: 'Lab sheet 10', time: '45 min',
    summary: 'How PL/SQL walks through the rows of a query: implicit vs explicit cursors, the OPEN–FETCH–CLOSE cycle, cursor attributes and the cursor FOR loop.',
    blurb: 'Implicit/explicit · OPEN-FETCH-CLOSE · %FOUND/%NOTFOUND/%ROWCOUNT · cursor FOR loop.',
    tldr: [
      'A **cursor** is a pointer to the *active set* (result rows) of a query – PL/SQL reads **one row at a time** from it.',
      '**Implicit** cursor = Oracle’s automatic one for every DML / `SELECT INTO` → `SQL%ROWCOUNT`, `SQL%FOUND`, `SQL%NOTFOUND`.',
      '**Explicit** cursor (you name it for multi-row SELECTs): `CURSOR c IS SELECT …;` → `OPEN c;` → `FETCH c INTO …;` → `CLOSE c;`',
      'Loop with `EXIT WHEN c%NOTFOUND;` **right after** the FETCH. Attributes: `%FOUND %NOTFOUND %ISOPEN %ROWCOUNT`.',
      '**Cursor FOR loop** (`FOR r IN c LOOP`) opens, fetches and closes for you – the one to use in the exam when allowed.'
    ],
    lesson: [
      h('Why cursors?'),
      p('`SELECT … INTO` handles exactly one row. When the query returns many rows and you want to **process each row** (print it, apply an IF, update something per row) you need a cursor. The rows live in a work area on the server – the *context area* – and the cursor is the pointer into it. Rows already fetched are never fetched again; the pointer only moves forward.'),
      table(['', 'Implicit cursor', 'Explicit cursor'], [
        ['created by', 'Oracle, automatically for every INSERT/UPDATE/DELETE and `SELECT INTO`', 'you, with `CURSOR name IS …` in DECLARE'],
        ['name', '`SQL` (you can’t name it)', 'your own name'],
        ['rows', 'DML: any; SELECT INTO: exactly one', 'a multi-row SELECT, fetched one at a time'],
        ['control', 'none – Oracle opens/closes it', 'OPEN, FETCH, CLOSE (or a cursor FOR loop)']]),

      h('Implicit cursor attributes'),
      pl(`BEGIN
  UPDATE tutor SET teacher = 'VIKRAM' WHERE code = 2;
  IF SQL%NOTFOUND THEN
    DBMS_OUTPUT.PUT_LINE('no subjects fetched');
  ELSIF SQL%FOUND THEN
    DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' teacher name updated');
  END IF;
END;
/
SELECT * FROM tutor;`, { note: '`SQL%ROWCOUNT` = rows touched by the **most recent** DML. Check it *immediately* after the statement – the next SQL statement overwrites it.' }),

      h('Explicit cursor: the four steps'),
      flow('DECLARE  (define the query)', 'OPEN  (run it, fill the active set)', 'FETCH  (copy next row into variables)', 'CLOSE  (free memory)'),
      pl(`DECLARE
  CURSOR t_tutorials IS                 -- 1. declare
    SELECT code, subject, teacher FROM tutor ORDER BY code;
  t_code    tutor.code%TYPE;
  t_subject tutor.subject%TYPE;
  t_teacher tutor.teacher%TYPE;
BEGIN
  OPEN t_tutorials;                     -- 2. open
  LOOP
    FETCH t_tutorials INTO t_code, t_subject, t_teacher;   -- 3. fetch
    EXIT WHEN t_tutorials%NOTFOUND;     --    leave when the fetch found nothing
    DBMS_OUTPUT.PUT_LINE('Code is: ' || t_code || ' Subject is: ' || t_subject || ' Teacher is: ' || t_teacher);
  END LOOP;
  CLOSE t_tutorials;                    -- 4. close
END;
/`, { note: 'The `INTO` list must match the cursor’s SELECT list in **number and type**, in the same order.' }),
      table(['Attribute', 'True / value when…'], [
        ['`c%ISOPEN`', 'the cursor is open'],
        ['`c%FOUND`', 'the **last FETCH** returned a row (NULL before the first fetch)'],
        ['`c%NOTFOUND`', 'the last FETCH returned **no** row ⇒ use it to leave the loop'],
        ['`c%ROWCOUNT`', 'number of rows fetched **so far**']]),
      trap('Put `EXIT WHEN c%NOTFOUND;` **directly after** the `FETCH`. If you test it before fetching, or print before testing, the last row is processed twice (or a NULL row is printed).'),

      h('Records: %ROWTYPE'),
      pl(`DECLARE
  CURSOR c IS SELECT empno, ename, sal FROM employee1 WHERE deptno = 10 ORDER BY empno;
  r c%ROWTYPE;                          -- a record with the cursor's columns
BEGIN
  OPEN c;
  LOOP
    FETCH c INTO r;
    EXIT WHEN c%NOTFOUND;
    DBMS_OUTPUT.PUT_LINE(r.empno || ' ' || r.ename || ' ' || r.sal);   -- record.column
  END LOOP;
  CLOSE c;
END;
/`),

      h('Four ways to loop (same result)'),
      table(['Style', 'You write', 'Notes'], [
        ['**LOOP + EXIT WHEN**', 'OPEN / FETCH / `EXIT WHEN %NOTFOUND` / CLOSE', 'most explicit; classic exam answer'],
        ['**WHILE %FOUND**', 'FETCH once *before* the loop and again at the end of each pass', 'easy to get wrong – the “priming fetch”'],
        ['**Cursor FOR loop**', '`FOR r IN c LOOP … END LOOP;`', 'opens, fetches, **closes automatically**; `r` is implicitly `c%ROWTYPE`'],
        ['**Inline FOR loop**', '`FOR r IN (SELECT …) LOOP … END LOOP;`', 'no CURSOR declaration at all']]),
      pl(`BEGIN
  -- (a) Lab question: empno, ename, job of department 10 with a cursor FOR loop
  FOR r IN (SELECT empno, ename, job FROM employee1 WHERE deptno = 10 ORDER BY empno) LOOP
    DBMS_OUTPUT.PUT_LINE(r.empno || ' ' || r.ename || ' ' || r.job);
  END LOOP;
END;
/`),
      pl(`DECLARE
  CURSOR c IS SELECT ename FROM employee1 WHERE deptno = 10 ORDER BY ename;
  v employee1.ename%TYPE;
BEGIN
  OPEN c;
  FETCH c INTO v;                       -- priming fetch
  WHILE c%FOUND LOOP
    DBMS_OUTPUT.PUT_LINE(v);
    FETCH c INTO v;                     -- fetch again at the END of the body
  END LOOP;
  CLOSE c;
END;
/`),

      h('Cursors that change data'),
      pl(`DECLARE
  CURSOR c IS SELECT empno, sal, deptno FROM employee1 ORDER BY empno;
  r c%ROWTYPE;
  v_inc NUMBER;
BEGIN
  OPEN c;
  LOOP
    FETCH c INTO r;
    EXIT WHEN c%NOTFOUND;
    IF r.deptno = 10 THEN v_inc := 1000;
    ELSIF r.deptno = 20 THEN v_inc := 500;
    ELSE v_inc := 800;
    END IF;
    UPDATE employee1 SET sal = sal + v_inc WHERE empno = r.empno;     -- change the row we just read
    INSERT INTO temployee1 VALUES (r.empno, r.sal, r.sal + v_inc);    -- log old and new salary
  END LOOP;
  CLOSE c;
END;
/
SELECT * FROM temployee1 ORDER BY employee1id;`, { note: 'Lab question (b). The cursor’s SELECT is fixed when it is opened, so updating the table inside the loop does not change which rows you visit.' }),
      note('Oracle also offers `SELECT … FOR UPDATE` with `UPDATE … WHERE CURRENT OF cursor_name` to lock and change the row the cursor points at. Know the idea; the classroom programs use `WHERE empno = r.empno` as above.'),

      h('Parameterised cursors'),
      pl(`DECLARE
  CURSOR by_dept (p_dept NUMBER) IS
    SELECT ename, sal FROM employee1 WHERE deptno = p_dept ORDER BY ename;
BEGIN
  FOR r IN by_dept(10) LOOP                       -- pass the argument when you open / loop
    DBMS_OUTPUT.PUT_LINE(r.ename || ' ' || r.sal);
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('--');
  FOR r IN by_dept(20) LOOP EXIT WHEN by_dept%ROWCOUNT > 2; DBMS_OUTPUT.PUT_LINE(r.ename); END LOOP;
END;
/`),
      h('Typical errors'),
      table(['Error / symptom', 'Cause'], [
        ['`ORA-01001: invalid cursor`', 'FETCH or CLOSE on a cursor that is not open'],
        ['`ORA-06511: cursor already open`', '`OPEN` twice without `CLOSE`'],
        ['last row printed twice', '`EXIT WHEN` placed *before* the FETCH'],
        ['`PLS-00394` / `ORA-06504`', '`INTO` variables don’t match the SELECT list'],
        ['slow program', 'a cursor loop doing one UPDATE per row where a single set-based `UPDATE` would do – prefer plain SQL unless you need per-row logic']]),
      exam('Lab (c): *“name and salary of each employee whose salary is below the average”* – put the average **inside the cursor’s WHERE** (`WHERE sal < (SELECT AVG(sal) FROM employee1)`) instead of computing it in the loop.')
    ],
    cheat: [
      ['explicit', 'DECLARE CURSOR c IS SELECT a, b FROM t; v_a t.a%TYPE; v_b t.b%TYPE;\nBEGIN OPEN c;\n  LOOP FETCH c INTO v_a, v_b; EXIT WHEN c%NOTFOUND; …; END LOOP;\n  CLOSE c; END;'],
      ['for loop', 'FOR r IN c LOOP … r.col … END LOOP;       FOR r IN (SELECT …) LOOP … END LOOP;'],
      ['attributes', 'c%FOUND  c%NOTFOUND  c%ISOPEN  c%ROWCOUNT   |   SQL%FOUND  SQL%NOTFOUND  SQL%ROWCOUNT'],
      ['parameters', 'CURSOR c (p NUMBER) IS SELECT … WHERE x = p;     OPEN c(10);   FOR r IN c(10) LOOP']
    ],
    sheetTitle: 'Lab Sheet 10 – Cursors',
    scenario: 'Tables **TUTOR** (the sheet’s examples) and **EMPLOYEE1** (empno, ename, job, mgr, hiredate, sal, comm, deptno) + the empty log table **TEMPLOYEE1(employee1id, old, new)**. Output lines must follow the exact formats given.',
    dataset: { name: 'EMPLOYEE1 / TEMPLOYEE1 / TUTOR', sql: DS },
    practice: [
      { id: 'a', type: 'plsql', q: '**(a)** Display `empno`, `ename` and `job` of the employees of **DeptNo 10** with a **cursor FOR loop**, one line per employee as `<empno> <ename> <job>`, ordered by empno.', starter: 'BEGIN\n  -- FOR … LOOP\n  NULL;\nEND;', answer: "BEGIN\n  FOR r IN (SELECT empno, ename, job FROM employee1 WHERE deptno = 10 ORDER BY empno) LOOP\n    DBMS_OUTPUT.PUT_LINE(r.empno || ' ' || r.ename || ' ' || r.job);\n  END LOOP;\nEND;", needs: [R('\\bfor\\b[\\s\\S]*\\bin\\b[\\s\\S]*\\bloop\\b', 'uses a FOR … IN … LOOP')], hint: 'FOR r IN (SELECT …) LOOP … r.empno … END LOOP;' },
      { id: 'b', type: 'plsql', q: '**(b)** Using a cursor, **increase the salary**: DeptNo 10 by 1000, DeptNo 20 by 500, DeptNo 30 by 800. Also store `Employee1No`, old salary and new salary in `TEMPLOYEE1` (`employee1id, old, new`).', starter: 'DECLARE\n  CURSOR c IS SELECT empno, sal, deptno FROM employee1 ORDER BY empno;\n  r c%ROWTYPE;\n  v_inc NUMBER;\nBEGIN\n  OPEN c;\n  -- LOOP …\n  CLOSE c;\nEND;', answer: "DECLARE\n  CURSOR c IS SELECT empno, sal, deptno FROM employee1 ORDER BY empno;\n  r c%ROWTYPE;\n  v_inc NUMBER;\nBEGIN\n  OPEN c;\n  LOOP\n    FETCH c INTO r;\n    EXIT WHEN c%NOTFOUND;\n    IF r.deptno = 10 THEN\n      v_inc := 1000;\n    ELSIF r.deptno = 20 THEN\n      v_inc := 500;\n    ELSE\n      v_inc := 800;\n    END IF;\n    UPDATE employee1 SET sal = sal + v_inc WHERE empno = r.empno;\n    INSERT INTO temployee1 VALUES (r.empno, r.sal, r.sal + v_inc);\n  END LOOP;\n  CLOSE c;\nEND;", verify: VEMP, hint: 'Pick the increment with IF/ELSIF on r.deptno, then UPDATE … WHERE empno = r.empno and INSERT the log row (old = r.sal, new = r.sal + v_inc).', explain: 'The `old` value comes from the *fetched* record (before the UPDATE), the `new` value is old + increment.' },
      { id: 'c', type: 'plsql', q: '**(c)** Create a cursor that displays the **name and salary** of each employee whose salary is **less than the average** salary of all employees, as `<ename> <sal>`, ordered by empno.', starter: 'DECLARE\n  CURSOR c IS SELECT ename, sal FROM employee1 WHERE sal < 0;  -- fix the condition\n  v_name employee1.ename%TYPE;\n  v_sal  employee1.sal%TYPE;\nBEGIN\n  OPEN c;\n  -- loop\n  CLOSE c;\nEND;', answer: "DECLARE\n  CURSOR c IS SELECT ename, sal FROM employee1 WHERE sal < (SELECT AVG(sal) FROM employee1) ORDER BY empno;\n  v_name employee1.ename%TYPE;\n  v_sal  employee1.sal%TYPE;\nBEGIN\n  OPEN c;\n  LOOP\n    FETCH c INTO v_name, v_sal;\n    EXIT WHEN c%NOTFOUND;\n    DBMS_OUTPUT.PUT_LINE(v_name || ' ' || v_sal);\n  END LOOP;\n  CLOSE c;\nEND;", hint: 'A subquery in the cursor’s WHERE: `sal < (SELECT AVG(sal) FROM employee1)`.', needs: [R('open\\s+\\w+', 'OPENs the cursor'), R('fetch\\s+\\w+\\s+into', 'FETCH … INTO'), R('close\\s+\\w+', 'CLOSEs the cursor')] },
      { id: 'd', type: 'plsql', q: '**TUTOR program.** With an explicit cursor print every tutor (ordered by code) exactly as `Code is: <code> Subject is: <subject> Teacher is: <teacher>`.', starter: 'DECLARE\n  CURSOR t_tutorials IS SELECT code, subject, teacher FROM tutor ORDER BY code;\n  t_code    tutor.code%TYPE;\n  t_subject tutor.subject%TYPE;\n  t_teacher tutor.teacher%TYPE;\nBEGIN\n  -- OPEN … FETCH … CLOSE\n  NULL;\nEND;', answer: "DECLARE\n  CURSOR t_tutorials IS SELECT code, subject, teacher FROM tutor ORDER BY code;\n  t_code    tutor.code%TYPE;\n  t_subject tutor.subject%TYPE;\n  t_teacher tutor.teacher%TYPE;\nBEGIN\n  OPEN t_tutorials;\n  LOOP\n    FETCH t_tutorials INTO t_code, t_subject, t_teacher;\n    EXIT WHEN t_tutorials%NOTFOUND;\n    DBMS_OUTPUT.PUT_LINE('Code is: ' || t_code || ' Subject is: ' || t_subject || ' Teacher is: ' || t_teacher);\n  END LOOP;\n  CLOSE t_tutorials;\nEND;" },
      { id: 'e', type: 'plsql', q: '**Implicit cursor.** Update the teacher of tutor `v_code` to `VIKRAM`. Print `<n> teacher name updated` if a row changed, else `no subjects fetched`. (Hidden tests use a code that exists and one that doesn’t.)', starter: 'DECLARE\n  v_code NUMBER := 2;\nBEGIN\n  -- UPDATE …\n  NULL;\nEND;', answer: "DECLARE\n  v_code NUMBER := 2;\nBEGIN\n  UPDATE tutor SET teacher = 'VIKRAM' WHERE code = v_code;\n  IF SQL%NOTFOUND THEN\n    DBMS_OUTPUT.PUT_LINE('no subjects fetched');\n  ELSE\n    DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' teacher name updated');\n  END IF;\nEND;", testVar: 'v_code', tests: [2, 99, 4], verify: 'SELECT * FROM tutor ORDER BY code', hint: 'IF SQL%NOTFOUND THEN … ELSE … SQL%ROWCOUNT' },
      { id: 'f', type: 'plsql', q: '**Parameterised cursor.** Declare `CURSOR by_job (p_job VARCHAR2)` and print `<ename> <sal>` of all employees having job `v_job` ordered by empno. (Tests: CLERK, MANAGER, ANALYST.)', starter: "DECLARE\n  v_job VARCHAR2(10) := 'CLERK';\n  -- CURSOR by_job (p_job VARCHAR2) IS …\nBEGIN\n  NULL;\nEND;", answer: "DECLARE\n  v_job VARCHAR2(10) := 'CLERK';\n  CURSOR by_job (p_job VARCHAR2) IS\n    SELECT ename, sal FROM employee1 WHERE job = p_job ORDER BY empno;\nBEGIN\n  FOR r IN by_job(v_job) LOOP\n    DBMS_OUTPUT.PUT_LINE(r.ename || ' ' || r.sal);\n  END LOOP;\nEND;", testVar: 'v_job', tests: ['CLERK', 'MANAGER', 'ANALYST', 'SALESMAN'], needs: [R('cursor\\s+by_job\\s*\\(\\s*p_job', 'declares CURSOR by_job (p_job …)')] },
      { id: 'g', type: 'plsql', q: '**Nested cursors.** For every department (10, 20, 30 – from `employee1`) print `Dept <deptno>: <count> employees, total <sum of sal>`, ordered by deptno.', starter: 'BEGIN\n  -- FOR r IN (SELECT deptno, … GROUP BY …) LOOP\n  NULL;\nEND;', answer: "BEGIN\n  FOR r IN (SELECT deptno, COUNT(*) AS n, SUM(sal) AS total FROM employee1 GROUP BY deptno ORDER BY deptno) LOOP\n    DBMS_OUTPUT.PUT_LINE('Dept ' || r.deptno || ': ' || r.n || ' employees, total ' || r.total);\n  END LOOP;\nEND;", hint: 'You can aggregate inside the cursor’s SELECT and loop over the grouped rows.' },
      { id: 'h', type: 'plsql', q: '**%ROWCOUNT.** Print the **top 3 earners** (highest `sal`; ties by `ename`) as `<rank>. <ename> <sal>` using an explicit cursor and `c%ROWCOUNT` to stop after 3 rows.', starter: 'DECLARE\n  CURSOR c IS SELECT ename, sal FROM employee1 ORDER BY sal DESC, ename;\n  r c%ROWTYPE;\nBEGIN\n  OPEN c;\n  -- LOOP FETCH … EXIT WHEN … %ROWCOUNT …\n  CLOSE c;\nEND;', answer: "DECLARE\n  CURSOR c IS SELECT ename, sal FROM employee1 ORDER BY sal DESC, ename;\n  r c%ROWTYPE;\nBEGIN\n  OPEN c;\n  LOOP\n    FETCH c INTO r;\n    EXIT WHEN c%NOTFOUND OR c%ROWCOUNT > 3;\n    DBMS_OUTPUT.PUT_LINE(c%ROWCOUNT || '. ' || r.ename || ' ' || r.sal);\n  END LOOP;\n  CLOSE c;\nEND;", needs: [R('%rowcount', 'uses %ROWCOUNT')], hint: '`EXIT WHEN c%NOTFOUND OR c%ROWCOUNT > 3;` – ROWCOUNT is the number of rows fetched so far.' },
      { id: 'f1', type: 'fill', q: '**Fill the blanks** – the explicit-cursor skeleton.', code: `DECLARE
  ___1___ emp_cur ___2___ SELECT ename FROM employee1;
  v_name employee1.ename%TYPE;
BEGIN
  ___3___ emp_cur;
  LOOP
    ___4___ emp_cur INTO v_name;
    EXIT WHEN emp_cur%___5___;
    DBMS_OUTPUT.PUT_LINE(v_name);
  END LOOP;
  ___6___ emp_cur;
END;`, blanks: [['CURSOR'], ['IS'], ['OPEN'], ['FETCH'], ['NOTFOUND'], ['CLOSE']] },
      { id: 'b1', type: 'build', q: '**Put the lines in order** – an explicit cursor loop.', lines: ['DECLARE', '  CURSOR c IS SELECT ename FROM employee1;', '  v employee1.ename%TYPE;', 'BEGIN', '  OPEN c;', '  LOOP', '    FETCH c INTO v;', '    EXIT WHEN c%NOTFOUND;', '    DBMS_OUTPUT.PUT_LINE(v);', '  END LOOP;', '  CLOSE c;', 'END;'], hint: 'Declare → OPEN → LOOP → FETCH → EXIT WHEN → work → END LOOP → CLOSE.' },
      { id: 'm1', type: 'mcq', q: 'The cursor returns 3 rows. How many times does the line **after** `EXIT WHEN` run?', lang: 'plsql', code: 'LOOP\n  FETCH c INTO v;\n  EXIT WHEN c%NOTFOUND;\n  DBMS_OUTPUT.PUT_LINE(v);   -- how many times?\nEND LOOP;', opts: ['3', '4', '2', 'infinite'], a: 0, why: 'The 4th FETCH finds nothing, %NOTFOUND becomes TRUE and the EXIT happens *before* the print.' },
      { id: 'm2', type: 'mcq', q: 'Same loop, but the lines are swapped: `PUT_LINE(v);` comes **before** `EXIT WHEN c%NOTFOUND;`. With 3 rows, what happens?', opts: ['4 lines printed – the last row appears twice', '3 lines printed', '2 lines printed', 'ORA-01001'], a: 0, why: 'The failed 4th fetch leaves `v` unchanged (still the 3rd row) and it is printed again before the EXIT.' },
      { id: 'm3', type: 'mcq', q: 'In `FOR r IN c LOOP … END LOOP;` which statement is **not** needed?', opts: ['OPEN c / FETCH / CLOSE c', 'the CURSOR declaration', 'a loop body', 'END LOOP'], a: 0, why: 'The cursor FOR loop opens, fetches and closes the cursor automatically.' }
    ],
    quiz: [
      { q: 'Which attribute is true when the most recent FETCH returned no row?', opts: ['%NOTFOUND', '%FOUND', '%ISOPEN', '%ROWCOUNT'], a: 0, why: 'Use it to terminate the loop.' },
      { q: '`SQL%ROWCOUNT` after `UPDATE emp SET sal = sal + 1 WHERE deptno = 10;` gives…', opts: ['the number of rows updated', '1 always', 'the number of employees in the table', 'NULL'], a: 0, why: 'Implicit cursor attribute for the last DML.' },
      { q: 'Order of explicit cursor operations:', opts: ['DECLARE, OPEN, FETCH, CLOSE', 'OPEN, DECLARE, FETCH, CLOSE', 'DECLARE, FETCH, OPEN, CLOSE', 'OPEN, FETCH, DECLARE, CLOSE'], a: 0, why: 'Define, run, read, release.' },
      { q: 'Implicit cursors are used for…', opts: ['DML statements and SELECT INTO', 'only multi-row SELECTs', 'only stored procedures', 'triggers only'], a: 0, why: 'Oracle manages them automatically.' },
      { q: '`FETCH c INTO a, b;` fails to compile when the cursor selects 3 columns because…', opts: ['the INTO list must match the SELECT list in number and type', 'FETCH accepts one variable only', 'c must be closed first', 'columns can’t be fetched'], a: 0, why: 'Or use one `%ROWTYPE` record instead.' },
      { q: 'You `OPEN c;` twice without closing. Error?', opts: ['ORA-06511: cursor already open', 'ORA-01001: invalid cursor', 'ORA-01403: no data found', 'none'], a: 0, why: 'CURSOR_ALREADY_OPEN.' },
      { q: 'Which loop never needs an explicit OPEN/CLOSE?', opts: ['Cursor FOR loop', 'LOOP … EXIT WHEN', 'WHILE c%FOUND', 'all of them'], a: 0, why: 'It is the shortest and safest form.' }
    ]
  });
})();
