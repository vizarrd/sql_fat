(function () {
  const { h, h3, p, list, olist, sql, pl, tip, trap, exam, note, table, cmp, flow } = D;
  const R = (re, msg) => ({ re, msg });
  const DS = `
CREATE TABLE student (grno NUMBER(3), name VARCHAR2(15), m1 NUMBER(3), m2 NUMBER(3), total NUMBER(3), per NUMBER(5,2));
CREATE TABLE emp (no NUMBER(5));
CREATE TABLE emp1 (no NUMBER(5), name VARCHAR2(30));
CREATE TABLE emp1_backup (no NUMBER(5), name VARCHAR2(30), backup_date DATE);
INSERT INTO emp1 VALUES (1, 'Rishi5');
INSERT INTO emp1 VALUES (2, 'RishiVIT5');
INSERT INTO emp1 VALUES (3, 'Anu');
CREATE TABLE employee (empno NUMBER(4) PRIMARY KEY, ename VARCHAR2(15), sal NUMBER(8,2), deptno NUMBER(2));
INSERT INTO employee VALUES (1, 'Asha', 5000, 1);
INSERT INTO employee VALUES (2, 'Ravi', 4000, 2);
INSERT INTO employee VALUES (3, 'Meena', 4500, 2);
INSERT INTO employee VALUES (4, 'Kiran', 3000, 2);
INSERT INTO employee VALUES (5, 'Latha', 6000, 3);
INSERT INTO employee VALUES (6, 'Divya', 3500, 2);
CREATE TABLE emp_audit (empno NUMBER(4), action VARCHAR2(10));
`.trim();
  const E = (stmt) => `BEGIN\n  ${stmt}\n  DBMS_OUTPUT.PUT_LINE('ok');\nEXCEPTION WHEN OTHERS THEN\n  DBMS_OUTPUT.PUT_LINE('error ' || SQLCODE);\nEND;\n/`;

  Weeks.push({
    id: 'w11', num: 11, nav: 'Triggers', title: 'Triggers – automatic reactions to data changes', lab: 'Lab sheet 11', time: '50 min',
    summary: 'Stored programs the database fires by itself on INSERT / UPDATE / DELETE: timing (BEFORE/AFTER), level (row/statement), :NEW and :OLD, and rejecting changes with RAISE_APPLICATION_ERROR.',
    blurb: 'BEFORE/AFTER · row/statement · :NEW :OLD · RAISE_APPLICATION_ERROR · backup & audit.',
    tldr: [
      'A **trigger** is a named PL/SQL block Oracle runs **automatically** when an event (INSERT / UPDATE / DELETE on a table) happens. Nobody calls it.',
      '**BEFORE** runs prior to the change (validate or *fix* values). **AFTER** runs once the change is done (audit, cascade). **FOR EACH ROW** = once per affected row, otherwise once per statement.',
      '`:NEW.col` = the incoming value (INSERT/UPDATE), `:OLD.col` = the value before (UPDATE/DELETE). You can **assign** `:NEW` only in a BEFORE row trigger.',
      'Reject a change with `RAISE_APPLICATION_ERROR(-20xxx, \'message\')` – the whole statement is rolled back.',
      'Triggers are **not** fired by `TRUNCATE`. Extra logic hidden in triggers is hard to debug and slows DML.'
    ],
    lesson: [
      h('What a trigger is'),
      p('A trigger is a stored procedure that is **invoked automatically** by the DBMS when a defined event happens – an *active database*. Typical jobs: enforce rules a constraint can’t express, keep an **audit log**, **back up** deleted rows, maintain **derived columns** (total, percentage), cascade changes.'),
      table(['Part', 'Meaning', 'Example'], [
        ['**Event**', 'the DML that activates it', '`INSERT OR UPDATE ON student`'],
        ['**Restriction** (optional)', 'a condition that must be TRUE for it to fire', '`WHEN (NEW.sal > 10000)`'],
        ['**Action**', 'the PL/SQL block executed', '`BEGIN … END;`']]),

      h('Syntax'),
      pl(`CREATE OR REPLACE TRIGGER trigger_name
  BEFORE | AFTER                         -- timing
  INSERT | UPDATE [OF column] | DELETE   -- event(s), combine with OR
  ON table_name
  [REFERENCING OLD AS old NEW AS new]    -- optional, rename the pseudo-records
  [FOR EACH ROW]                         -- row-level (omit → statement-level)
  [WHEN (condition)]                     -- optional restriction (no colon before new/old here)
[DECLARE variables]
BEGIN
  -- PL/SQL statements
END;
/`, { static: true, note: 'The lab sheet writes `references old as old new as new` – it is just the default naming, so you may leave it out.' }),
      table(['Category', 'Values', 'Notes'], [
        ['DML event', '`INSERT`, `UPDATE`, `DELETE`', '`UPDATE OF sal` fires only if `sal` is in the SET list'],
        ['Timing', '`BEFORE`, `AFTER`, `INSTEAD OF` (views)', 'BEFORE = validate/modify · AFTER = react'],
        ['Level', '**Row** (`FOR EACH ROW`) · **Statement** (default)', 'row: once per affected row (not at all if 0 rows) · statement: once per statement, even for 0 rows']]),
      flow('BEFORE statement', 'BEFORE each row', 'the row changes', 'AFTER each row', 'AFTER statement'),

      h(':NEW and :OLD'),
      table(['Event', ':OLD', ':NEW'], [
        ['INSERT', 'all NULL', 'the row being inserted'],
        ['UPDATE', 'values before the update', 'values after the update'],
        ['DELETE', 'the row being deleted', 'all NULL']]),
      list('Write them with a colon inside the body (`:NEW.sal`), without one in `WHEN (NEW.sal > 0)`.', '**Only a BEFORE row trigger may assign** `:NEW.col := …` (that’s how derived columns are filled). In an AFTER trigger it raises ORA-04084.', 'Use `INSERTING`, `UPDATING`, `DELETING` (booleans) when one trigger handles several events.'),

      h('Example 1 – derive columns (BEFORE, row, assigns :NEW)'),
      pl(`CREATE OR REPLACE TRIGGER stud
  BEFORE INSERT OR UPDATE ON student
  FOR EACH ROW
DECLARE
  tot NUMBER(3);
BEGIN
  tot := :NEW.m1 + :NEW.m2;
  :NEW.total := tot;
  :NEW.per   := tot / 2;
END;
/
INSERT INTO student VALUES (1, 'ABCDE', 20, 20, 0, 0);
INSERT INTO student VALUES (2, 'PQRS', 10, 30, 0, 0);
UPDATE student SET m1 = 100 WHERE grno = 1;
SELECT * FROM student ORDER BY grno;`, { note: 'Even though the INSERT supplies 0 for total and per, the trigger overwrites them before the row is stored. Updating `m1` recomputes them again.' }),

      h('Example 2 – reject bad data (RAISE_APPLICATION_ERROR)'),
      pl(`CREATE OR REPLACE TRIGGER positive
  BEFORE INSERT OR DELETE ON emp
  FOR EACH ROW
BEGIN
  IF :NEW.no < 0 THEN
    RAISE_APPLICATION_ERROR(-20005, 'Insert only positive value');
  END IF;
END;
/
INSERT INTO emp VALUES (1020);
INSERT INTO emp VALUES (-7);
SELECT * FROM emp;`, { fresh: true, expectError: true, setup: 'CREATE TABLE emp (no NUMBER(5));', note: 'Error numbers for your own messages must lie between **-20000 and -20999**. The failed statement is undone; the first insert stays.' }),

      h('Example 3 – back up deleted rows (BEFORE DELETE, uses :OLD)'),
      pl(`CREATE OR REPLACE TRIGGER backup
  BEFORE DELETE ON emp1
  FOR EACH ROW
BEGIN
  INSERT INTO emp1_backup VALUES (:OLD.no, :OLD.name, SYSDATE);
END;
/
DELETE FROM emp1 WHERE name = 'RishiVIT5';
SELECT no, name FROM emp1_backup;
SELECT * FROM emp1 ORDER BY no;`),

      h('Example 4 – one audit trigger for all events (AFTER, predicates)'),
      pl(`CREATE OR REPLACE TRIGGER audit_emp
  AFTER INSERT OR UPDATE OR DELETE ON employee
  FOR EACH ROW
BEGIN
  IF INSERTING THEN
    INSERT INTO emp_audit VALUES (:NEW.empno, 'INSERT');
  ELSIF UPDATING THEN
    INSERT INTO emp_audit VALUES (:NEW.empno, 'UPDATE');
  ELSE
    INSERT INTO emp_audit VALUES (:OLD.empno, 'DELETE');
  END IF;
END;
/
INSERT INTO employee VALUES (7, 'Zoya', 3200, 1);
UPDATE employee SET sal = sal + 100 WHERE deptno = 3;
DELETE FROM employee WHERE empno = 4;
SELECT * FROM emp_audit;`),

      h('Row vs statement level'),
      pl(`CREATE OR REPLACE TRIGGER stmt_t AFTER INSERT ON emp
BEGIN DBMS_OUTPUT.PUT_LINE('statement trigger fired'); END;
/
CREATE OR REPLACE TRIGGER row_t AFTER INSERT ON emp FOR EACH ROW
BEGIN DBMS_OUTPUT.PUT_LINE('row trigger fired for ' || :NEW.no); END;
/
INSERT INTO emp VALUES (1);
INSERT INTO emp SELECT no + 10 FROM emp;      -- touches 1 row
INSERT INTO emp SELECT no + 100 FROM emp WHERE 1 = 0;   -- touches 0 rows`, { fresh: true, setup: 'CREATE TABLE emp (no NUMBER(5));', note: 'The statement trigger fires even for the empty INSERT; the row trigger fires only for rows that really exist.' }),
      trap('**Mutating table (ORA-04091):** a *row* trigger may not query or change the table that fired it (the table is “in flux”). Counting rows of the same table inside a row trigger works for a single-row `INSERT … VALUES` but fails for multi-row statements, `UPDATE` and `DELETE`. Real-world fix: a statement-level / compound trigger, or a separate summary table.'),
      exam('Lab exercise (b) – *“a department may not have more than 5 employees”* – is the classic example: count the department’s current rows in a BEFORE INSERT trigger and raise an error when it is already 5. Mention the mutating-table limitation if asked “why might this fail?”.'),

      h('Managing triggers'),
      table(['Task', 'Command'], [
        ['list', '`SELECT trigger_name, trigger_type, triggering_event, table_name FROM user_triggers;`'],
        ['disable / enable one', '`ALTER TRIGGER stud DISABLE;` · `ALTER TRIGGER stud ENABLE;`'],
        ['disable / enable all on a table', '`ALTER TABLE student DISABLE ALL TRIGGERS;`'],
        ['remove', '`DROP TRIGGER stud;`'],
        ['compile errors', '`SHOW ERRORS TRIGGER stud;`']]),
      h3('Advantages and limitations (from the lecture)'),
      cmp({ title: '👍 Advantages', t: 'Automatic – can’t be bypassed by applications.\nCentral place for integrity/audit rules.\nAlternative way to check data integrity (uniqueness, ranges…).' }, { title: '👎 Limitations', t: 'Performance overhead on every DML.\nHard to debug – invisible to client code.\nBusiness rules hidden in the database.\nNot fired by TRUNCATE.' })
    ],
    cheat: [
      ['skeleton', 'CREATE OR REPLACE TRIGGER t\n  BEFORE|AFTER INSERT|UPDATE [OF col]|DELETE ON tbl\n  [FOR EACH ROW] [WHEN (NEW.x > 0)]\nBEGIN\n  …\nEND;\n/'],
      ['pseudo-records', ':NEW.col  (INSERT/UPDATE)   :OLD.col  (UPDATE/DELETE)   assign :NEW only in BEFORE row triggers'],
      ['reject', "RAISE_APPLICATION_ERROR(-20001, 'message');   -- code in -20000 … -20999"],
      ['predicates', 'IF INSERTING THEN … ELSIF UPDATING THEN … ELSIF DELETING THEN … END IF;'],
      ['manage', 'DROP TRIGGER t;  ALTER TRIGGER t DISABLE|ENABLE;  SELECT * FROM user_triggers;']
    ],
    sheetTitle: 'Lab Sheet 11 – Triggers',
    scenario: 'Create the trigger in the editor; the checker then runs hidden INSERT/UPDATE/DELETE statements (some of which your trigger must reject) and compares the printed results and table contents with the model answer. Use the exact **trigger names** and **error numbers** given. In the checker an error is shown as `error <SQLCODE>` (e.g. `error -20005`).',
    dataset: { name: 'STUDENT / EMP / EMP1 / EMPLOYEE', sql: DS, note: '`student(grno,name,m1,m2,total,per)`, `emp(no)`, `emp1` + `emp1_backup`, `employee(empno,ename,sal,deptno)` (department 2 already has 4 people) and an empty `emp_audit`.' },
    practice: [
      { id: 't1', type: 'plsql', q: '**1. Percentage trigger.** Create `stud_calc` (BEFORE INSERT OR UPDATE, row level) on `student` that sets `total = m1 + m2` and `per = total / 2` automatically.', starter: 'CREATE OR REPLACE TRIGGER stud_calc\n  BEFORE INSERT OR UPDATE ON student\n  FOR EACH ROW\nBEGIN\n  NULL;\nEND;', answer: 'CREATE OR REPLACE TRIGGER stud_calc\n  BEFORE INSERT OR UPDATE ON student\n  FOR EACH ROW\nDECLARE\n  tot NUMBER(3);\nBEGIN\n  tot := :NEW.m1 + :NEW.m2;\n  :NEW.total := tot;\n  :NEW.per := tot / 2;\nEND;', driver: "INSERT INTO student VALUES (1, 'ABCDE', 20, 20, 0, 0);\nINSERT INTO student VALUES (2, 'PQRS', 10, 30, 0, 0);\nINSERT INTO student VALUES (3, 'WXYZ', 91, 77, 0, 0);\nUPDATE student SET m2 = 100 WHERE grno = 1;", verify: 'SELECT * FROM student ORDER BY grno', needs: [R(':new\\.total\\s*:=', 'assigns :NEW.total'), R(':new\\.per\\s*:=', 'assigns :NEW.per')], hint: 'Assign to :NEW.total and :NEW.per inside a BEFORE … FOR EACH ROW trigger.', explain: 'Assignments to `:NEW` are only possible in BEFORE row triggers – the changed row is what gets stored.' },
      { id: 't2', type: 'plsql', q: '**2. Positive values only.** Create `positive` (BEFORE INSERT on `emp`, row level) that raises error **-20005** (`Insert only positive value`) when `:NEW.no < 0`.', starter: 'CREATE OR REPLACE TRIGGER positive\n  BEFORE INSERT ON emp\n  FOR EACH ROW\nBEGIN\n  NULL;\nEND;', answer: "CREATE OR REPLACE TRIGGER positive\n  BEFORE INSERT ON emp\n  FOR EACH ROW\nBEGIN\n  IF :NEW.no < 0 THEN\n    RAISE_APPLICATION_ERROR(-20005, 'Insert only positive value');\n  END IF;\nEND;", driver: [E('INSERT INTO emp VALUES (1020);'), E('INSERT INTO emp VALUES (-7);'), E('INSERT INTO emp VALUES (55);'), E('INSERT INTO emp VALUES (-1);')].join('\n'), verify: 'SELECT * FROM emp ORDER BY no', needs: [R('raise_application_error\\s*\\(\\s*-20005', 'uses RAISE_APPLICATION_ERROR(-20005, …)')], hint: 'IF :NEW.no < 0 THEN RAISE_APPLICATION_ERROR(-20005, \'…\'); END IF;' },
      { id: 't3', type: 'plsql', q: '**3. Backup on delete.** Create `backup` (BEFORE DELETE on `emp1`, row level) that copies each deleted row into `emp1_backup (no, name, backup_date)` with `SYSDATE`.', starter: 'CREATE OR REPLACE TRIGGER backup\n  BEFORE DELETE ON emp1\n  FOR EACH ROW\nBEGIN\n  NULL;\nEND;', answer: 'CREATE OR REPLACE TRIGGER backup\n  BEFORE DELETE ON emp1\n  FOR EACH ROW\nBEGIN\n  INSERT INTO emp1_backup VALUES (:OLD.no, :OLD.name, SYSDATE);\nEND;', driver: "DELETE FROM emp1 WHERE name = 'RishiVIT5';\nDELETE FROM emp1 WHERE no = 3;", verify: 'SELECT no, name FROM emp1_backup ORDER BY no', needs: [R(':old\\.no', 'uses :OLD.no'), R(':old\\.name', 'uses :OLD.name')], hint: 'In a DELETE trigger the row is available through :OLD.' },
      { id: 'a', type: 'plsql', q: '**(a) Salary may only go up.** Create `chk_sal` (BEFORE UPDATE OF sal on `employee`, row level): if the new salary is **not greater** than the old one raise **-20010**.', starter: 'CREATE OR REPLACE TRIGGER chk_sal\n  BEFORE UPDATE OF sal ON employee\n  FOR EACH ROW\nBEGIN\n  NULL;\nEND;', answer: "CREATE OR REPLACE TRIGGER chk_sal\n  BEFORE UPDATE OF sal ON employee\n  FOR EACH ROW\nBEGIN\n  IF :NEW.sal <= :OLD.sal THEN\n    RAISE_APPLICATION_ERROR(-20010, 'New salary must be greater than the old salary');\n  END IF;\nEND;", driver: [E('UPDATE employee SET sal = sal + 500 WHERE empno = 1;'), E('UPDATE employee SET sal = sal - 100 WHERE empno = 2;'), E('UPDATE employee SET sal = sal WHERE empno = 3;'), E("UPDATE employee SET ename = 'Ravi K' WHERE empno = 2;")].join('\n'), verify: 'SELECT empno, ename, sal FROM employee ORDER BY empno', hint: 'Compare :NEW.sal with :OLD.sal. “Not greater” also covers equal.', explain: 'The last statement changes only `ename`, so a trigger defined `UPDATE OF sal` does not fire at all.' },
      { id: 'b', type: 'plsql', q: '**(b) Department 2 is capped at 5.** Create `dept2_limit` (BEFORE INSERT on `employee`, row level): if `:NEW.deptno = 2` and the department already has **5 or more** employees, raise **-20020**.', starter: 'CREATE OR REPLACE TRIGGER dept2_limit\n  BEFORE INSERT ON employee\n  FOR EACH ROW\nDECLARE\n  v_count NUMBER;\nBEGIN\n  NULL;\nEND;', answer: "CREATE OR REPLACE TRIGGER dept2_limit\n  BEFORE INSERT ON employee\n  FOR EACH ROW\nDECLARE\n  v_count NUMBER;\nBEGIN\n  IF :NEW.deptno = 2 THEN\n    SELECT COUNT(*) INTO v_count FROM employee WHERE deptno = 2;\n    IF v_count >= 5 THEN\n      RAISE_APPLICATION_ERROR(-20020, 'Department 2 already has 5 employees');\n    END IF;\n  END IF;\nEND;", driver: [E("INSERT INTO employee VALUES (7, 'Neha', 3100, 2);"), E("INSERT INTO employee VALUES (8, 'Omar', 3200, 2);"), E("INSERT INTO employee VALUES (9, 'Pia', 3300, 3);")].join('\n'), verify: 'SELECT empno, deptno FROM employee ORDER BY empno', hint: 'Count the current rows of department 2 *before* the new one goes in: allowed while count < 5.', explain: 'Department 2 starts with 4 people: Neha makes 5 (allowed), Omar would be the 6th (rejected). In real Oracle this single-row INSERT is fine, but a multi-row `INSERT … SELECT` would hit ORA-04091 (mutating table).' },
      { id: 'au', type: 'plsql', q: '**Audit trigger.** Create `audit_emp` (AFTER INSERT OR UPDATE OR DELETE on `employee`, row level) that writes `(empno, action)` into `emp_audit` where action is `INSERT`, `UPDATE` or `DELETE`.', starter: 'CREATE OR REPLACE TRIGGER audit_emp\n  AFTER INSERT OR UPDATE OR DELETE ON employee\n  FOR EACH ROW\nBEGIN\n  NULL;\nEND;', answer: "CREATE OR REPLACE TRIGGER audit_emp\n  AFTER INSERT OR UPDATE OR DELETE ON employee\n  FOR EACH ROW\nBEGIN\n  IF INSERTING THEN\n    INSERT INTO emp_audit VALUES (:NEW.empno, 'INSERT');\n  ELSIF UPDATING THEN\n    INSERT INTO emp_audit VALUES (:NEW.empno, 'UPDATE');\n  ELSE\n    INSERT INTO emp_audit VALUES (:OLD.empno, 'DELETE');\n  END IF;\nEND;", driver: "INSERT INTO employee VALUES (7, 'Zoya', 3200, 1);\nUPDATE employee SET sal = sal + 100 WHERE deptno = 3;\nDELETE FROM employee WHERE empno = 4;", verify: 'SELECT * FROM emp_audit ORDER BY empno', hint: 'Use IF INSERTING … ELSIF UPDATING … ELSE. For DELETE the key is in :OLD.', needs: [R('inserting', 'uses INSERTING'), R('updating', 'uses UPDATING')] },
      { id: 'st', type: 'plsql', q: '**Statement-level trigger.** Create `after_emp_ins` (AFTER INSERT on `emp`, **no** FOR EACH ROW) that prints `Insert finished` **once per statement**.', starter: 'CREATE OR REPLACE TRIGGER after_emp_ins\n  AFTER INSERT ON emp\nBEGIN\n  NULL;\nEND;', answer: "CREATE OR REPLACE TRIGGER after_emp_ins\n  AFTER INSERT ON emp\nBEGIN\n  DBMS_OUTPUT.PUT_LINE('Insert finished');\nEND;", driver: "INSERT INTO emp VALUES (1);\nINSERT INTO emp VALUES (2);\nINSERT INTO emp SELECT no + 10 FROM emp;\nINSERT INTO emp SELECT no + 100 FROM emp WHERE no > 1000;", needs: [R('^(?![\\s\\S]*for\\s+each\\s+row)', 'is a statement-level trigger (no FOR EACH ROW)')], hint: 'Leave out FOR EACH ROW. Notice how many times it prints for the 2-row INSERT … SELECT.', explain: 'Four statements ⇒ four lines – even for the INSERT that affects 2 rows, and even for the one that affects 0.' },
      { id: 'f1', type: 'fill', q: '**Fill the blanks** – a trigger that upper-cases a name before it is stored.', code: `CREATE OR REPLACE ___1___ up_name
  ___2___ INSERT ON student
  ___3___ ___4___ ROW
BEGIN
  :___5___.name := UPPER(:NEW.name);
END;
___6___`, blanks: [['TRIGGER'], ['BEFORE'], ['FOR'], ['EACH'], ['NEW'], ['/']], hint: 'It must be BEFORE (so :NEW can still be changed) and row-level.' },
      { id: 'b1', type: 'build', q: '**Put the lines in order** – the “positive value” trigger.', lines: ['CREATE OR REPLACE TRIGGER positive', '  BEFORE INSERT ON emp', '  FOR EACH ROW', 'BEGIN', '  IF :NEW.no < 0 THEN', "    RAISE_APPLICATION_ERROR(-20005, 'Insert only positive value');", '  END IF;', 'END;', '/'], hint: 'Header lines → BEGIN → IF … END IF → END → /' },
      { id: 'm1', type: 'mcq', q: 'You want to fill `total` automatically from `m1` and `m2` when a row is inserted. Which trigger?', opts: ['BEFORE INSERT … FOR EACH ROW with `:NEW.total := …`', 'AFTER INSERT … FOR EACH ROW with `:NEW.total := …`', 'BEFORE INSERT statement-level', 'AFTER DELETE … FOR EACH ROW'], a: 0, why: 'Only a BEFORE row trigger can modify `:NEW`; in an AFTER trigger the row is already stored.' },
      { id: 'm2', type: 'mcq', q: 'In a trigger fired by `DELETE FROM emp WHERE no = 5;` what is `:NEW.no`?', opts: ['NULL', '5', 'the next row’s value', 'an error'], a: 0, why: 'DELETE has only `:OLD` values; every `:NEW` field is NULL.' },
      { id: 'm3', type: 'mcq', q: '`TRUNCATE TABLE student;` – does a DELETE trigger on `student` fire?', opts: ['No – TRUNCATE is DDL, not DELETE', 'Yes, once', 'Yes, for every row', 'Only a BEFORE trigger'], a: 0, why: 'The slides state: statements other than INSERT/UPDATE/DELETE (for example TRUNCATE) do not invoke the trigger.' }
    ],
    quiz: [
      { q: 'Which trigger type fires once per affected row?', opts: ['FOR EACH ROW (row-level)', 'statement-level', 'INSTEAD OF only', 'AFTER only'], a: 0, why: 'Without FOR EACH ROW it is a statement trigger.' },
      { q: 'To reject an INSERT with your own error message you call…', opts: ['RAISE_APPLICATION_ERROR(-20001, \'msg\')', 'DBMS_OUTPUT.PUT_LINE(\'msg\')', 'ROLLBACK;', 'EXIT;'], a: 0, why: 'Codes -20000…-20999 are reserved for applications.' },
      { q: 'A trigger needs the value a column had **before** an UPDATE:', opts: [':OLD.column', ':NEW.column', 'BEFORE.column', 'OLD_VALUE(column)'], a: 0, why: ':OLD = before, :NEW = after.' },
      { q: 'Which can happen in a **BEFORE** row trigger but not an AFTER one?', opts: ['Assigning :NEW.col := value', 'Reading :OLD', 'Calling RAISE_APPLICATION_ERROR', 'Inserting into another table'], a: 0, why: 'ORA-04084 otherwise.' },
      { q: 'Firing order for one row-level INSERT:', opts: ['BEFORE stmt → BEFORE row → AFTER row → AFTER stmt', 'AFTER row → BEFORE row', 'BEFORE row → BEFORE stmt → AFTER stmt → AFTER row', 'only the row triggers'], a: 0, why: 'Statement triggers wrap row triggers.' },
      { q: 'A row trigger on `emp` runs `SELECT COUNT(*) FROM emp` while an UPDATE is in progress. Typical error?', opts: ['ORA-04091 mutating table', 'ORA-00942 table not found', 'ORA-01403 no data found', 'No error ever'], a: 0, why: 'A row trigger can’t read/modify the table it is firing on (except single-row INSERT … VALUES).' },
      { q: 'Which is a drawback of triggers?', opts: ['Hidden logic that is hard to debug and slows DML', 'They can’t access :NEW', 'They only run on SELECT', 'They need manual calling'], a: 0, why: 'From the lecture’s “Limitations of Triggers”.' }
    ]
  });
})();
