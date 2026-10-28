(function () {
  const { h, h3, p, list, olist, sql, tip, trap, exam, note, table, cmp, flow } = D;
  const R = (re, msg) => ({ re, msg });
  const DS = `
CREATE TABLE JOB (JOB_ID VARCHAR2(8), JOB_TITLE VARCHAR2(20), MIN_SAL NUMBER(7,2), MAX_SAL NUMBER(7,2));
CREATE TABLE EMPLOYEE (EMP_NO NUMBER(3), EMP_NAME VARCHAR2(12), EMP_SAL NUMBER(8,2), EMP_COMM NUMBER(6,1), DEPT_NO NUMBER(3), JOB_ID VARCHAR2(15));
CREATE TABLE DEPOSIT (A_NO VARCHAR2(5), CNAME VARCHAR2(10), BNAME VARCHAR2(10), AMOUNT NUMBER(7,2), A_DATE DATE);
INSERT INTO JOB VALUES ('IT_PROG','Programmer',4000,10000);
INSERT INTO JOB VALUES ('MK_MGR','Marketing manager',9000,15000);
INSERT INTO JOB VALUES ('FI_MGR','Finance manager',8200,12000);
INSERT INTO JOB VALUES ('LEC','Lecturer',2000,4000);
INSERT INTO EMPLOYEE VALUES (101,'Anish',3000,200,20,'IT_PROG');
INSERT INTO EMPLOYEE VALUES (102,'Anamika',2975,NULL,30,'LEC');
INSERT INTO EMPLOYEE VALUES (103,'Anita',5000,NULL,10,'FI_ACC');
INSERT INTO EMPLOYEE VALUES (104,'Sneha',2450,500,10,'LEC');
INSERT INTO EMPLOYEE VALUES (105,'Aparna',4100,NULL,20,'IT_PROG');
INSERT INTO EMPLOYEE VALUES (106,'Kavya',6200,800,20,'MK_MGR');
INSERT INTO EMPLOYEE VALUES (107,'Raj_Kumar',3500,NULL,30,'FI_MGR');
INSERT INTO EMPLOYEE VALUES (108,'Anand',2800,150,30,'LEC');
INSERT INTO DEPOSIT VALUES ('101','Anil','andheri',7000,'01-JAN-06');
INSERT INTO DEPOSIT VALUES ('102','sunil','virar',5000,'15-JUL-06');
INSERT INTO DEPOSIT VALUES ('103','jay','villeparle',6500,'12-MAR-06');
INSERT INTO DEPOSIT VALUES ('104','vijay','andheri',8000,'17-SEP-06');
INSERT INTO DEPOSIT VALUES ('105','keyur','dadar',7500,'19-NOV-06');
CREATE TABLE STAFF (EMPLOYEE_NAME VARCHAR2(10), EMPLOYEE_NO NUMBER(8) PRIMARY KEY, DEPT_NAME VARCHAR2(10) NOT NULL, DEPT_NO NUMBER(5), DATE_OF_JOIN DATE);
INSERT INTO STAFF VALUES ('RAVI',100,'CSE',67,'12-MAR-1980');
INSERT INTO STAFF VALUES ('ASHA',101,'ECE',68,'01-FEB-1985');
INSERT INTO STAFF VALUES ('MEENA',102,'CSE',67,'20-JUL-1990');
CREATE TABLE salesman (salesman_id NUMBER(5) PRIMARY KEY, name VARCHAR2(20), city VARCHAR2(15), commission NUMBER(4,2));
INSERT INTO salesman VALUES (5001,'James Hoog','New York',0.15);
INSERT INTO salesman VALUES (5002,'Nail Knite','Paris',0.13);
INSERT INTO salesman VALUES (5005,'Pit Alex','London',0.11);
INSERT INTO salesman VALUES (5006,'Mc Lyon','Paris',0.14);
INSERT INTO salesman VALUES (5007,'Paul Adam','Rome',0.13);
INSERT INTO salesman VALUES (5003,'Lauson Hen','San Jose',0.12);
CREATE TABLE customers (customer_id NUMBER(5) PRIMARY KEY, cust_name VARCHAR2(20), city VARCHAR2(15), grade NUMBER(3), salesman_id NUMBER(5));
INSERT INTO customers VALUES (3002,'Nick Rimando','New York',100,5001);
INSERT INTO customers VALUES (3007,'Brad Davis','New York',200,5001);
INSERT INTO customers VALUES (3005,'Graham Zusi','California',200,5002);
INSERT INTO customers VALUES (3008,'Julian Green','London',300,5002);
INSERT INTO customers VALUES (3004,'Fabian Johnson','Paris',300,5006);
INSERT INTO customers VALUES (3009,'Geoff Cameron','Berlin',100,5003);
INSERT INTO customers VALUES (3003,'Jozy Altidor','Moscow',200,5007);
INSERT INTO customers VALUES (3001,'Brad Guzan','London',NULL,5005);
CREATE TABLE orders (ord_no NUMBER(6) PRIMARY KEY, purch_amt NUMBER(8,2), ord_date DATE, customer_id NUMBER(5), salesman_id NUMBER(5));
INSERT INTO orders VALUES (70001,150.5,'2012-10-05',3005,5002);
INSERT INTO orders VALUES (70009,270.65,'2012-09-10',3001,5005);
INSERT INTO orders VALUES (70002,65.26,'2012-10-05',3002,5001);
INSERT INTO orders VALUES (70004,110.5,'2012-08-17',3009,5003);
INSERT INTO orders VALUES (70007,948.5,'2012-09-10',3005,5002);
INSERT INTO orders VALUES (70005,2400.6,'2012-07-27',3007,5001);
INSERT INTO orders VALUES (70008,5760,'2012-09-10',3002,5001);
INSERT INTO orders VALUES (70010,1983.43,'2012-10-10',3004,5006);
INSERT INTO orders VALUES (70003,2480.4,'2012-10-10',3009,5003);
INSERT INTO orders VALUES (70012,250.45,'2012-06-27',3008,5002);
INSERT INTO orders VALUES (70011,75.29,'2012-08-17',3003,5007);
INSERT INTO orders VALUES (70013,3045.6,'2012-04-25',3002,5001);
`.trim();

  Weeks.push({
    id: 'w6', num: 6, nav: 'Strings, NULL & Views', title: 'Strings, NULL handling & Views', lab: 'Lab sheet 6/7', time: '45 min',
    summary: 'Pattern matching with LIKE, string functions, how NULL really behaves, and saving queries as views (including DML through views).',
    blurb: 'LIKE % _ ESCAPE · string functions · NULL / NVL · CREATE VIEW · DML on views.',
    tldr: [
      '`LIKE`: `%` = any run of characters (even none), `_` = exactly one character. Oracle LIKE is **case-sensitive**.',
      '`NULL` means *unknown*: `= NULL` never matches – use `IS NULL` / `IS NOT NULL`. Arithmetic with NULL gives NULL; use `NVL(x, 0)`.',
      '`||` concatenates; `SUBSTR(s, start, len)`, `INSTR`, `LENGTH`, `UPPER/LOWER/INITCAP`, `TRIM`, `REPLACE`, `LPAD/RPAD`.',
      'A **view** is a *stored query* (no data copy). Use it to simplify, to hide columns (security) and to reuse a complex query.',
      'You can INSERT/UPDATE/DELETE through a **simple** view (one table, no aggregates/DISTINCT/GROUP BY/joins). Complex views are read-only.'
    ],
    lesson: [
      h('LIKE – pattern matching'),
      table(['Wildcard', 'Matches', 'Example', 'Matches'], [
        ['`%`', 'any number of characters (0 or more)', '`LIKE \'A%\'`', 'Anita, Anish, A'],
        ['`_`', 'exactly **one** character', '`LIKE \'A_a%\'`', 'Anamika, Aparna (3rd char `a`)'],
        ['`%x%`', 'contains x anywhere', '`LIKE \'%na%\'`', 'Anamika, Anand, Aparna']]),
      sql(`SELECT emp_name FROM employee WHERE emp_name LIKE 'A%';        -- starts with A
SELECT emp_name FROM employee WHERE emp_name LIKE '%a';        -- ends with a
SELECT emp_name FROM employee WHERE emp_name LIKE '_n___';     -- 5 chars, 2nd is n
SELECT emp_name FROM employee WHERE emp_name LIKE 'A_a%';      -- 3rd character is a`),
      list('**Length** control: `\'Ani__\'` = exactly 5 characters starting with *Ani*.', '`NOT LIKE` negates.', '**Case-sensitive:** `LIKE \'a%\'` does *not* match *Anita*. Use `UPPER(col) LIKE \'A%\'` for case-insensitive search.', 'To match a literal `%` or `_` use `ESCAPE`:'),
      sql(`SELECT emp_name FROM employee WHERE emp_name LIKE '%\\_%' ESCAPE '\\';   -- names containing a real underscore`, { note: 'Without ESCAPE the `_` would be a wildcard and every name with ≥ 1 character would match. Here only `Raj_Kumar` does.' }),
      exam('Lab question 9: *“What will be the output of `LIKE \'%\\_%\' ESCAPE \'\\\'`?”* → the rows whose value contains a literal underscore character.'),

      h('String functions'),
      table(['Function', 'Result for `\'Anamika\'`'], [
        ['`UPPER(s)` · `LOWER(s)` · `INITCAP(s)`', '`ANAMIKA` · `anamika` · `Anamika`'],
        ['`LENGTH(s)`', '7'],
        ['`SUBSTR(s, 2, 3)` – from position 2, take 3', '`nam`  (positions start at **1**; negative = from the end)'],
        ['`INSTR(s, \'a\')` – first position of a substring', '3  (0 if absent)'],
        ['`s1 || s2` · `CONCAT(s1, s2)`', '`\'Anamika\' || \' K\'` → `Anamika K`'],
        ['`TRIM(s)` · `LTRIM` · `RTRIM`', 'remove spaces (or given characters)'],
        ['`REPLACE(s, \'a\', \'A\')`', '`AnAmikA`'],
        ['`LPAD(s, 10, \'*\')` · `RPAD`', '`***Anamika`']]),
      sql(`SELECT emp_name,
       UPPER(emp_name)            AS up,
       LENGTH(emp_name)           AS len,
       SUBSTR(emp_name, 1, 3)     AS first3,
       INSTR(emp_name, 'a')       AS pos_a,
       emp_name || ' (' || job_id || ')' AS label
FROM employee WHERE dept_no = 30;`),
      note('`DUAL` is Oracle’s one-row dummy table for trying functions: `SELECT UPPER(\'sql\') FROM dual;`'),

      h('NULL – the value that isn’t a value'),
      p('NULL means **unknown / missing**. Two unknowns are not equal, so any comparison with NULL yields UNKNOWN (neither true nor false) and the row is dropped.'),
      table(['Expression', 'Result'], [
        ['`comm = NULL` · `comm <> NULL`', 'UNKNOWN – **never** matches. Write `comm IS NULL` / `IS NOT NULL`'],
        ['`5 + NULL` · `NULL || \'x\'` (Oracle: `\'x\'`)', 'NULL (arithmetic) – but Oracle treats NULL as empty string in `||`'],
        ['`TRUE AND UNKNOWN` · `FALSE AND UNKNOWN`', 'UNKNOWN · FALSE'],
        ['`TRUE OR UNKNOWN` · `FALSE OR UNKNOWN`', 'TRUE · UNKNOWN'],
        ['`NOT UNKNOWN`', 'UNKNOWN'],
        ['`SUM/AVG/COUNT(col)`', 'ignore NULLs (but `COUNT(*)` counts rows)']]),
      sql(`SELECT emp_name, emp_comm, emp_sal + emp_comm AS wrong, emp_sal + NVL(emp_comm, 0) AS total
FROM employee ORDER BY emp_no;`, { note: 'Rows with NULL commission give a NULL “wrong” total. `NVL(x, 0)` (or `COALESCE(x, 0)`) substitutes a default.' }),
      sql(`SELECT COUNT(*) AS everyone, COUNT(emp_comm) AS with_comm FROM employee;
SELECT emp_name FROM employee WHERE emp_comm = NULL;        -- returns nothing!
SELECT emp_name FROM employee WHERE emp_comm IS NULL;`),
      trap('`WHERE age < 25 OR age >= 25` does **not** return every row – rows where age is NULL are dropped. That’s three-valued logic.'),

      h('Views'),
      p('A **view** is a named `SELECT`. The database stores the *query*, not the rows, so a view always shows current data.'),
      sql(`CREATE VIEW empview AS
  SELECT employee_name, employee_no, dept_name, dept_no, date_of_join FROM staff;
DESC empview;
SELECT * FROM empview;`, { note: '`CREATE OR REPLACE VIEW` redefines an existing one. `DROP VIEW empview;` removes the view (never the base data).' }),
      list('**Simplify** – hide a 4-table join behind one name.', '**Security** – expose only some columns/rows (e.g. payroll sees salary, developers don’t).', '**Reuse** – write the query once.'),
      h3('DML through a view'),
      p('Statements on a *simple* view are applied to its base table:'),
      sql(`CREATE VIEW empview AS SELECT employee_name, employee_no, dept_name FROM staff;
INSERT INTO empview VALUES ('SRI', 120, 'CSE');
UPDATE empview SET employee_name = 'KAVI' WHERE employee_name = 'RAVI';
DELETE FROM empview WHERE employee_no = 101;
SELECT * FROM staff;      -- the base table really changed`, { note: '`SRI` was inserted with NULL for the columns the view hides (dept_no, date_of_join). That works only because those columns allow NULL.' }),
      table(['View contains…', 'INSERT/UPDATE/DELETE?'], [
        ['one base table, plain columns', 'yes'],
        ['`DISTINCT`, `GROUP BY`, aggregates, `UNION`', '**no** – ORA-01732'],
        ['a join of tables', 'mostly no (only the key-preserved table, with restrictions)'],
        ['expressions like `sal*12`', 'that virtual column can’t be changed (ORA-01733)'],
        ['`WITH READ ONLY`', 'no DML at all (ORA-42399)'],
        ['`WITH CHECK OPTION`', 'DML allowed, but a changed row must still satisfy the view’s WHERE (else ORA-01402)']]),
      sql(`CREATE VIEW cse_staff AS SELECT * FROM staff WHERE dept_name = 'CSE' WITH CHECK OPTION;
INSERT INTO cse_staff VALUES ('ZED', 150, 'ECE', 9, '01-JAN-2021');   -- ECE row would vanish from the view → rejected`, { expectError: true, note: 'A view can also be defined from aggregates: `CREATE VIEW dept_count AS SELECT dept_no, COUNT(*) n FROM staff GROUP BY dept_no;` – read-only.' })
    ],
    cheat: [
      ['like', "col LIKE 'A%'   col LIKE '_n___'   col NOT LIKE '%x%'   col LIKE '%\\_%' ESCAPE '\\'"],
      ['functions', "UPPER LOWER INITCAP LENGTH SUBSTR(s,start,len) INSTR(s,sub) s1||s2 TRIM REPLACE(s,a,b) LPAD(s,n,'*')"],
      ['null', 'col IS [NOT] NULL   NVL(col, 0)   COALESCE(a, b, 0)   COUNT(*) vs COUNT(col)'],
      ['views', 'CREATE [OR REPLACE] VIEW v AS SELECT … [WITH CHECK OPTION | WITH READ ONLY];\nDROP VIEW v;']
    ],
    sheetTitle: 'Lab Sheet 6/7 – Working with strings & views',
    scenario: 'Tables **JOB, EMPLOYEE, DEPOSIT** for the string questions (names are mixed-case on purpose – LIKE is case-sensitive), and **SALESMAN / CUSTOMERS / ORDERS** plus **STAFF** for the view questions.',
    dataset: { name: 'JOB / EMPLOYEE / DEPOSIT / STAFF / SALESMAN / CUSTOMERS / ORDERS', sql: DS },
    practice: [
      { id: 'd1', type: 'sql', q: '**1.** Retrieve all data from `employee`, `job` and `deposit` (three queries).', answer: 'SELECT * FROM employee;\nSELECT * FROM job;\nSELECT * FROM deposit;', hint: 'Run all three queries; the checker compares the last one – `SELECT * FROM deposit`.' },
      { id: 'd2', type: 'sql', q: '**2.** Give account no. and deposited amount of customers whose account was opened between `01-JAN-06` and `25-JUL-06`.', answer: "SELECT a_no, amount FROM deposit WHERE a_date BETWEEN '01-JAN-06' AND '25-JUL-06';", hint: '`BETWEEN` is inclusive on both ends.' },
      { id: 'd3', type: 'sql', q: '**3.** Display all jobs whose minimum salary is greater than 4000.', answer: 'SELECT * FROM job WHERE min_sal > 4000;' },
      { id: 'd4', type: 'sql', q: '**4.** Display the name and salary of employees whose department no. is 20. Give the name column the alias `NAME`.', answer: 'SELECT emp_name AS name, emp_sal FROM employee WHERE dept_no = 20;' },
      { id: 's5', type: 'sql', q: '**5.** Display all employees whose name **starts with `A`** and whose **third character is `a`**.', answer: "SELECT * FROM employee WHERE emp_name LIKE 'A_a%';", hint: '`A` `_` `a` `%` – first fixed, second any one char, third fixed, rest anything.' },
      { id: 's6', type: 'sql', q: '**6.** Display name, number and salary of employees whose name is **5 characters long** and whose first three characters are `Ani`.', answer: "SELECT emp_name, emp_no, emp_sal FROM employee WHERE emp_name LIKE 'Ani__';" },
      { id: 's7', type: 'sql', q: '**7.** Display the employees with a **non-null** commission whose name has `n` as the **second** character and is 5 characters long.', answer: "SELECT * FROM employee WHERE emp_comm IS NOT NULL AND emp_name LIKE '_n___';" },
      { id: 's8', type: 'sql', q: '**8.** Display the employees having a **NULL** commission whose name’s **third** character is `a`.', answer: "SELECT * FROM employee WHERE emp_comm IS NULL AND emp_name LIKE '__a%';" },
      { id: 's9', type: 'sql', q: '**9.** What is the output of `LIKE \'%\\_%\' ESCAPE \'\\\'` on employee names? Write the query.', answer: "SELECT emp_name FROM employee WHERE emp_name LIKE '%\\_%' ESCAPE '\\';", hint: 'The backslash makes the next `_` a literal underscore.', explain: 'Only names containing a literal underscore (`Raj_Kumar`) are returned.' },
      { id: 's10', type: 'sql', q: '**More strings.** Show each employee name in **UPPER case** together with its **length**, only for names that contain the letters `na` anywhere.', answer: "SELECT UPPER(emp_name), LENGTH(emp_name) FROM employee WHERE emp_name LIKE '%na%';", hint: '`%` before and after = “contains”.', explain: 'Matches Anamika, Anand and Aparna. LIKE is case-sensitive, so `%NA%` would match none of them.' },
      { id: 's11', type: 'sql', q: '**Concatenation.** Produce one column `info` like `Sneha works as LEC` for every employee in department 10.', answer: "SELECT emp_name || ' works as ' || job_id AS info FROM employee WHERE dept_no = 10;", hint: 'Use `||` with quoted pieces.' },
      { id: 's12', type: 'sql', q: '**SUBSTR.** Show the **first 3 letters** of every employee name together with the position of the letter `a` (`INSTR`) in it.', answer: "SELECT SUBSTR(emp_name, 1, 3), INSTR(emp_name, 'a') FROM employee;" },
      { id: 'n1', type: 'sql', q: '**NULL.** Show `emp_name` and **total pay** = salary + commission, treating a missing commission as 0.', answer: 'SELECT emp_name, emp_sal + NVL(emp_comm, 0) AS total_pay FROM employee;', hint: 'NVL(expr, replacement)', explain: 'Without NVL, anyone with a NULL commission would get a NULL total.' },
      { id: 'n2', type: 'sql', q: '**NULL.** How many employees have **no commission** (NULL)?', answer: 'SELECT COUNT(*) FROM employee WHERE emp_comm IS NULL;', hint: 'Not `= NULL`!' },
      { id: 'v1', type: 'sql', q: '**View 1.** Create a view `v_ny_salesmen` listing the salesmen of the city **New York** who achieved a commission **more than 13 %** (i.e. `> 0.13`).', answer: "CREATE VIEW v_ny_salesmen AS SELECT * FROM salesman WHERE city = 'New York' AND commission > 0.13;", verify: 'SELECT * FROM v_ny_salesmen ORDER BY 1', hint: 'CREATE VIEW name AS SELECT … WHERE …' },
      { id: 'v2', type: 'sql', q: '**View 2.** Create a view `v_order_details` giving, for each order: order number, amount, **salesman name** and **customer name** (in this order).', answer: 'CREATE VIEW v_order_details AS SELECT o.ord_no, o.purch_amt, s.name AS salesman, c.cust_name AS customer FROM orders o JOIN salesman s ON o.salesman_id = s.salesman_id JOIN customers c ON o.customer_id = c.customer_id;', verify: 'SELECT * FROM v_order_details ORDER BY 1', hint: 'orders ⋈ salesman ⋈ customers: two join conditions.' },
      { id: 'v3', type: 'sql', q: '**View 3.** Create a view `v_salesmen_per_city` with each city and the **number of salesmen** in it.', answer: 'CREATE VIEW v_salesmen_per_city AS SELECT city, COUNT(*) AS salesmen FROM salesman GROUP BY city;', verify: 'SELECT * FROM v_salesmen_per_city ORDER BY 1' },
      { id: 'v4', type: 'sql', q: '**View 4.** Create a view `v_daily_summary` that tracks, per **order date**: the number of **distinct customers** ordering, the number of **distinct salesmen** attached, the **average** order amount and the **total** order amount (in this column order).', answer: 'CREATE VIEW v_daily_summary AS SELECT ord_date, COUNT(DISTINCT customer_id) AS customers, COUNT(DISTINCT salesman_id) AS salesmen, AVG(purch_amt) AS avg_amt, SUM(purch_amt) AS total_amt FROM orders GROUP BY ord_date;', verify: 'SELECT * FROM v_daily_summary ORDER BY 1', hint: 'GROUP BY ord_date with COUNT(DISTINCT …), AVG, SUM.' },
      { id: 'v5', type: 'sql', q: '**DML on a view.** Create `empview` over `staff(employee_name, employee_no, dept_name)`, then **insert** `(\'SRI\', 120, \'CSE\')` through the view. The base table must contain the new row.', answer: "CREATE VIEW empview AS SELECT employee_name, employee_no, dept_name FROM staff;\nINSERT INTO empview VALUES ('SRI', 120, 'CSE');", verify: 'SELECT * FROM staff ORDER BY employee_no', hint: 'Two statements: CREATE VIEW, then INSERT INTO the view.' },
      { id: 'v6', type: 'sql', q: '**DML on a view.** Create `empview` as above and **update** through it: change `RAVI` to `KAVI`. Then drop the view.', answer: "CREATE VIEW empview AS SELECT employee_name, employee_no, dept_name FROM staff;\nUPDATE empview SET employee_name = 'KAVI' WHERE employee_name = 'RAVI';\nDROP VIEW empview;", verify: 'SELECT employee_name FROM staff ORDER BY employee_no', hint: 'UPDATE view SET … WHERE …; then DROP VIEW empview;', explain: 'Dropping the view leaves the base table (and the change) untouched.' },
      { id: 'w1', type: 'write', q: '**Why would this fail?** `INSERT INTO v_salesmen_per_city VALUES (\'Delhi\', 3);` where `v_salesmen_per_city` was built with `GROUP BY`. Name the Oracle error (number and meaning).', answer: 'ORA-01732: data manipulation operation not legal on this view', needs: [R('01732|not legal on this view', 'mentions ORA-01732 / “not legal on this view”')], hint: 'Views with GROUP BY, DISTINCT or aggregates are read-only.' },
      { id: 'm1', type: 'mcq', q: 'Which rows does `WHERE emp_name LIKE \'_n%\'` return?', opts: ['Names whose **2nd** letter is a lower-case n', 'Names that contain n anywhere', 'Names that start with n', 'Names with exactly 2 letters'], a: 0, why: '`_` consumes exactly one character, then `n`, then `%` anything.' }
    ],
    quiz: [
      { q: '`SELECT * FROM t WHERE x = NULL;` returns…', opts: ['no rows, ever', 'rows where x is NULL', 'all rows', 'an error'], a: 0, why: '`= NULL` is UNKNOWN for every row. Use IS NULL.' },
      { q: '`10 + NULL` equals…', opts: ['NULL', '10', '0', 'error'], a: 0, why: 'Arithmetic with an unknown is unknown.' },
      { q: 'Which pattern matches strings with **exactly four** characters?', opts: ["'____'", "'%%%%'", "'%4'", "'____%'"], a: 0, why: 'Four underscores = four characters. `____%` means at least four.' },
      { q: '`SUBSTR(\'DATABASE\', 5, 4)` returns…', opts: ['BASE', 'ABAS', 'DATA', 'TABA'], a: 0, why: 'Start at position 5 (B), take 4 characters.' },
      { q: 'Which statement is true about a view?', opts: ['It stores a query, not data', 'It stores a copy of the data', 'It can’t be queried like a table', 'Dropping it deletes the base table rows'], a: 0, why: 'A view is a stored SELECT.' },
      { q: 'You `INSERT` into a view defined with `GROUP BY dept`. Result?', opts: ['ORA-01732 – operation not legal on this view', 'The row goes to the base table', 'A new group is created', 'Silently ignored'], a: 0, why: 'Aggregated views are read-only.' },
      { q: 'A view has `WITH CHECK OPTION` and `WHERE dept = \'CSE\'`. Which INSERT is rejected?', opts: ["a row with dept = 'ECE'", "a row with dept = 'CSE'", 'any row', 'none'], a: 0, why: 'A row inserted through the view must satisfy the view’s own WHERE.' },
      { q: 'Name of the one-row dummy table Oracle provides for testing expressions:', opts: ['DUAL', 'DUMMY', 'SYS_ONE', 'TEMP'], a: 0, why: '`SELECT SYSDATE FROM dual;`' }
    ]
  });
})();
