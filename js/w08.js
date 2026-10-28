(function () {
  const { h, h3, p, list, olist, sql, pl, tip, trap, exam, note, table, cmp, flow } = D;
  const R = (re, msg) => ({ re, msg });
  const DS = `
CREATE TABLE department (deptid NUMBER PRIMARY KEY, name VARCHAR2(15), location VARCHAR2(15), mgrid NUMBER);
CREATE TABLE employee (empid NUMBER PRIMARY KEY, name VARCHAR2(15), salary NUMBER(8,2), designation VARCHAR2(15), deptid NUMBER);
INSERT INTO department VALUES (10,'Sales','Chennai',1);
INSERT INTO department VALUES (20,'IT','Pune',5);
INSERT INTO department VALUES (30,'HR','Delhi',1);
INSERT INTO department VALUES (40,'Admin','Mumbai',NULL);
INSERT INTO employee VALUES (1,'Asha',50000,'Manager',10);
INSERT INTO employee VALUES (2,'Ravi',42000,'Developer',20);
INSERT INTO employee VALUES (3,'Meena',38000,'Analyst',20);
INSERT INTO employee VALUES (4,'Kiran',30000,'Clerk',10);
INSERT INTO employee VALUES (5,'Latha',55000,'Manager',20);
INSERT INTO employee VALUES (6,'Sunil',28000,'Clerk',30);
INSERT INTO employee VALUES (7,'Divya',45000,'Developer',20);
INSERT INTO employee VALUES (8,'Arun',33000,'Executive',10);
`.trim();

  Weeks.push({
    id: 'w8', num: 8, nav: 'PL/SQL Basics', title: 'PL/SQL Basics: blocks, variables, control flow', lab: 'Lab sheet 8', time: '55 min',
    summary: 'Oracle’s procedural language: the block structure, variables and constants, DBMS_OUTPUT, IF/CASE, loops, SELECT INTO and basic exceptions.',
    blurb: 'DECLARE/BEGIN/END · := · IF · CASE · LOOP/WHILE/FOR · SELECT INTO · exceptions.',
    tldr: [
      'SQL says *what* (declarative); PL/SQL adds *how* – variables, IF, loops – and runs a whole **block** at once.',
      'Block = `DECLARE` (optional) · `BEGIN` … `END;` (mandatory) · `EXCEPTION` (optional). End a script with a `/` line.',
      'Assignment is **`:=`**, comparison is **`=`**. Print with `DBMS_OUTPUT.PUT_LINE` after `SET SERVEROUTPUT ON`.',
      '`IF … THEN … ELSIF … THEN … ELSE … END IF;` – note **ELSIF** (one word, no E). `FOR i IN 1..10 LOOP … END LOOP;`',
      '`SELECT col INTO var FROM …` must return **exactly one row** – otherwise `NO_DATA_FOUND` / `TOO_MANY_ROWS`.'
    ],
    lesson: [
      h('SQL vs PL/SQL'),
      table(['SQL', 'PL/SQL'], [
        ['one statement at a time', 'a **block** of statements executed together'],
        ['declarative – says *what* you want', 'procedural – says *how*: variables, decisions, loops'],
        ['queries, DML, DDL', 'program units: blocks, **procedures, functions, triggers, packages**'],
        ['cannot embed PL/SQL', 'can embed SQL (SELECT INTO, INSERT, UPDATE, DELETE)']]),

      h('Block structure'),
      pl(`DECLARE            -- optional: variables, constants, cursors, user exceptions
  v_msg VARCHAR2(30) := 'Hello';
BEGIN              -- mandatory: the statements
  DBMS_OUTPUT.PUT_LINE(v_msg || ', World!');
EXCEPTION          -- optional: what to do when an error happens
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Something went wrong');
END;               -- every statement (and END) ends with ;
/`, { note: 'The lone `/` on the last line tells SQL*Plus “run the block”.' }),
      table(['Block type', 'Starts with', 'Stored in DB?'], [
        ['**Anonymous**', '`DECLARE` or `BEGIN`', 'no – runs once'],
        ['**Procedure**', '`CREATE PROCEDURE name IS …`', 'yes (Week 9)'],
        ['**Function**', '`CREATE FUNCTION name RETURN type IS …`', 'yes (Week 9)'],
        ['**Trigger**', '`CREATE TRIGGER …`', 'yes (Week 11)']]),
      h3('How the lab runs a program'),
      pl(`SQL> edit C:\\Users\\Rishi\\Oracle\\program1.sql    -- opens Notepad: type, save, close
SQL> set serveroutput on;                          -- without this you see NO output
SQL> @C:\\Users\\Rishi\\Oracle\\program1.sql          -- run the script file
SQL> exec greetings;                               -- run a stored procedure`, { static: true, note: 'From the “SQL procedure Execution steps” file. `SET SERVEROUTPUT ON` is the classic “why is nothing printed?” fix.' }),

      h('Variables, constants and types'),
      pl(`DECLARE
  a        INTEGER := 2;               -- initial value with :=
  b        INTEGER := 5;
  c        INTEGER;                    -- starts as NULL
  pi       CONSTANT NUMBER := 3.14159; -- cannot be changed
  radius   NUMBER(5,2) := 9.5;
  name     VARCHAR2(20) DEFAULT 'Arun';-- DEFAULT works like :=
BEGIN
  c := a + b;                          -- assignment uses :=
  DBMS_OUTPUT.PUT_LINE('sum=' || c);
  DBMS_OUTPUT.PUT_LINE('area=' || pi * radius * radius);
END;
/`),
      table(['Type', 'Use', 'Notes'], [
        ['`NUMBER(p,s)` · `INTEGER` · `REAL`', 'numbers', '`INTEGER` **rounds**: `a INTEGER := 7/2;` gives 4'],
        ['`VARCHAR2(n)` · `CHAR(n)`', 'text', 'assigning longer text → ORA-06502 “string buffer too small”'],
        ['`DATE` · `BOOLEAN`', 'dates · TRUE/FALSE/NULL', '`BOOLEAN` can’t be printed directly'],
        ['`table.col%TYPE`', 'same type as that column', '`v_sal employee.salary%TYPE;` – survives column changes'],
        ['`table%ROWTYPE`', 'a record with all columns', '`r employee%ROWTYPE;` then `r.name`']]),
      tip('Always prefer `%TYPE` / `%ROWTYPE` for variables that hold table data – if the column later becomes `NUMBER(10,2)` your code keeps working.'),
      h3('Reading input'),
      pl(`SET SERVEROUTPUT ON;
DECLARE
  n NUMBER;
BEGIN
  n := &num;                          -- SQL*Plus asks you for a value (substitution variable)
  DBMS_OUTPUT.PUT_LINE('You entered ' || n);
END;
/`, { inputs: { num: 42 }, note: 'In this website a pop-up asks you for `&num` when you press Run.' }),

      h('IF / ELSIF / ELSE and CASE'),
      pl(`DECLARE
  marks NUMBER := 72;
BEGIN
  IF marks >= 90 THEN
    DBMS_OUTPUT.PUT_LINE('Grade A');
  ELSIF marks >= 70 THEN              -- ELSIF, not ELSEIF / ELSE IF
    DBMS_OUTPUT.PUT_LINE('Grade B');
  ELSE
    DBMS_OUTPUT.PUT_LINE('Grade C');
  END IF;                             -- END IF; always
END;
/`),
      pl(`DECLARE
  d NUMBER := 3;
  name VARCHAR2(10);
BEGIN
  -- searched CASE: each WHEN is a condition
  CASE
    WHEN d = 1 THEN name := 'Mon';
    WHEN d = 2 THEN name := 'Tue';
    WHEN d = 3 THEN name := 'Wed';
    ELSE name := '?';
  END CASE;
  DBMS_OUTPUT.PUT_LINE(name);
  -- simple CASE expression: compares one selector, returns a value
  DBMS_OUTPUT.PUT_LINE(CASE d WHEN 3 THEN 'midweek' ELSE 'other' END);
END;
/`),
      trap('`ELSE IF` is **not** `ELSIF`: `ELSE IF …` opens a *new* IF that needs its own `END IF;`. Nine out of ten “my program won’t compile” cases are a missing `END IF;` / `END LOOP;` / `;`.'),
      note('In PL/SQL a condition that is NULL counts as **false** – `IF x = NULL` never fires; write `IF x IS NULL`.'),

      h('Loops'),
      table(['Loop', 'Use when', 'Skeleton'], [
        ['basic', 'you decide to leave with `EXIT WHEN`', '`LOOP … EXIT WHEN i > 10; … END LOOP;`'],
        ['`WHILE`', 'test before each pass', '`WHILE i <= 10 LOOP … END LOOP;`'],
        ['`FOR`', 'known number of passes; counter is declared **automatically** (don’t declare it, can’t assign to it)', '`FOR i IN 1..10 LOOP … END LOOP;` · `FOR i IN REVERSE 1..10`']]),
      pl(`DECLARE
  i INTEGER := 1;
BEGIN
  WHILE i <= 3 LOOP
    DBMS_OUTPUT.PUT_LINE('while ' || i);
    i := i + 1;
  END LOOP;
  FOR k IN REVERSE 1..3 LOOP
    DBMS_OUTPUT.PUT_LINE('for ' || k);
  END LOOP;
  i := 0;
  LOOP
    i := i + 1;
    EXIT WHEN i > 2;
    DBMS_OUTPUT.PUT_LINE('basic ' || i);
  END LOOP;
END;
/`),
      p('**Template: factorial** – accumulate in a loop. (Every lab program is “declare, loop/branch, print”.)'),
      pl(`DECLARE
  n NUMBER := 5;
  f NUMBER := 1;
BEGIN
  FOR i IN 2..n LOOP
    f := f * i;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('Factorial of ' || n || ' is ' || f);
END;
/`),

      h('SQL inside PL/SQL: SELECT INTO'),
      pl(`DECLARE
  v_name  employee.name%TYPE;
  v_sal   employee.salary%TYPE;
BEGIN
  SELECT name, salary INTO v_name, v_sal FROM employee WHERE empid = 3;
  DBMS_OUTPUT.PUT_LINE(v_name || ' earns ' || v_sal);
END;
/`, { note: 'The query must return **one** row. Zero rows → `NO_DATA_FOUND`; two or more → `TOO_MANY_ROWS`.' }),
      pl(`BEGIN
  UPDATE employee SET salary = salary + 1000 WHERE deptid = 10;
  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' employees updated');   -- implicit cursor attribute
  ROLLBACK;
END;
/`),
      p('Looping over a query (the implicit-cursor FOR loop, more in Week 10):'),
      pl(`BEGIN
  FOR r IN (SELECT name, salary FROM employee WHERE deptid = 20 ORDER BY empid) LOOP
    DBMS_OUTPUT.PUT_LINE(r.name || ' - ' || r.salary);
  END LOOP;
END;
/`),

      h('Exceptions – run-time errors'),
      pl(`DECLARE
  v_name employee.name%TYPE;
BEGIN
  SELECT name INTO v_name FROM employee WHERE empid = 999;
  DBMS_OUTPUT.PUT_LINE(v_name);
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    DBMS_OUTPUT.PUT_LINE('No such employee');
  WHEN TOO_MANY_ROWS THEN
    DBMS_OUTPUT.PUT_LINE('More than one row');
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/`),
      table(['Predefined exception', 'Raised when'], [
        ['`NO_DATA_FOUND`', 'SELECT INTO returns no row'],
        ['`TOO_MANY_ROWS`', 'SELECT INTO returns > 1 row'],
        ['`ZERO_DIVIDE`', 'division by zero'],
        ['`VALUE_ERROR`', 'conversion / size problem (string too long…)'],
        ['`DUP_VAL_ON_INDEX`', 'insert breaks a unique/primary key'],
        ['`OTHERS`', 'catch-all – always put it **last**']]),
      pl(`DECLARE
  low_stock EXCEPTION;                 -- your own exception
  qty NUMBER := 2;
BEGIN
  IF qty < 5 THEN RAISE low_stock; END IF;
EXCEPTION
  WHEN low_stock THEN DBMS_OUTPUT.PUT_LINE('Reorder needed');
END;
/`),
      exam('Common error-text questions: *“`:=` vs `=`”*, *“missing `END IF;`”*, *“why no output? → `SET SERVEROUTPUT ON`”*, *“why `ORA-01403`? → `SELECT INTO` found no row”*.')
    ],
    cheat: [
      ['block', 'DECLARE v NUMBER := 0;\nBEGIN\n  …;\nEXCEPTION WHEN OTHERS THEN …;\nEND;\n/'],
      ['output', 'SET SERVEROUTPUT ON;   DBMS_OUTPUT.PUT_LINE(\'x=\' || x);'],
      ['if / case', 'IF c THEN … ELSIF c THEN … ELSE … END IF;\nCASE WHEN c THEN … ELSE … END CASE;'],
      ['loops', 'FOR i IN [REVERSE] 1..n LOOP … END LOOP;\nWHILE c LOOP … END LOOP;\nLOOP … EXIT WHEN c; END LOOP;'],
      ['select into', 'SELECT a, b INTO v1, v2 FROM t WHERE key = 1;    -- exactly one row'],
      ['exceptions', 'WHEN NO_DATA_FOUND THEN … WHEN TOO_MANY_ROWS THEN … WHEN OTHERS THEN … SQLERRM']
    ],
    sheetTitle: 'Lab Sheet 8 – PL/SQL (basics, control structures, loops)',
    scenario: 'Run each program with **Run**; **Check answer** re-runs it with hidden values of the first variable (e.g. `n`), so keep the line `n NUMBER := 17;` as given and make the program work for *any* value. Print **exactly** the format stated in each question.',
    dataset: { name: 'EMPLOYEE / DEPARTMENT', sql: DS, note: 'The `employee(empid, name, salary, designation, deptid)` and `department(deptid, name, location, mgrid)` tables from the sheet.' },
    practice: [
      { id: 'p1', type: 'plsql', q: '**Addition of two numbers.** Compute `c = a + b` and print `sum=<c>` (for a = 2, b = 5 it prints `sum=7`). The checker also tries other values of `a`.', starter: 'DECLARE\n  a INTEGER := 2;\n  b INTEGER := 5;\n  c INTEGER;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  a INTEGER := 2;\n  b INTEGER := 5;\n  c INTEGER;\nBEGIN\n  c := a + b;\n  DBMS_OUTPUT.PUT_LINE('sum=' || c);\nEND;", testVar: 'a', tests: [2, 10, -3, 0], hint: 'c := a + b;  then DBMS_OUTPUT.PUT_LINE(\'sum=\' || c);' },
      { id: 'p2', type: 'plsql', q: '**Prime or not.** Print `<n> is prime` or `<n> is not prime`. (1 and 0 are not prime.)', starter: 'DECLARE\n  n NUMBER := 17;\n  is_prime BOOLEAN := TRUE;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  n NUMBER := 17;\n  is_prime BOOLEAN := TRUE;\nBEGIN\n  IF n < 2 THEN\n    is_prime := FALSE;\n  ELSE\n    FOR i IN 2 .. TRUNC(SQRT(n)) LOOP\n      IF MOD(n, i) = 0 THEN\n        is_prime := FALSE;\n        EXIT;\n      END IF;\n    END LOOP;\n  END IF;\n  IF is_prime THEN\n    DBMS_OUTPUT.PUT_LINE(n || ' is prime');\n  ELSE\n    DBMS_OUTPUT.PUT_LINE(n || ' is not prime');\n  END IF;\nEND;", testVar: 'n', tests: [17, 2, 1, 20, 97, 91], hint: 'Try dividing by every i from 2 to √n; if MOD(n, i) = 0 it is not prime. Remember n < 2.', explain: 'Only divisors up to √n need testing – if n has a factor above √n it must also have one below.' },
      { id: 'p3', type: 'plsql', q: '**Factorial.** Print `Factorial of <n> is <f>` (0! = 1).', starter: 'DECLARE\n  n NUMBER := 5;\n  f NUMBER := 1;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  n NUMBER := 5;\n  f NUMBER := 1;\nBEGIN\n  FOR i IN 2..n LOOP\n    f := f * i;\n  END LOOP;\n  DBMS_OUTPUT.PUT_LINE('Factorial of ' || n || ' is ' || f);\nEND;", testVar: 'n', tests: [5, 0, 1, 7, 10], hint: 'Start f at 1 and multiply by i in a loop. A FOR 2..n loop does nothing when n < 2 – which is exactly what 0! and 1! need.' },
      { id: 'p4', type: 'plsql', q: '**Palindrome number.** Print `<n> is a palindrome` or `<n> is not a palindrome` by reversing the digits with `MOD` and `TRUNC`.', starter: 'DECLARE\n  n NUMBER := 121;\n  temp NUMBER;\n  rev NUMBER := 0;\n  digit NUMBER;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  n NUMBER := 121;\n  temp NUMBER;\n  rev NUMBER := 0;\n  digit NUMBER;\nBEGIN\n  temp := n;\n  WHILE temp > 0 LOOP\n    digit := MOD(temp, 10);\n    rev := rev * 10 + digit;\n    temp := TRUNC(temp / 10);\n  END LOOP;\n  IF rev = n THEN\n    DBMS_OUTPUT.PUT_LINE(n || ' is a palindrome');\n  ELSE\n    DBMS_OUTPUT.PUT_LINE(n || ' is not a palindrome');\n  END IF;\nEND;", testVar: 'n', tests: [121, 123, 1331, 7, 10, 12321], hint: 'Peel off the last digit with MOD(temp,10), append it to rev (rev*10 + digit), then drop it with TRUNC(temp/10).', explain: 'Don’t modify `n` itself – keep it in `temp` so you can compare `rev = n` at the end.' },
      { id: 'p5', type: 'plsql', q: '**Celsius to Fahrenheit.** Print `<c> C = <f> F` using `F = C × 9/5 + 32`.', starter: 'DECLARE\n  c NUMBER := 100;\n  f NUMBER;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  c NUMBER := 100;\n  f NUMBER;\nBEGIN\n  f := c * 9 / 5 + 32;\n  DBMS_OUTPUT.PUT_LINE(c || ' C = ' || f || ' F');\nEND;", testVar: 'c', tests: [100, 0, 37, -40, 25] },
      { id: 'p6', type: 'plsql', q: '**Table of a number.** For `n` print ten lines `n x i = result`, e.g. `5 x 3 = 15`.', starter: 'DECLARE\n  n NUMBER := 5;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  n NUMBER := 5;\nBEGIN\n  FOR i IN 1..10 LOOP\n    DBMS_OUTPUT.PUT_LINE(n || ' x ' || i || ' = ' || n * i);\n  END LOOP;\nEND;", testVar: 'n', tests: [5, 12, 7], hint: 'FOR i IN 1..10 – and watch the spaces around `x` and `=`.' },
      { id: 'p7', type: 'plsql', q: '**Vacancy check.** Each department can hold at most `cap` employees (45 in the sheet). For **every department** (including empty ones) in order of `deptid` print `Dept <deptid>: <count> employees, <v> vacancies` when `v = cap - count > 0`, otherwise `Dept <deptid>: <count> employees, no vacancies`.', starter: 'DECLARE\n  cap NUMBER := 45;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  cap NUMBER := 45;\n  vac NUMBER;\nBEGIN\n  FOR r IN (SELECT d.deptid, COUNT(e.empid) AS cnt FROM department d LEFT JOIN employee e ON e.deptid = d.deptid GROUP BY d.deptid ORDER BY d.deptid) LOOP\n    vac := cap - r.cnt;\n    IF vac > 0 THEN\n      DBMS_OUTPUT.PUT_LINE('Dept ' || r.deptid || ': ' || r.cnt || ' employees, ' || vac || ' vacancies');\n    ELSE\n      DBMS_OUTPUT.PUT_LINE('Dept ' || r.deptid || ': ' || r.cnt || ' employees, no vacancies');\n    END IF;\n  END LOOP;\nEND;", testVar: 'cap', tests: [45, 3, 4], hint: 'FOR r IN (SELECT … ) LOOP … END LOOP – and LEFT JOIN so department 40 (no employees) still appears.', explain: 'The hidden tests use cap = 3 and 4 so that both branches (vacancies / no vacancies) get exercised.' },
      { id: 'p8', type: 'plsql', q: '**Incentive.** A 10 % incentive of salary is given to every employee. Print `<name>: <incentive>` for each employee ordered by `empid`.', answer: "BEGIN\n  FOR r IN (SELECT name, salary FROM employee ORDER BY empid) LOOP\n    DBMS_OUTPUT.PUT_LINE(r.name || ': ' || r.salary * 0.10);\n  END LOOP;\nEND;", starter: 'BEGIN\n  -- loop over employees\n  NULL;\nEND;', hint: 'incentive = r.salary * 0.10' },
      { id: 'p9', type: 'plsql', q: '**SELECT INTO.** For the employee with id `v_id`, print `<name> earns <salary>`.', starter: 'DECLARE\n  v_id NUMBER := 2;\n  v_name employee.name%TYPE;\n  v_sal  employee.salary%TYPE;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  v_id NUMBER := 2;\n  v_name employee.name%TYPE;\n  v_sal  employee.salary%TYPE;\nBEGIN\n  SELECT name, salary INTO v_name, v_sal FROM employee WHERE empid = v_id;\n  DBMS_OUTPUT.PUT_LINE(v_name || ' earns ' || v_sal);\nEND;", testVar: 'v_id', tests: [2, 5, 8, 1] },
      { id: 'p10', type: 'plsql', q: '**Exception handling.** Same as above, but if there is no such employee print `No such employee` instead of crashing. (The checker tries ids that exist and ones that don’t.)', starter: 'DECLARE\n  v_id NUMBER := 2;\n  v_name employee.name%TYPE;\nBEGIN\n  SELECT name INTO v_name FROM employee WHERE empid = v_id;\n  DBMS_OUTPUT.PUT_LINE(v_name);\n  -- add an EXCEPTION section\nEND;', answer: "DECLARE\n  v_id NUMBER := 2;\n  v_name employee.name%TYPE;\nBEGIN\n  SELECT name INTO v_name FROM employee WHERE empid = v_id;\n  DBMS_OUTPUT.PUT_LINE(v_name);\nEXCEPTION\n  WHEN NO_DATA_FOUND THEN\n    DBMS_OUTPUT.PUT_LINE('No such employee');\nEND;", testVar: 'v_id', tests: [2, 999, 5, 0], needs: [R('exception', 'has an EXCEPTION section'), R('no_data_found', 'handles NO_DATA_FOUND')] },
      { id: 'p11', type: 'plsql', q: '**CASE.** Print `Grade A` (≥ 90), `Grade B` (80–89), `Grade C` (70–79), `Grade D` (60–69) or `Grade F` for `marks`.', starter: 'DECLARE\n  marks NUMBER := 85;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  marks NUMBER := 85;\nBEGIN\n  CASE\n    WHEN marks >= 90 THEN DBMS_OUTPUT.PUT_LINE('Grade A');\n    WHEN marks >= 80 THEN DBMS_OUTPUT.PUT_LINE('Grade B');\n    WHEN marks >= 70 THEN DBMS_OUTPUT.PUT_LINE('Grade C');\n    WHEN marks >= 60 THEN DBMS_OUTPUT.PUT_LINE('Grade D');\n    ELSE DBMS_OUTPUT.PUT_LINE('Grade F');\n  END CASE;\nEND;", testVar: 'marks', tests: [95, 90, 85, 72, 64, 45, 60], hint: 'Check the highest threshold first. Either IF/ELSIF or a searched CASE works.', explain: 'Order matters: because branches are tested top-down you only need the lower bound of each band.' },
      { id: 'p12', type: 'plsql', q: '**Leap year.** Print `<yr> is a leap year` or `<yr> is not a leap year` (divisible by 4, except centuries, unless divisible by 400).', starter: 'DECLARE\n  yr NUMBER := 2024;\nBEGIN\n  -- your code\n  NULL;\nEND;', answer: "DECLARE\n  yr NUMBER := 2024;\nBEGIN\n  IF (MOD(yr, 400) = 0) OR (MOD(yr, 4) = 0 AND MOD(yr, 100) <> 0) THEN\n    DBMS_OUTPUT.PUT_LINE(yr || ' is a leap year');\n  ELSE\n    DBMS_OUTPUT.PUT_LINE(yr || ' is not a leap year');\n  END IF;\nEND;", testVar: 'yr', tests: [2024, 2000, 1900, 2023, 2100, 1996] },
      { id: 'f1', type: 'fill', q: '**Fill the blanks** – complete this block (prints 1 to 3).', code: `___1___
  i INTEGER := 1;
___2___
  WHILE i <= 3 ___3___
    DBMS_OUTPUT.PUT_LINE(i);
    i ___4___ i + 1;
  END ___5___;
END;
___6___`, blanks: [['DECLARE'], ['BEGIN'], ['LOOP'], [':='], ['LOOP'], ['/']], hint: 'The last line is the SQL*Plus “run it” symbol.' },
      { id: 'b1', type: 'build', q: '**Put the lines in order** – a FOR loop printing the squares of 1 to 4.', lines: ['DECLARE', '  sq NUMBER;', 'BEGIN', '  FOR i IN 1..4 LOOP', '    sq := i * i;', '    DBMS_OUTPUT.PUT_LINE(i || \' squared = \' || sq);', '  END LOOP;', 'END;', '/'], hint: 'DECLARE → BEGIN → loop header → body → END LOOP → END → /' },
      { id: 'm1', type: 'mcq', q: 'What does this print?', lang: 'plsql', code: 'DECLARE\n  a INTEGER := 7 / 2;\nBEGIN\n  DBMS_OUTPUT.PUT_LINE(a);\nEND;\n/', opts: ['4', '3', '3.5', 'error'], a: 0, why: 'INTEGER variables **round** (7/2 = 3.5 → 4); they don’t truncate. Use TRUNC(7/2) to get 3.' },
      { id: 'm2', type: 'mcq', q: 'What does this print?', lang: 'plsql', code: 'BEGIN\n  FOR i IN REVERSE 1..3 LOOP\n    DBMS_OUTPUT.PUT(i || \' \');\n  END LOOP;\n  DBMS_OUTPUT.NEW_LINE;\nEND;\n/', opts: ['3 2 1', '1 2 3', '3 2 1 0', 'nothing'], a: 0, why: 'REVERSE counts down from the upper bound; PUT keeps the text on one line until NEW_LINE.' },
      { id: 'm3', type: 'mcq', q: 'What is the output?', lang: 'plsql', code: 'DECLARE\n  i NUMBER := 0;\nBEGIN\n  LOOP\n    i := i + 1;\n    EXIT WHEN i = 3;\n    DBMS_OUTPUT.PUT_LINE(i);\n  END LOOP;\nEND;\n/', opts: ['1 and 2', '1, 2 and 3', 'only 3', 'an infinite loop'], a: 0, why: 'At i = 3 the EXIT fires *before* the print, so 3 is never printed.' }
    ],
    quiz: [
      { q: 'Which is the correct assignment in PL/SQL?', opts: ['x := 5;', 'x = 5;', 'x == 5;', 'SET x = 5;'], a: 0, why: '`:=` assigns, `=` compares.' },
      { q: 'Which part of a PL/SQL block is mandatory?', opts: ['BEGIN … END', 'DECLARE', 'EXCEPTION', 'all three'], a: 0, why: 'DECLARE and EXCEPTION are optional.' },
      { q: 'Your program runs but prints nothing. First thing to check?', opts: ['SET SERVEROUTPUT ON;', 'Add COMMIT', 'Add a / after each line', 'Rename the variable'], a: 0, why: 'DBMS_OUTPUT is buffered for SQL*Plus until you enable it.' },
      { q: '`SELECT name INTO v FROM emp WHERE empid = 999;` and no such employee exists:', opts: ['NO_DATA_FOUND is raised', 'v becomes NULL silently', 'v becomes an empty string', 'the program continues normally'], a: 0, why: 'SELECT INTO requires exactly one row (ORA-01403).' },
      { q: 'Which keyword is right?', opts: ['ELSIF', 'ELSEIF', 'ELSE IF (no extra END IF)', 'ELIF'], a: 0, why: 'PL/SQL spells it ELSIF.' },
      { q: 'In `FOR i IN 1..5 LOOP`, the loop variable `i`…', opts: ['is declared implicitly and is read-only inside the loop', 'must be declared in DECLARE', 'can be assigned inside the loop', 'keeps its value after the loop'], a: 0, why: 'It exists only inside the loop.' },
      { q: '`v_sal employee.salary%TYPE;` means…', opts: ['v_sal has the same data type as the salary column', 'v_sal holds the whole row', 'v_sal is a table', 'v_sal is a constant'], a: 0, why: '%TYPE copies a column’s type; %ROWTYPE copies a whole row.' },
      { q: 'Which exception handler should always be last?', opts: ['WHEN OTHERS', 'WHEN NO_DATA_FOUND', 'WHEN ZERO_DIVIDE', 'WHEN TOO_MANY_ROWS'], a: 0, why: 'OTHERS catches everything, so any handler after it would never run.' }
    ]
  });
})();
