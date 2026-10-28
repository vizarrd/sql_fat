(function () {
  const { h, h3, p, list, olist, sql, tip, trap, exam, note, table, cmp, flow } = D;
  const DS = `
CREATE TABLE DEPOSIT (A_NO VARCHAR2(5), CNAME VARCHAR2(15), BNAME VARCHAR2(10), AMOUNT NUMBER(7,2), A_DATE DATE);
CREATE TABLE BORROW (LOANNO VARCHAR2(5), CNAME VARCHAR2(15), BNAME VARCHAR2(10), AMOUNT NUMBER(7,2));
CREATE TABLE CUSTOMERS (CNAME VARCHAR2(19), CITY VARCHAR2(18));
INSERT INTO DEPOSIT VALUES ('101','ANIL','ANDHERI',7000,'01-JAN-06');
INSERT INTO DEPOSIT VALUES ('102','SUNIL','VIRAR',5000,'15-JUL-06');
INSERT INTO DEPOSIT VALUES ('103','JAY','VILLEPARLE',6500,'12-MAR-06');
INSERT INTO DEPOSIT VALUES ('104','VIJAY','ANDHERI',8000,'17-SEP-06');
INSERT INTO DEPOSIT VALUES ('105','KEYUR','DADAR',7500,'19-NOV-06');
INSERT INTO DEPOSIT VALUES ('106','MAYOR','BORIVALI',5500,'21-DEC-06');
INSERT INTO DEPOSIT VALUES ('107','ANIL','VIRAR',3000,'05-FEB-06');
INSERT INTO DEPOSIT VALUES ('108','VIJAY','DADAR',2500,'11-MAY-06');
INSERT INTO DEPOSIT VALUES ('109','SUNIL','ANDHERI',4000,'30-AUG-06');
INSERT INTO BORROW VALUES ('1001','VIJAY','ANDHERI',5000);
INSERT INTO BORROW VALUES ('1002','HARISH','KAROLBAGH',9000);
INSERT INTO BORROW VALUES ('1003','PETER','VICE',4000);
INSERT INTO BORROW VALUES ('1004','JOHN','VICE',8000);
INSERT INTO BORROW VALUES ('1005','JOHN','KAROLBAGH',9000);
INSERT INTO BORROW VALUES ('1006','HARISH','VICE',3000);
INSERT INTO CUSTOMERS VALUES ('ANIL','CALCUTTA');
INSERT INTO CUSTOMERS VALUES ('SUNIL','DELHI');
INSERT INTO CUSTOMERS VALUES ('MEHUL','BARODA');
INSERT INTO CUSTOMERS VALUES ('MANDAR','PATNA');
INSERT INTO CUSTOMERS VALUES ('MADHURI','NAGPUR');
INSERT INTO CUSTOMERS VALUES ('PRAMOD','NAGPUR');
INSERT INTO CUSTOMERS VALUES ('SANDIP','SURAT');
INSERT INTO CUSTOMERS VALUES ('SHIVANI','BOMBAY');
INSERT INTO CUSTOMERS VALUES ('KRANTI','BOMBAY');
INSERT INTO CUSTOMERS VALUES ('NAREN','BOMBAY');
INSERT INTO CUSTOMERS VALUES ('JAY','BOMBAY');
INSERT INTO CUSTOMERS VALUES ('VIJAY','DELHI');
INSERT INTO CUSTOMERS VALUES ('KEYUR','SURAT');
INSERT INTO CUSTOMERS VALUES ('MAYOR','BOMBAY');
INSERT INTO CUSTOMERS VALUES ('HARISH','PATNA');
INSERT INTO CUSTOMERS VALUES ('PETER','DELHI');
INSERT INTO CUSTOMERS VALUES ('JOHN','BARODA');
INSERT INTO CUSTOMERS VALUES ('RAVI',NULL);
-- from the lecture slides
CREATE TABLE EMPLOYEE (EMPNO NUMBER(5), EMPNAME CHAR(10), DEPT CHAR(5), SALARY NUMBER(8));
INSERT INTO EMPLOYEE VALUES (101,'geetha','it',2000);
INSERT INTO EMPLOYEE VALUES (102,'sai','it',3002);
INSERT INTO EMPLOYEE VALUES (103,'deepa','cse',10032);
INSERT INTO EMPLOYEE VALUES (104,'samar','ece',23422);
INSERT INTO EMPLOYEE VALUES (105,'neelam','cse',3244);
INSERT INTO EMPLOYEE VALUES (106,'asha','ece',32421);
INSERT INTO EMPLOYEE VALUES (107,'raja','eee',2133);
CREATE TABLE FOODCART (FOOD VARCHAR2(10), SOLD NUMBER(5));
INSERT INTO FOODCART VALUES ('Pizza',300);
INSERT INTO FOODCART VALUES ('Pizza',250);
INSERT INTO FOODCART VALUES ('Burger',200);
INSERT INTO FOODCART VALUES ('Burger',150);
INSERT INTO FOODCART VALUES ('Pasta',500);
INSERT INTO FOODCART VALUES ('Pasta',100);
CREATE TABLE GRADES (CODE VARCHAR2(5), MARK NUMBER(3));
INSERT INTO GRADES VALUES ('CS2',60);
INSERT INTO GRADES VALUES ('CS1',70);
INSERT INTO GRADES VALUES ('CS1',85);
INSERT INTO GRADES VALUES ('CS2',90);
INSERT INTO GRADES VALUES ('CS3',75);
`.trim();

  Weeks.push({
    id: 'w4', num: 4, nav: 'Aggregates & Grouping', title: 'Aggregate Functions, GROUP BY, HAVING, ORDER BY', lab: 'Lab sheet 4', time: '40 min',
    summary: 'Turn many rows into one answer (COUNT/SUM/AVG/MIN/MAX), per-group answers (GROUP BY), filtering groups (HAVING) and sorting.',
    blurb: 'COUNT · SUM · AVG · MIN · MAX · GROUP BY · HAVING · ORDER BY.',
    tldr: [
      'Aggregates collapse rows: `COUNT SUM AVG MIN MAX`. They **ignore NULLs** – except `COUNT(*)`.',
      '“for each / per / branch-wise” in the question ⇒ **GROUP BY** that thing.',
      '**WHERE** filters *rows before* grouping. **HAVING** filters *groups after* aggregating (aggregates allowed only here).',
      'Every non-aggregated column in SELECT must appear in GROUP BY.',
      '`ORDER BY` is last; `ASC` is the default, `DESC` for biggest first.'
    ],
    lesson: [
      h('Aggregate functions'),
      table(['Function', 'Returns', 'NULLs'], [
        ['`COUNT(*)`', 'number of **rows**', 'counts them'],
        ['`COUNT(col)`', 'number of rows where col is **not NULL**', 'skipped'],
        ['`COUNT(DISTINCT col)`', 'number of **different** non-NULL values', 'skipped'],
        ['`SUM(col)` · `AVG(col)`', 'total · mean', 'skipped (AVG divides by the non-NULL count!)'],
        ['`MIN(col)` · `MAX(col)`', 'smallest · largest (works on text and dates too)', 'skipped']]),
      sql(`SELECT COUNT(*) AS rows_, COUNT(city) AS with_city, COUNT(DISTINCT city) AS cities FROM customers;
SELECT MIN(amount) AS lowest, MAX(amount) AS highest, SUM(amount) AS total, AVG(amount) AS average FROM deposit;`, { note: '`RAVI` has a NULL city, so `COUNT(*)` is one bigger than `COUNT(city)`.' }),
      trap('An aggregate query without GROUP BY returns **exactly one row**. So `SELECT cname, MAX(amount) FROM deposit;` is illegal – which cname goes with the max? (To get “the customer with the highest deposit” you need a subquery or ORDER BY, see Week 7.)'),

      h('GROUP BY – one answer per group'),
      sql(`-- total deposit per branch
SELECT bname, SUM(amount) AS total, COUNT(*) AS accounts
FROM   deposit
GROUP  BY bname;`),
      p('Think of it as: sort rows into piles by `bname`, then run the aggregate **on each pile**. The rule: **everything in SELECT is either in GROUP BY or inside an aggregate.**'),
      sql(`-- group by two columns = a pile for every (dept, ...) combination
SELECT dept, MIN(salary), MAX(salary) FROM employee GROUP BY dept;`),

      h('WHERE vs HAVING'),
      cmp({ title: 'WHERE', t: 'filters **rows**, before grouping.\nCannot contain aggregates.\n`WHERE amount > 4000`' }, { title: 'HAVING', t: 'filters **groups**, after aggregating.\nUsually has an aggregate.\n`HAVING SUM(amount) > 10000`' }),
      sql(`-- departments whose average salary is at least 3000
SELECT dept, AVG(salary) FROM employee GROUP BY dept HAVING AVG(salary) >= 3000;

-- WHERE + GROUP BY + HAVING together: only deposits above 2000, per branch, branches with 2+ such deposits
SELECT bname, COUNT(*) AS n, SUM(amount) AS total
FROM   deposit
WHERE  amount > 2000
GROUP  BY bname
HAVING COUNT(*) >= 2;`),
      flow('FROM', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'ORDER BY'),
      tip('That is the **logical order** the database follows. It explains everything: WHERE runs before groups exist (so no aggregates), HAVING runs after (so aggregates are fine), and ORDER BY runs last (so it can sort by a SELECT alias).'),

      h('ORDER BY'),
      sql(`SELECT * FROM grades ORDER BY code ASC, mark DESC;     -- several keys: later keys break ties
SELECT bname, SUM(amount) AS total FROM deposit GROUP BY bname ORDER BY total DESC;   -- sort by alias`),
      list('`ASC` (default) smallest first, `DESC` largest first.', 'You can sort by a column, an alias, an expression or the **column number** (`ORDER BY 2`).', 'In Oracle NULLs sort **last** in ASC and first in DESC.'),

      h('Nested aggregates (Oracle shortcut)'),
      p('Oracle allows an aggregate over a grouped aggregate in one statement – “the maximum of the departmental averages”:'),
      sql(`SELECT MAX(AVG(salary)) FROM employee GROUP BY dept;`, { note: 'Only valid together with GROUP BY. Portable version: `SELECT MAX(a) FROM (SELECT AVG(salary) a FROM employee GROUP BY dept)`.' }),

      h('Pattern: wording → SQL'),
      table(['The question says…', 'Use'], [
        ['“total / sum of …”', '`SUM(col)`'],
        ['“how many / number of / count …”', '`COUNT(*)` or `COUNT(DISTINCT col)`'],
        ['“for each X”, “X-wise”, “per X”', '`GROUP BY X`'],
        ['“… with more than 1 / at least 2 …” (after grouping)', '`HAVING COUNT(*) > 1`'],
        ['“highest / lowest value”', '`MAX / MIN`'],
        ['“customer with the highest …” (needs the name too)', 'subquery: `WHERE amount = (SELECT MAX(amount) …)`'],
        ['“in descending order of …”', '`ORDER BY … DESC`']]),
      exam('“Customers with **more than one loan at different branches**” → `GROUP BY cname HAVING COUNT(DISTINCT bname) > 1`. Note **DISTINCT** – two loans at the *same* branch must not count.')
    ],
    cheat: [
      ['aggregates', 'COUNT(*)  COUNT(col)  COUNT(DISTINCT col)  SUM  AVG  MIN  MAX'],
      ['group + filter', 'SELECT d, SUM(x) FROM t WHERE row_cond GROUP BY d HAVING SUM(x) > 100 ORDER BY SUM(x) DESC;'],
      ['more than one at different branches', 'SELECT cname FROM borrow GROUP BY cname HAVING COUNT(DISTINCT bname) > 1;'],
      ['row with the max', 'SELECT * FROM t WHERE x = (SELECT MAX(x) FROM t);']
    ],
    sheetTitle: 'Lab Sheet 4 – Aggregate functions, grouping and sorting',
    scenario: 'Tables **DEPOSIT, BORROW, CUSTOMERS** (extended with a few rows so every query returns data) plus **EMPLOYEE / FOODCART / GRADES** from the lecture slides.',
    dataset: { name: 'Bank + lecture tables (Lab sheet 4)', sql: DS, note: 'The sheet’s data had a duplicated row and a typo (` KAROLBAGH` with a space, `NAME` instead of `BNAME`). They are cleaned up here, and a few rows are added so queries like “more than one branch” have answers.' },
    practice: [
      { id: 'q1', type: 'sql', q: '**1.** List the total deposit from `DEPOSIT`.', answer: 'SELECT SUM(amount) FROM deposit;' },
      { id: 'q2', type: 'sql', q: '**2.** List the total loan from the `KAROLBAGH` branch.', answer: "SELECT SUM(amount) FROM borrow WHERE bname = 'KAROLBAGH';", hint: 'WHERE before the aggregate is computed.' },
      { id: 'q3', type: 'sql', q: '**3.** Give the maximum loan from branch `VICE`.', answer: "SELECT MAX(amount) FROM borrow WHERE bname = 'VICE';" },
      { id: 'q4', type: 'sql', q: '**4.** Count the total number of customers.', answer: 'SELECT COUNT(*) FROM customers;' },
      { id: 'q5', type: 'sql', q: '**5.** Count the total number of customer **cities** (different cities only).', answer: 'SELECT COUNT(DISTINCT city) FROM customers;', hint: 'COUNT(DISTINCT …) ignores both duplicates and NULLs.' },
      { id: 'q6', type: 'sql', q: '**6.** Display the highest deposit amount of the `ANDHERI` branch.', answer: "SELECT MAX(amount) FROM deposit WHERE bname = 'ANDHERI';" },
      { id: 'q7', type: 'sql', q: '**7.** Count the number of customers with **more than one loan at different branches**.', answer: 'SELECT COUNT(*) FROM (SELECT cname FROM borrow GROUP BY cname HAVING COUNT(DISTINCT bname) > 1);', hint: 'First find those customers (GROUP BY cname + HAVING), then count them with an outer query.', explain: 'Inner query → JOHN and HARISH. The outer `COUNT(*)` counts that list. A subquery in FROM is called an *inline view*.' },
      { id: 'q8', type: 'sql', q: '**8.** Display the customer detail (from `CUSTOMERS`) of the customer with the **highest deposit amount**.', answer: 'SELECT * FROM customers WHERE cname IN (SELECT cname FROM deposit WHERE amount = (SELECT MAX(amount) FROM deposit));', hint: 'Innermost: the max amount. Middle: who has it. Outer: their customer row.', explain: 'This is a nested subquery (Week 7). `SELECT cname, MAX(amount)` directly would be illegal.' },
      { id: 'q9', type: 'sql', q: '**9.** Update the city of `MADHURI` from `NAGPUR` to `CHENNAI`.', answer: "UPDATE customers SET city = 'CHENNAI' WHERE cname = 'MADHURI';", verify: 'SELECT * FROM customers ORDER BY cname' },
      { id: 'q10', type: 'sql', q: '**10.** Display the total deposit amount for **each branch**.', answer: 'SELECT bname, SUM(amount) FROM deposit GROUP BY bname;', hint: '“each branch” → GROUP BY bname, and show bname too.' },
      { id: 'q11', type: 'sql', q: '**11.** Display branch-wise deposit amount in **descending order**.', answer: 'SELECT bname, SUM(amount) AS total FROM deposit GROUP BY bname ORDER BY SUM(amount) DESC;', ordered: true, hint: 'ORDER BY comes last; you can sort by the aggregate (or its alias).' },
      { id: 'q12', type: 'sql', q: '**12.** Display the total sum of deposits **per customer** for customers who have deposits at **more than one branch**.', answer: 'SELECT cname, SUM(amount) FROM deposit GROUP BY cname HAVING COUNT(DISTINCT bname) > 1;', hint: 'HAVING with COUNT(DISTINCT bname).', explain: 'ANIL (ANDHERI, VIRAR), SUNIL (VIRAR, ANDHERI) and VIJAY (ANDHERI, DADAR).' },
      { id: 'e1', type: 'sql', q: '**Slides:** find the minimum salary from `EMPLOYEE` and name the column `Min_Salary`.', answer: 'SELECT MIN(salary) AS Min_Salary FROM employee;' },
      { id: 'e2', type: 'sql', q: '**Slides:** count the employees of the `cse` department.', answer: "SELECT COUNT(*) FROM employee WHERE TRIM(dept) = 'cse';", hint: '`DEPT` is CHAR(5) – padded with spaces in Oracle, so `TRIM(dept)` (or compare with `\'cse  \'`) is the safe route. Plain `dept = \'cse\'` also works in Oracle because CHAR comparison ignores padding.' },
      { id: 'e3', type: 'sql', q: '**Slides:** list each department with its average salary; keep only departments whose average is **at least 3000**.', answer: 'SELECT dept, AVG(salary) FROM employee GROUP BY dept HAVING AVG(salary) >= 3000;' },
      { id: 'e4', type: 'sql', q: '**Slides:** find the maximum of the departmental average salaries (nested aggregate).', answer: 'SELECT MAX(a) FROM (SELECT AVG(salary) AS a FROM employee GROUP BY dept);', hint: 'Oracle also accepts `SELECT MAX(AVG(salary)) FROM employee GROUP BY dept` – try both!' },
      { id: 'e5', type: 'sql', q: '**Slides:** from `FOODCART`, show each food with its total sold, only where the total is more than **450**.', answer: 'SELECT food, SUM(sold) AS totalSold FROM foodcart GROUP BY food HAVING SUM(sold) > 450;' },
      { id: 'e6', type: 'sql', q: '**Slides:** list `GRADES` by `code` ascending and, within the same code, `mark` descending.', answer: 'SELECT * FROM grades ORDER BY code ASC, mark DESC;', ordered: true },
      { id: 'w1', type: 'write', q: '**Spot the error – rewrite correctly.** *“Show branches with total deposit above 10000”* was written as `SELECT bname, SUM(amount) FROM deposit WHERE SUM(amount) > 10000 GROUP BY bname;`', answer: 'SELECT bname, SUM(amount) FROM deposit GROUP BY bname HAVING SUM(amount) > 10000;', needs: [R2('group\\s+by\\s+bname', 'GROUP BY bname'), R2('having\\s+sum\\s*\\(\\s*amount\\s*\\)\\s*>\\s*10000', 'HAVING SUM(amount) > 10000'), R2('^(?![\\s\\S]*where\\s+sum)', 'no aggregate inside WHERE')], hint: 'Aggregates are only allowed in HAVING (or SELECT / ORDER BY).' },
      { id: 'm1', type: 'mcq', q: 'What does `SELECT COUNT(city) FROM customers;` return compared with `SELECT COUNT(*) FROM customers;` (one customer, RAVI, has a NULL city)?', opts: ['One less', 'The same', 'One more', 'An error'], a: 0, why: 'COUNT(col) skips NULLs; COUNT(*) counts rows.' },
      { id: 'm2', type: 'mcq', q: 'Why is `SELECT bname, MAX(amount) FROM deposit;` rejected?', opts: ['bname is not in GROUP BY, so it has no single value for the one aggregate row', 'MAX needs DISTINCT', 'bname is a text column', 'MAX can’t be used on NUMBER'], a: 0, why: 'Either add `GROUP BY bname` (max per branch) or drop bname.' }
    ],
    quiz: [
      { q: '`AVG(x)` over values 10, 20, NULL gives…', opts: ['15', '10', '30', 'NULL'], a: 0, why: 'NULL is skipped: (10+20)/2 = 15, not /3.' },
      { q: 'Which clause may contain an aggregate function?', opts: ['HAVING', 'WHERE', 'FROM', 'GROUP BY'], a: 0, why: 'WHERE runs before aggregates exist.' },
      { q: '`SELECT dept, COUNT(*) FROM emp;` (no GROUP BY) is…', opts: ['an error – dept must be grouped', 'valid – returns one row per dept', 'valid – returns one row', 'valid but dept is NULL'], a: 0, why: 'Mixing a plain column and an aggregate needs GROUP BY.' },
      { q: 'Logical processing order:', opts: ['FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY', 'SELECT → FROM → WHERE → GROUP BY → HAVING', 'FROM → GROUP BY → WHERE → HAVING → SELECT', 'WHERE → FROM → SELECT → GROUP BY → HAVING'], a: 0, why: 'Memorise this one.' },
      { q: '`COUNT(DISTINCT dept)` on dept values (it, it, cse, ece, cse, ece, eee) is…', opts: ['4', '7', '3', '5'], a: 0, why: 'Distinct values: it, cse, ece, eee.' },
      { q: 'Sort by total deposit, biggest first:', opts: ['ORDER BY SUM(amount) DESC', 'ORDER BY SUM(amount) ASC', 'GROUP BY SUM(amount) DESC', 'SORT BY SUM(amount)'], a: 0, why: 'ORDER BY … DESC.' },
      { q: '“Customers with deposits at more than one branch” needs:', opts: ['GROUP BY cname HAVING COUNT(DISTINCT bname) > 1', 'WHERE COUNT(bname) > 1', 'GROUP BY bname HAVING COUNT(cname) > 1', 'DISTINCT cname'], a: 0, why: 'Group per customer, then test the number of different branches.' }
    ]
  });
  function R2(re, msg) { return { re, msg }; }
})();
