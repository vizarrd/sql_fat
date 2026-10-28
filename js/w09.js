(function () {
  const { h, h3, p, list, olist, sql, pl, tip, trap, exam, note, table, cmp, flow } = D;
  const R = (re, msg) => ({ re, msg });
  const DS = `
CREATE TABLE student (sname VARCHAR2(20), regno NUMBER PRIMARY KEY, dept VARCHAR2(5), year NUMBER(1), mark1 NUMBER(3), mark2 NUMBER(3), mark3 NUMBER(3), total NUMBER(3), average NUMBER(5,2));
INSERT INTO student (sname, regno, dept, year, mark1, mark2, mark3) VALUES ('Anil', 101, 'CSE', 2, 80, 70, 90);
INSERT INTO student (sname, regno, dept, year, mark1, mark2, mark3) VALUES ('Ravi', 102, 'ECE', 2, 60, 55, 49);
INSERT INTO student (sname, regno, dept, year, mark1, mark2, mark3) VALUES ('Meena', 103, 'ECE', 3, 72, 80, 91);
INSERT INTO student (sname, regno, dept, year, mark1, mark2, mark3) VALUES ('Divya', 104, 'CSE', 3, 35, 60, 70);
INSERT INTO student (sname, regno, dept, year, mark1, mark2, mark3) VALUES ('Arun', 105, 'EEE', 1, 88, 92, 79);
INSERT INTO student (sname, regno, dept, year, mark1, mark2, mark3) VALUES ('Latha', 106, 'CSE', 1, 40, 45, 50);
`.trim();
  const VSTUD = 'SELECT regno, sname, dept, total, ROUND(average, 2) FROM student ORDER BY regno';

  Weeks.push({
    id: 'w9', num: 9, nav: 'Procedures & Functions', title: 'Stored Procedures & Functions', lab: 'Lab sheet 9', time: '50 min',
    summary: 'Named PL/SQL blocks stored in the database: parameters (IN/OUT/IN OUT), calling them, and functions that RETURN a value.',
    blurb: 'CREATE PROCEDURE / FUNCTION · IN OUT · EXEC · RETURN · use in SQL.',
    tldr: [
      '**Procedure** = does something (insert, update, print); **function** = computes and `RETURN`s one value, so it can sit inside an expression or a `SELECT`.',
      'Header: `CREATE OR REPLACE PROCEDURE name (p IN type, q OUT type) AS … BEGIN … END;` + `/` (no `DECLARE`; variables go between `AS` and `BEGIN`).',
      'Call a procedure with `EXEC name(args);` or inside a block. Call a function in an expression: `x := fn(5);` or `SELECT fn(5) FROM dual;`.',
      'Parameters are written **without size**: `p_name VARCHAR2`, not `VARCHAR2(20)`. Use `table.col%TYPE` to copy a column’s type.',
      'Name parameters `p_xxx` – a parameter called like a column can silently break `WHERE regno = regno`.'
    ],
    lesson: [
      h('Why stored subprograms?'),
      list('**Reuse** – write the logic once, call it from anywhere.', '**Security** – users get `EXECUTE` on the procedure without direct access to the tables.', '**Speed** – compiled once, stored in the database, fewer round-trips.', '**Maintenance** – change it in one place.'),

      h('Procedure syntax'),
      pl(`CREATE OR REPLACE PROCEDURE greetings
AS                                     -- AS or IS, then (optional) local variables
BEGIN
  DBMS_OUTPUT.PUT_LINE('Hi Howdy!');
  DBMS_OUTPUT.PUT_LINE('Hello World!');
END;
/
EXEC greetings;`, { note: 'This is the lab’s `program1.sql`. After `/` Oracle prints *Procedure created.*; `EXEC greetings;` runs it. Compile errors? → `SHOW ERRORS`.' }),
      flow('CREATE OR REPLACE PROCEDURE name (params)', 'AS / IS + local variables', 'BEGIN … END;', '/ (compile)', 'EXEC name(args) (run)'),

      h('Parameters and modes'),
      table(['Mode', 'Meaning', 'Caller must pass'], [
        ['`IN` (default)', 'value goes **in**; read-only inside', 'any expression'],
        ['`OUT`', 'procedure **returns** a value through it', 'a variable'],
        ['`IN OUT`', 'goes in, modified, comes back', 'a variable']]),
      pl(`CREATE OR REPLACE PROCEDURE emp_info (
  p_id    IN  NUMBER,                 -- no size on the type!
  p_name  OUT VARCHAR2,
  p_sal   OUT NUMBER
) AS
BEGIN
  SELECT name, salary INTO p_name, p_sal FROM employee WHERE empid = p_id;
END;
/
DECLARE
  v_name VARCHAR2(20);
  v_sal  NUMBER;
BEGIN
  emp_info(3, v_name, v_sal);          -- OUT arguments must be variables
  DBMS_OUTPUT.PUT_LINE(v_name || ' earns ' || v_sal);
END;
/`, { setup: "CREATE TABLE employee (empid NUMBER PRIMARY KEY, name VARCHAR2(15), salary NUMBER); INSERT INTO employee VALUES (3,'Meena',38000);", fresh: true }),
      list('**Positional** call: `emp_info(3, v_name, v_sal)`. **Named** call: `emp_info(p_id => 3, p_name => v_name, p_sal => v_sal)`.', 'Default values: `p_rate IN NUMBER DEFAULT 10` – the caller may omit it.'),

      h('The lab’s student procedures'),
      p('The sheet’s `stud` procedure (also in the screenshot): parameters take their types from the **table columns** with `%type`.'),
      pl(`CREATE OR REPLACE PROCEDURE stud (
  p_name   student.sname%TYPE,
  p_regno  student.regno%TYPE,
  p_dept   student.dept%TYPE,
  p_year   student.year%TYPE,
  p_m1 student.mark1%TYPE, p_m2 student.mark2%TYPE, p_m3 student.mark3%TYPE
) AS
BEGIN
  INSERT INTO student (sname, regno, dept, year, mark1, mark2, mark3)
  VALUES (p_name, p_regno, p_dept, p_year, p_m1, p_m2, p_m3);
END;
/
EXEC stud('Kiran', 107, 'EEE', 2, 70, 65, 80);
SELECT sname, regno, total FROM student WHERE regno = 107;`, { note: 'The screenshot’s `INSERT INTO student VALUES (…7 values…)` only works if the table has exactly 7 columns. Our table also has `total` and `average`, so we **name the columns** – best practice anyway.' }),
      trap('A parameter or variable with the **same name as a column** hides nothing in the `VALUES` list but breaks `WHERE`: `DELETE FROM student WHERE regno = regno;` compares the column with *itself* and deletes **everyone**. Prefix parameters with `p_`.'),
      pl(`CREATE OR REPLACE PROCEDURE update_totals AS
BEGIN
  UPDATE student SET total = mark1 + mark2 + mark3,
                     average = (mark1 + mark2 + mark3) / 3;
END;
/
EXEC update_totals;
SELECT regno, total, ROUND(average, 2) AS average FROM student ORDER BY regno;`),

      h('Functions'),
      pl(`CREATE OR REPLACE FUNCTION square (p_n IN NUMBER)
RETURN NUMBER                          -- declare the return type (no size)
AS
BEGIN
  RETURN p_n * p_n;                    -- every path must end in RETURN
END;
/
DECLARE x NUMBER;
BEGIN
  x := square(7);
  DBMS_OUTPUT.PUT_LINE('7 squared = ' || x);
END;
/
SELECT square(12) FROM dual;           -- usable directly in SQL`),
      table(['', 'Procedure', 'Function'], [
        ['purpose', 'perform an action', 'compute and return a value'],
        ['RETURN', 'optional (just exits)', '**mandatory**, with a value of the declared type'],
        ['called as', '`EXEC p(…);` – a statement', 'inside an expression / SELECT / WHERE'],
        ['values back', 'through OUT parameters (0..n)', 'one return value (plus OUT params, not recommended)'],
        ['in SQL queries', 'no', 'yes (if it doesn’t modify data)']]),
      h3('Worked example: the electricity-bill function'),
      p('Slabs: ≤ 100 units → ₹1/unit · next 100 → ₹2 · next 100 → ₹3 · above 300 → ₹5. For 350 units: `100×1 + 100×2 + 100×3 + 50×5 = 850`.'),
      pl(`CREATE OR REPLACE FUNCTION eb_bill (p_units IN NUMBER) RETURN NUMBER AS
  v_bill NUMBER := 0;
BEGIN
  IF p_units <= 100 THEN
    v_bill := p_units * 1;
  ELSIF p_units <= 200 THEN
    v_bill := 100 * 1 + (p_units - 100) * 2;
  ELSIF p_units <= 300 THEN
    v_bill := 100 * 1 + 100 * 2 + (p_units - 200) * 3;
  ELSE
    v_bill := 100 * 1 + 100 * 2 + 100 * 3 + (p_units - 300) * 5;
  END IF;
  RETURN v_bill;
END;
/
SELECT eb_bill(50) AS u50, eb_bill(150) AS u150, eb_bill(250) AS u250, eb_bill(350) AS u350 FROM dual;`),
      exam('Slab problems: compute **cumulative** amounts of the full lower slabs, then add `(units − slab_start) × rate` for the slab you are in. Test the boundaries (100, 101, 200, 300).'),

      h('Housekeeping'),
      table(['Task', 'Command'], [
        ['see compile errors', '`SHOW ERRORS` (SQL*Plus) or `SELECT * FROM user_errors;`'],
        ['list your subprograms', '`SELECT object_name, object_type FROM user_objects WHERE object_type IN (\'PROCEDURE\',\'FUNCTION\');`'],
        ['view the source', '`SELECT text FROM user_source WHERE name = \'GREETINGS\';`'],
        ['delete', '`DROP PROCEDURE greetings;` · `DROP FUNCTION eb_bill;`'],
        ['re-create', '`CREATE OR REPLACE …` (keeps grants)']]),
      sql(`-- a recursive function: functions can call themselves
CREATE OR REPLACE FUNCTION fact (p_n NUMBER) RETURN NUMBER AS
BEGIN
  IF p_n <= 1 THEN RETURN 1; END IF;
  RETURN p_n * fact(p_n - 1);
END;
/
SELECT fact(5) FROM dual;`, { fresh: true })
    ],
    cheat: [
      ['procedure', 'CREATE OR REPLACE PROCEDURE p (a IN NUMBER, b OUT VARCHAR2) AS\n  v NUMBER;\nBEGIN\n  …\nEND;\n/\nEXEC p(1, v_out);'],
      ['function', 'CREATE OR REPLACE FUNCTION f (a NUMBER) RETURN NUMBER AS\nBEGIN\n  RETURN a * 2;\nEND;\n/\nSELECT f(3) FROM dual;'],
      ['modes', 'IN (default, read-only) · OUT (returns) · IN OUT · DEFAULT value · named call p(x => 1)'],
      ['admin', 'SHOW ERRORS;  DROP PROCEDURE p;  SELECT * FROM user_source WHERE name = \'P\';']
    ],
    sheetTitle: 'Lab Sheet 9 – PL/SQL procedures and functions',
    scenario: 'Table `student (sname, regno, dept, year, mark1, mark2, mark3, total, average)`. Write the subprogram in the editor; the checker then **calls it** with test arguments and compares the output / table contents with the model answer. Use the exact names and parameter order given.',
    dataset: { name: 'STUDENT', sql: DS, note: '`total` and `average` start as NULL – they are filled by the update procedure (exercise 2).' },
    practice: [
      { id: 'g0', type: 'plsql', q: '**Warm-up – `greetings`.** Create procedure `greetings` that prints `Hi Howdy!` and `Hello World!` (two lines). Then it is called with `EXEC greetings;`.', starter: 'CREATE OR REPLACE PROCEDURE greetings\nAS\nBEGIN\n  NULL;\nEND;', answer: "CREATE OR REPLACE PROCEDURE greetings\nAS\nBEGIN\n  DBMS_OUTPUT.PUT_LINE('Hi Howdy!');\n  DBMS_OUTPUT.PUT_LINE('Hello World!');\nEND;", driver: 'EXEC greetings;' },
      { id: 'q1', type: 'plsql', q: '**1. Insert procedure.** Create `insert_student(p_name, p_regno, p_dept, p_year, p_m1, p_m2, p_m3)` that inserts a student **except** `total` and `average`. (The checker calls it twice.)', starter: 'CREATE OR REPLACE PROCEDURE insert_student (\n  p_name  student.sname%TYPE,\n  p_regno student.regno%TYPE,\n  p_dept  student.dept%TYPE,\n  p_year  student.year%TYPE,\n  p_m1 student.mark1%TYPE,\n  p_m2 student.mark2%TYPE,\n  p_m3 student.mark3%TYPE\n) AS\nBEGIN\n  -- INSERT …\n  NULL;\nEND;', answer: "CREATE OR REPLACE PROCEDURE insert_student (\n  p_name  student.sname%TYPE,\n  p_regno student.regno%TYPE,\n  p_dept  student.dept%TYPE,\n  p_year  student.year%TYPE,\n  p_m1 student.mark1%TYPE,\n  p_m2 student.mark2%TYPE,\n  p_m3 student.mark3%TYPE\n) AS\nBEGIN\n  INSERT INTO student (sname, regno, dept, year, mark1, mark2, mark3)\n  VALUES (p_name, p_regno, p_dept, p_year, p_m1, p_m2, p_m3);\nEND;", driver: "BEGIN\n  insert_student('Kiran', 107, 'EEE', 2, 70, 65, 80);\n  insert_student('Lata', 108, 'CSE', 3, 55, 60, 65);\nEND;", verify: VSTUD, hint: 'INSERT INTO student (col list) VALUES (parameters).', explain: 'Naming the columns means `total`/`average` are left NULL – required because the table has 9 columns but you supply 7 values.' },
      { id: 'q2', type: 'plsql', q: '**2. Update procedure.** Create `update_totals` (no parameters) that sets `total = mark1+mark2+mark3` and `average = total/3` for **all** students.', starter: 'CREATE OR REPLACE PROCEDURE update_totals AS\nBEGIN\n  NULL;\nEND;', answer: 'CREATE OR REPLACE PROCEDURE update_totals AS\nBEGIN\n  UPDATE student\n  SET total = mark1 + mark2 + mark3,\n      average = (mark1 + mark2 + mark3) / 3;\nEND;', driver: 'EXEC update_totals;', verify: VSTUD, hint: 'One UPDATE statement with two assignments.' },
      { id: 'q3', type: 'plsql', q: '**3. Delete procedure.** Create `delete_ece` that deletes the students of the **ECE** department and prints `<n> student(s) deleted` using `SQL%ROWCOUNT`.', starter: 'CREATE OR REPLACE PROCEDURE delete_ece AS\nBEGIN\n  NULL;\nEND;', answer: "CREATE OR REPLACE PROCEDURE delete_ece AS\nBEGIN\n  DELETE FROM student WHERE dept = 'ECE';\n  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' student(s) deleted');\nEND;", driver: 'EXEC delete_ece;', verify: VSTUD, hint: 'SQL%ROWCOUNT right after the DELETE.' },
      { id: 'q4', type: 'plsql', q: '**4. EB bill function.** Create `eb_bill(p_units NUMBER) RETURN NUMBER`: ≤100 units ₹1/unit; 101–200 ₹2; 201–300 ₹3; above 300 ₹5 (each rate applies only to units *within* its slab; 350 units → 850).', starter: 'CREATE OR REPLACE FUNCTION eb_bill (p_units NUMBER) RETURN NUMBER AS\nBEGIN\n  RETURN 0;\nEND;', answer: 'CREATE OR REPLACE FUNCTION eb_bill (p_units NUMBER) RETURN NUMBER AS\n  v_bill NUMBER := 0;\nBEGIN\n  IF p_units <= 100 THEN\n    v_bill := p_units * 1;\n  ELSIF p_units <= 200 THEN\n    v_bill := 100 + (p_units - 100) * 2;\n  ELSIF p_units <= 300 THEN\n    v_bill := 100 + 200 + (p_units - 200) * 3;\n  ELSE\n    v_bill := 100 + 200 + 300 + (p_units - 300) * 5;\n  END IF;\n  RETURN v_bill;\nEND;', driver: "BEGIN\n  FOR u IN (SELECT 0 AS n FROM dual UNION ALL SELECT 50 FROM dual UNION ALL SELECT 100 FROM dual UNION ALL SELECT 101 FROM dual UNION ALL SELECT 200 FROM dual UNION ALL SELECT 250 FROM dual UNION ALL SELECT 300 FROM dual UNION ALL SELECT 350 FROM dual) LOOP\n    DBMS_OUTPUT.PUT_LINE(u.n || ' units = ' || eb_bill(u.n));\n  END LOOP;\nEND;", hint: 'Add up the *full* lower slabs, then (units − slab start) × rate for the current slab. Check boundaries 100/101/200/300.', explain: 'Expected: 0→0, 50→50, 100→100, 101→102, 200→300, 250→450, 300→600, 350→850.' },
      { id: 'q5', type: 'plsql', q: '**5. OUT parameters.** Create `get_result(p_regno IN NUMBER, p_name OUT VARCHAR2, p_total OUT NUMBER)` that returns the student’s name and the sum of the three marks.', starter: 'CREATE OR REPLACE PROCEDURE get_result (\n  p_regno IN  NUMBER,\n  p_name  OUT VARCHAR2,\n  p_total OUT NUMBER\n) AS\nBEGIN\n  NULL;\nEND;', answer: 'CREATE OR REPLACE PROCEDURE get_result (\n  p_regno IN  NUMBER,\n  p_name  OUT VARCHAR2,\n  p_total OUT NUMBER\n) AS\nBEGIN\n  SELECT sname, mark1 + mark2 + mark3 INTO p_name, p_total FROM student WHERE regno = p_regno;\nEND;', driver: "DECLARE\n  n VARCHAR2(20);\n  t NUMBER;\nBEGIN\n  get_result(101, n, t);\n  DBMS_OUTPUT.PUT_LINE(n || ' scored ' || t);\n  get_result(105, n, t);\n  DBMS_OUTPUT.PUT_LINE(n || ' scored ' || t);\nEND;", hint: 'SELECT … INTO the OUT parameters directly.' },
      { id: 'q6', type: 'plsql', q: '**6. Function with a text result.** Create `result_of(p_regno NUMBER) RETURN VARCHAR2` that returns `PASS` if **every** mark is at least 40, otherwise `FAIL`.', starter: 'CREATE OR REPLACE FUNCTION result_of (p_regno NUMBER) RETURN VARCHAR2 AS\nBEGIN\n  RETURN NULL;\nEND;', answer: "CREATE OR REPLACE FUNCTION result_of (p_regno NUMBER) RETURN VARCHAR2 AS\n  v_min NUMBER;\nBEGIN\n  SELECT LEAST(mark1, mark2, mark3) INTO v_min FROM student WHERE regno = p_regno;\n  IF v_min >= 40 THEN\n    RETURN 'PASS';\n  ELSE\n    RETURN 'FAIL';\n  END IF;\nEND;", driver: "BEGIN\n  FOR r IN (SELECT regno FROM student ORDER BY regno) LOOP\n    DBMS_OUTPUT.PUT_LINE(r.regno || ': ' || result_of(r.regno));\n  END LOOP;\nEND;", hint: 'LEAST(mark1, mark2, mark3) is the smallest of the three marks.' },
      { id: 'q7', type: 'plsql', q: '**7. Raise an error.** Create `show_total(p_regno NUMBER)` that prints `<name> total=<sum of marks>`; if there is no such student it must call `RAISE_APPLICATION_ERROR(-20001, \'Student not found\')`. (The checker calls it with a valid and an invalid number.)', starter: 'CREATE OR REPLACE PROCEDURE show_total (p_regno NUMBER) AS\nBEGIN\n  NULL;\nEND;', answer: "CREATE OR REPLACE PROCEDURE show_total (p_regno NUMBER) AS\n  v_name  student.sname%TYPE;\n  v_total NUMBER;\nBEGIN\n  SELECT sname, mark1 + mark2 + mark3 INTO v_name, v_total FROM student WHERE regno = p_regno;\n  DBMS_OUTPUT.PUT_LINE(v_name || ' total=' || v_total);\nEXCEPTION\n  WHEN NO_DATA_FOUND THEN\n    RAISE_APPLICATION_ERROR(-20001, 'Student not found');\nEND;", driver: "BEGIN\n  show_total(102);\n  show_total(999);\nEXCEPTION\n  WHEN OTHERS THEN\n    DBMS_OUTPUT.PUT_LINE('Caught: ' || SQLERRM);\nEND;", hint: 'Catch NO_DATA_FOUND and raise your own error with a code between -20000 and -20999.', explain: '`RAISE_APPLICATION_ERROR` lets you return a custom message from a stored program: the caller sees `ORA-20001: Student not found`.' },
      { id: 'q8', type: 'plsql', q: '**8. Recursion.** Create `fact(p_n NUMBER) RETURN NUMBER` that returns the factorial **recursively** (`fact(0) = 1`).', starter: 'CREATE OR REPLACE FUNCTION fact (p_n NUMBER) RETURN NUMBER AS\nBEGIN\n  RETURN 1;\nEND;', answer: 'CREATE OR REPLACE FUNCTION fact (p_n NUMBER) RETURN NUMBER AS\nBEGIN\n  IF p_n <= 1 THEN\n    RETURN 1;\n  END IF;\n  RETURN p_n * fact(p_n - 1);\nEND;', driver: "BEGIN\n  DBMS_OUTPUT.PUT_LINE('fact(0)=' || fact(0));\n  DBMS_OUTPUT.PUT_LINE('fact(5)=' || fact(5));\n  DBMS_OUTPUT.PUT_LINE('fact(10)=' || fact(10));\nEND;", needs: [R('fact\\s*\\(\\s*p_n\\s*-\\s*1\\s*\\)', 'calls itself: fact(p_n - 1)')] },
      { id: 'f1', type: 'fill', q: '**Fill the blanks** – a procedure with an OUT parameter.', code: `CREATE OR REPLACE ___1___ get_city (
  p_id   ___2___ NUMBER,
  p_city ___3___ VARCHAR2
) ___4___
BEGIN
  SELECT city INTO p_city FROM cust WHERE id = p_id;
___5___;
/`, blanks: [['PROCEDURE'], ['IN'], ['OUT'], ['AS', 'IS'], ['END']], hint: 'Mode keywords are IN / OUT; the header ends with AS (or IS) before BEGIN.' },
      { id: 'b1', type: 'build', q: '**Put the lines in order** – a function that doubles a number.', lines: ['CREATE OR REPLACE FUNCTION twice (p_n NUMBER)', 'RETURN NUMBER', 'AS', 'BEGIN', '  RETURN p_n * 2;', 'END;', '/'], hint: 'Header (name + params), RETURN type, AS, BEGIN, body, END, /' },
      { id: 'm1', type: 'mcq', q: 'Which declaration is **wrong**?', opts: ['`CREATE PROCEDURE p (n NUMBER(5)) AS …` – size on a parameter type', '`CREATE PROCEDURE p (n IN NUMBER) AS …`', '`CREATE PROCEDURE p (n OUT NUMBER) AS …`', '`CREATE PROCEDURE p (n NUMBER DEFAULT 1) AS …`'], a: 0, why: 'Parameter datatypes can’t carry a size/precision (use `VARCHAR2`, `NUMBER`, or `table.col%TYPE`).' },
      { id: 'm2', type: 'mcq', q: '`SELECT eb_bill(120) FROM dual;` works only if `eb_bill` is…', opts: ['a function', 'a procedure with an OUT parameter', 'an anonymous block', 'a trigger'], a: 0, why: 'Only functions return a value usable inside SQL.' },
      { id: 'm3', type: 'mcq', q: 'A procedure has `p_regno IN NUMBER` and does `DELETE FROM student WHERE regno = p_regno;`. If the parameter were named `regno` instead, the DELETE would…', opts: ['delete every row (regno = regno is always true)', 'work exactly the same', 'fail to compile', 'delete no rows'], a: 0, why: 'Inside SQL statements, a column name takes priority over a variable with the same name.' }
    ],
    quiz: [
      { q: 'Which statement runs a stored procedure `greetings` from SQL*Plus?', opts: ['EXEC greetings;', 'RUN greetings;', 'SELECT greetings FROM dual;', 'CALL FUNCTION greetings;'], a: 0, why: 'EXEC / EXECUTE (or `CALL greetings();`).' },
      { q: 'A function must…', opts: ['RETURN a value of its declared type', 'have OUT parameters', 'print something', 'have no parameters'], a: 0, why: 'ORA-06503 “function returned without value” otherwise.' },
      { q: 'Which parameter mode is the default?', opts: ['IN', 'OUT', 'IN OUT', 'there is none'], a: 0, why: 'IN – read-only inside.' },
      { q: '`CREATE OR REPLACE` means…', opts: ['create it, or overwrite the existing definition', 'create only if it exists', 'rename it', 'copy it'], a: 0, why: 'Handy while developing – and it keeps privileges granted on the object.' },
      { q: 'In a procedure header, where do local variables go?', opts: ['between AS/IS and BEGIN', 'after BEGIN', 'inside a DECLARE keyword block', 'before CREATE'], a: 0, why: 'No `DECLARE` keyword – `AS`/`IS` plays that role.' },
      { q: 'You get “Warning: Procedure created with compilation errors”. Next step?', opts: ['SHOW ERRORS', 'DROP the table', 'SET SERVEROUTPUT ON', 'COMMIT'], a: 0, why: '`SHOW ERRORS` (or `SELECT * FROM user_errors`) tells you the line and message.' },
      { q: 'Which is *not* a benefit of stored procedures?', opts: ['They store a copy of the table data', 'Code reuse', 'Centralised business logic', 'Reduced client-server traffic'], a: 0, why: 'They store logic, not data.' }
    ]
  });
})();
