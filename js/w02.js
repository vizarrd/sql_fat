(function () {
  const { h, h3, p, list, olist, sql, tip, trap, exam, note, table, cmp, flow } = D;
  const DS = `
CREATE TABLE DEPOSIT (ACTNO VARCHAR2(5), CNAME VARCHAR2(18), BNAME VARCHAR2(18), AMOUNT NUMBER(8,2), ADATE DATE);
CREATE TABLE BRANCH (BNAME VARCHAR2(18), CITY VARCHAR2(18));
CREATE TABLE CUSTOMERS (CNAME VARCHAR2(19), CITY VARCHAR2(18));
CREATE TABLE BORROW (LOANNO VARCHAR2(5), CNAME VARCHAR2(18), BNAME VARCHAR2(18), AMOUNT NUMBER(8,2));
INSERT INTO DEPOSIT VALUES ('100','ANIL','VRCE',1000,'1-MAR-95');
INSERT INTO DEPOSIT VALUES ('101','SUNIL','AJNI',5000,'4-JAN-96');
INSERT INTO DEPOSIT VALUES ('102','MEHUL','KAROLBAGH',3500,'17-NOV-95');
INSERT INTO DEPOSIT VALUES ('104','MADHURI','CHANDI',1200,'17-DEC-95');
INSERT INTO DEPOSIT VALUES ('105','PRMOD','M.G.ROAD',3000,'27-MAR-96');
INSERT INTO DEPOSIT VALUES ('106','SANDIP','ANDHERI',2000,'31-MAR-96');
INSERT INTO DEPOSIT VALUES ('107','SHIVANI','VIRAR',1000,'5-SEP-95');
INSERT INTO DEPOSIT VALUES ('108','KRANTI','NEHRU PLACE',5000,'2-JUL-95');
INSERT INTO DEPOSIT VALUES ('109','MINU','POWAI',7000,'10-AUG-95');
INSERT INTO BRANCH VALUES ('VRCE','NAGPUR');
INSERT INTO BRANCH VALUES ('AJNI','NAGPUR');
INSERT INTO BRANCH VALUES ('KAROLBAGH','DELHI');
INSERT INTO BRANCH VALUES ('CHANDI','DELHI');
INSERT INTO BRANCH VALUES ('DHARAMPETH','NAGPUR');
INSERT INTO BRANCH VALUES ('M.G.ROAD','BANGLORE');
INSERT INTO BRANCH VALUES ('ANDHERI','BOMBAY');
INSERT INTO BRANCH VALUES ('VIHAR','BOMBAY');
INSERT INTO BRANCH VALUES ('NEHRU PLACE','DELHI');
INSERT INTO BRANCH VALUES ('POWAI','BOMBAY');
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
INSERT INTO BORROW VALUES ('201','ANIL','VRCE',1000);
INSERT INTO BORROW VALUES ('206','MEHUL','VRCE',5000);
INSERT INTO BORROW VALUES ('311','SUNIL','DHARAMPETH',3000);
INSERT INTO BORROW VALUES ('321','MADHURI','ANDHERI',2000);
INSERT INTO BORROW VALUES ('375','PRMOD','VIHAR',8000);
INSERT INTO BORROW VALUES ('481','KRANTI','NEHRU PLACE',3000);
-- Exercise 2: movie database
CREATE TABLE MOVIES (TITLE VARCHAR2(30), DIRECTOR VARCHAR2(20), MYEAR NUMBER(4), RATING NUMBER(3,1));
CREATE TABLE ACTORS (ACTOR VARCHAR2(20), AYEAR NUMBER(4));
CREATE TABLE ACTS (ACTOR VARCHAR2(20), TITLE VARCHAR2(30));
CREATE TABLE DIRECTORS (DIRECTOR VARCHAR2(20), DYEAR NUMBER(4));
INSERT INTO MOVIES VALUES ('Fargo','Coen',1996,8.2);
INSERT INTO MOVIES VALUES ('Raising Arizona','Coen',1987,7.6);
INSERT INTO MOVIES VALUES ('Spiderman','Raimi',2002,7.4);
INSERT INTO MOVIES VALUES ('Wonder Boys','Hanson',2000,7.6);
INSERT INTO ACTORS VALUES ('Cage',1964);
INSERT INTO ACTORS VALUES ('Hanks',1956);
INSERT INTO ACTORS VALUES ('Maguire',1975);
INSERT INTO ACTORS VALUES ('McDormand',1957);
INSERT INTO ACTS VALUES ('Cage','Raising Arizona');
INSERT INTO ACTS VALUES ('Maguire','Spiderman');
INSERT INTO ACTS VALUES ('Maguire','Wonder Boys');
INSERT INTO ACTS VALUES ('McDormand','Fargo');
INSERT INTO ACTS VALUES ('McDormand','Raising Arizona');
INSERT INTO ACTS VALUES ('McDormand','Wonder Boys');
INSERT INTO DIRECTORS VALUES ('Coen',1954);
INSERT INTO DIRECTORS VALUES ('Hanson',1945);
INSERT INTO DIRECTORS VALUES ('Raimi',1959);
`.trim();

  Weeks.push({
    id: 'w2', num: 2, nav: 'DDL & DML', title: 'DDL & DML – create, change, query', lab: 'Lab sheet 2', time: '40 min',
    summary: 'The four command families, data types, CREATE/ALTER/DROP, INSERT/UPDATE/DELETE, and the basic SELECT … FROM … WHERE.',
    blurb: 'CREATE · ALTER · DROP · INSERT · UPDATE · DELETE · basic SELECT.',
    tldr: [
      '**DDL** defines structure (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`). **DML** changes data (`INSERT`, `UPDATE`, `DELETE`). `SELECT` is DQL.',
      'Oracle types you need: `VARCHAR2(n)`, `CHAR(n)`, `NUMBER(p,s)`, `DATE`.',
      '`UPDATE`/`DELETE` **without WHERE touch every row**. Always test with a `SELECT … WHERE` first.',
      '`DELETE` removes rows (can roll back), `TRUNCATE` empties the table (DDL), `DROP` removes the table itself.',
      'A query is `SELECT cols FROM tables WHERE condition` – the result is always a table.'
    ],
    lesson: [
      h('The command families'),
      table(['Family', 'Commands', 'Does what'], [
        ['**DDL** – Data Definition', '`CREATE` `ALTER` `DROP` `TRUNCATE` `RENAME`', 'structure: tables, columns, constraints. **Auto-commits.**'],
        ['**DML** – Data Manipulation', '`INSERT` `UPDATE` `DELETE`', 'the rows inside tables. Needs `COMMIT` / can `ROLLBACK`.'],
        ['**DQL** – Query', '`SELECT`', 'read data (some books file it under DML)'],
        ['**TCL** – Transaction Control', '`COMMIT` `ROLLBACK` `SAVEPOINT`', 'make DML permanent or undo it'],
        ['**DCL** – Data Control', '`GRANT` `REVOKE`', 'permissions']]),
      exam('The slide deck says: *“Do not write TRUNCATE as a DML command unless the question asks specifically.”* TRUNCATE is **DDL**.'),

      h('Data types (Oracle)'),
      table(['Type', 'Meaning', 'Example'], [
        ['`CHAR(n)`', 'fixed length, padded with spaces', '`CHAR(2)` for a state code'],
        ['`VARCHAR2(n)`', 'variable length up to n (the normal text type)', '`VARCHAR2(20)` for a name'],
        ['`NUMBER(p,s)`', 'p = total digits, s = digits after the point', '`NUMBER(8,2)` holds 123456.78 · `NUMBER(3,1)` holds 44.5 but not 444.5'],
        ['`NUMBER` / `INT`', 'any number / integer', ''],
        ['`DATE`', 'date + time, default display `DD-MON-YY`', '`\'01-JAN-06\'`']]),
      tip('`NUMBER(8,2)`: **8 digits total, 2 of them after the decimal point** – so 6 before. This exact question is a classic.'),

      h('CREATE TABLE'),
      sql(`CREATE TABLE instructor (
  id         CHAR(5),
  name       VARCHAR2(20) NOT NULL,
  dept_name  VARCHAR2(20),
  salary     NUMBER(8,2)
);
DESC instructor;`, { fresh: true, note: '`DESC table` shows the columns and types (Oracle/SQL*Plus command).' }),
      p('Constraints (`PRIMARY KEY`, `FOREIGN KEY`, …) go in the same statement – that is Week 3.'),

      h('ALTER · DROP · TRUNCATE · DELETE'),
      sql(`-- add a column (existing rows get NULL)
ALTER TABLE branch ADD (phone VARCHAR2(10));
-- remove a column
ALTER TABLE branch DROP COLUMN phone;
-- rename a column
ALTER TABLE branch RENAME COLUMN city TO location;
SELECT * FROM branch;`, { note: 'Oracle also has `ALTER TABLE t MODIFY (col NEW_TYPE)` to change a column’s type/size (can’t run in this sandbox – see Week 3).' }),
      table(['', 'What goes', 'WHERE allowed?', 'Rollback?', 'Table remains?'], [
        ['`DELETE FROM t WHERE …`', 'chosen rows', 'yes', 'yes (before COMMIT)', 'yes'],
        ['`TRUNCATE TABLE t`', 'all rows, instantly', 'no', 'no (DDL)', 'yes (empty)'],
        ['`DROP TABLE t`', 'rows **and** the table definition', 'no', 'no', 'no']]),

      h('INSERT'),
      sql(`-- all columns, in table order
INSERT INTO customers VALUES ('ASHA', 'PUNE');
-- only some columns (the rest become NULL / default)
INSERT INTO deposit (actno, cname, amount) VALUES ('110', 'ASHA', 4500);
-- dates: Oracle accepts 'DD-MON-YY'
INSERT INTO deposit VALUES ('111', 'ASHA', 'POWAI', 900, '12-JAN-06');
SELECT * FROM deposit WHERE cname = 'ASHA';`),
      trap('Text and dates go in **single quotes**; numbers don’t. Double quotes are for identifiers, not strings. Values must come in the same order as the columns (or name the columns explicitly).'),

      h('UPDATE and DELETE – always with WHERE'),
      sql(`UPDATE customers SET city = 'CHENNAI' WHERE cname = 'SHIVANI';
DELETE FROM borrow WHERE amount < 2500;
SELECT * FROM borrow;`, { note: 'Re-run this block: it starts from a fresh copy of the database each time.' }),
      trap('`UPDATE customers SET city = \'CHENNAI\';` (no WHERE) rewrites **every** row. Safe habit: run `SELECT … WHERE …` first, check the rows, then change `SELECT` into `UPDATE`/`DELETE`.'),

      h('SELECT basics'),
      sql(`SELECT cname, amount            -- projection: choose columns
FROM   deposit                -- which table
WHERE  amount > 4000          -- selection: choose rows
ORDER  BY amount DESC;        -- sort (ASC is default)`),
      list('`SELECT *` = all columns. `SELECT DISTINCT city FROM branch` removes duplicate rows.', 'Aliases: `amount * 12 AS yearly` (the `AS` is optional).', 'Conditions: `= <> != < > <= >=`, combine with `AND OR NOT`.', 'Quick filters: `BETWEEN 1000 AND 3000`, `IN (\'DELHI\',\'BOMBAY\')`, `LIKE \'S%\'` (full story in Week 6).'),
      sql(`SELECT DISTINCT city FROM branch;
SELECT cname, amount, amount * 0.05 AS interest FROM deposit WHERE amount BETWEEN 3000 AND 7000;`),
      h3('Dates in conditions'),
      p('Oracle compares dates as real dates: `WHERE adate > \'1-DEC-95\'` (or `TO_DATE(\'01-12-1995\',\'DD-MM-YYYY\')`). The lab sheet’s `\'1-12-96\'` only works if your session’s date format is `DD-MM-YY`, so prefer `DD-MON-YY` or `TO_DATE`.'),
      sql(`SELECT cname, adate FROM deposit WHERE adate > '1-DEC-95';`, { note: 'This sandbox understands `DD-MON-YY` literals and `TO_DATE`.' }),

      h('FROM with several tables & renaming'),
      p('Listing two tables in `FROM` gives their **Cartesian product** (every row paired with every row). It only becomes useful with a join condition in `WHERE` (Week 5). Renaming with `AS` lets a table be compared with itself:'),
      sql(`-- depositors holding more than at least one depositor of branch 'ANDHERI' (2000)
SELECT DISTINCT t.cname
FROM   deposit t, deposit s
WHERE  t.amount > s.amount AND s.bname = 'ANDHERI';`)
    ],
    cheat: [
      ['create', 'CREATE TABLE t (c1 VARCHAR2(20) NOT NULL, c2 NUMBER(8,2), c3 DATE);'],
      ['alter', 'ALTER TABLE t ADD (c4 NUMBER);\nALTER TABLE t DROP COLUMN c4;\nALTER TABLE t RENAME COLUMN c2 TO price;\nALTER TABLE t MODIFY (c1 VARCHAR2(40));'],
      ['remove', 'DELETE FROM t WHERE …;   TRUNCATE TABLE t;   DROP TABLE t;'],
      ['insert / update', "INSERT INTO t VALUES ('x', 10, '01-JAN-06');\nINSERT INTO t (c1, c2) VALUES ('y', 5);\nUPDATE t SET c2 = c2 + 1 WHERE c1 = 'x';"],
      ['select', 'SELECT DISTINCT a, b*2 AS dbl FROM t WHERE c > 5 AND d IN (1,2) ORDER BY a DESC;']
    ],
    sheetTitle: 'Lab Sheet 2 – DDL and DML commands',
    scenario: 'Exercise 1 uses the bank tables **DEPOSIT, BRANCH, CUSTOMERS, BORROW**; Exercise 2 is the **movie database**. Every question starts from a fresh copy of the data.',
    dataset: { name: 'Bank + Movie database (Lab sheet 2)', sql: DS, note: 'Dates are stored as ISO text in this sandbox, but you can write `\'1-MAR-95\'` style literals exactly like in Oracle.' },
    practice: [
      { id: 'q1', type: 'sql', q: '**1.** Describe `deposit` (show its columns and types).', answer: 'DESC deposit;', hint: 'One Oracle/SQL*Plus command: `DESC table_name;`', explain: '`DESC` (or `DESCRIBE`) lists column names, NOT NULL status and data type.' },
      { id: 'q2', type: 'sql', q: '**2.** List all data from table `CUSTOMERS`.', answer: 'SELECT * FROM customers;', hint: 'The star means “all columns”.' },
      { id: 'q3', type: 'sql', q: '**3.** List all data from table `BRANCH`.', answer: 'SELECT * FROM branch;' },
      { id: 'q4', type: 'sql', q: '**4.** Display account number and amount of depositors.', answer: 'SELECT actno, amount FROM deposit;' },
      { id: 'q5', type: 'sql', q: '**5.** Display name of depositors having amount greater than 4000.', answer: 'SELECT cname FROM deposit WHERE amount > 4000;', hint: 'Numbers are not quoted.' },
      { id: 'q6', type: 'sql', q: '**6.** Give the names of customers who opened an account **after 1-DEC-95** (the sheet says `1-12-96`, which matches no row in this data – remember: no query may return “No rows found”, so adjust the date).', answer: "SELECT cname FROM deposit WHERE adate > '1-DEC-95';", hint: "Compare `adate` with a quoted date literal like `'1-DEC-95'`.", explain: 'In real Oracle you could also write `adate > TO_DATE(\'01-12-1995\',\'DD-MM-YYYY\')` – safest because it ignores the session’s date format.' },
      { id: 'q7', type: 'sql', q: "**7.** Update the city of customer `'SHIVANI'` from `'BOMBAY'` to `'CHENNAI'`.", answer: "UPDATE customers SET city = 'CHENNAI' WHERE cname = 'SHIVANI';", verify: 'SELECT * FROM customers ORDER BY cname', hint: 'UPDATE … SET … WHERE …', explain: 'The WHERE keeps the other nine customers untouched.' },
      { id: 'q8', type: 'sql', q: '**8.** Delete the borrower details if the loan amount is less than 2500.', answer: 'DELETE FROM borrow WHERE amount < 2500;', verify: 'SELECT * FROM borrow ORDER BY loanno', hint: 'DELETE FROM table WHERE condition' },
      { id: 'q9', type: 'sql', q: '**9.** Drop table `BORROW`.', answer: 'DROP TABLE borrow;', verify: "SELECT name FROM sqlite_master WHERE type='table' AND name='BORROW' COLLATE NOCASE", allowEmpty: true, explain: 'DROP removes data **and** structure; it can’t be rolled back.' },
      { id: 'q10', type: 'sql', q: '**10.** Create a table `movie_info` with columns `title` (text up to 30 chars), `myear` (4-digit number) and `rating` (number like 8.2).', answer: 'CREATE TABLE movie_info (title VARCHAR2(30), myear NUMBER(4), rating NUMBER(3,1));', verify: "SELECT lower(name), replace(upper(type),' ','') FROM pragma_table_info('movie_info')", hint: '`NUMBER(3,1)` = 3 digits, 1 after the point (8.2).' },
      { id: 'q11', type: 'sql', q: '**11.** Add a column `phone` (`VARCHAR2(10)`) to `BRANCH`.', answer: 'ALTER TABLE branch ADD (phone VARCHAR2(10));', verify: "SELECT lower(name), replace(upper(type),' ','') FROM pragma_table_info('branch')", hint: 'ALTER TABLE … ADD ( … )' },
      { id: 'q12', type: 'sql', q: "**12.** Insert a new customer `'ASHA'` from `'PUNE'`.", answer: "INSERT INTO customers VALUES ('ASHA', 'PUNE');", verify: 'SELECT * FROM customers ORDER BY cname' },
      { id: 'q13', type: 'sql', q: '**13.** List the **different** cities that appear in `BRANCH`, with no duplicates.', answer: 'SELECT DISTINCT city FROM branch;' },
      { id: 'q14', type: 'sql', q: '**14.** Show customer name and amount of every deposit, richest first.', answer: 'SELECT cname, amount FROM deposit ORDER BY amount DESC;', ordered: true, hint: 'ORDER BY … DESC' },
      { id: 'q15', type: 'sql', q: '**15.** Show `cname` and 5 % interest (`amount * 0.05`) named `interest` for deposits between 3000 and 5000 (inclusive).', answer: 'SELECT cname, amount * 0.05 AS interest FROM deposit WHERE amount BETWEEN 3000 AND 5000;', hint: 'BETWEEN includes both ends.' },
      { id: 'm1', type: 'sql', q: '**Ex. 2 – 1.** Find movies made after 1997.', answer: 'SELECT * FROM movies WHERE myear > 1997;' },
      { id: 'm2', type: 'sql', q: '**Ex. 2 – 2.** Find movies made by Hanson after 1997.', answer: "SELECT * FROM movies WHERE director = 'Hanson' AND myear > 1997;" },
      { id: 'm3', type: 'sql', q: '**Ex. 2 – 3.** Find all movies and their ratings.', answer: 'SELECT title, rating FROM movies;' },
      { id: 'm4', type: 'sql', q: '**Ex. 2 – 4.** Find all actors **and** directors (one list of names).', answer: 'SELECT actor FROM actors UNION SELECT director FROM directors;', hint: 'Two lists stacked into one: set operator `UNION` (columns must match in number).', explain: 'UNION also removes duplicates. Week 7 covers set operators properly.' },
      { id: 'm5', type: 'sql', q: '**Ex. 2 – 5.** Find Coen’s movies with McDormand.', answer: "SELECT m.title FROM movies m, acts a WHERE m.title = a.title AND m.director = 'Coen' AND a.actor = 'McDormand';", hint: 'The director is in `movies`, the actor in `acts`; connect them on `title` (that is a join – Week 5).', explain: 'A taste of joins: FROM two tables + equality on the shared column.' },
      { id: 'f1', type: 'fill', q: '**Fill in the blanks** – complete the statements.', code: `___1___ TABLE student (
  regno  VARCHAR2(10),
  name   ___2___(30),
  cgpa   NUMBER(___3___)
);
___4___ INTO student VALUES ('21BCE001', 'Anu', 8.75);
UPDATE student ___5___ cgpa = 9.0 ___6___ regno = '21BCE001';`, blanks: [['CREATE'], ['VARCHAR2'], ['3,2', '3, 2'], ['INSERT'], ['SET'], ['WHERE']], hint: '8.75 needs 3 digits in total, 2 after the point.' },
      { id: 'c1', type: 'mcq', q: 'You must remove **all rows** quickly but keep the empty table. Which statement?', opts: ['TRUNCATE TABLE t', 'DROP TABLE t', 'DELETE t WHERE 1=2', 'ALTER TABLE t DROP ALL'], a: 0, why: 'TRUNCATE empties the table (DDL, no WHERE, can’t be rolled back); DROP deletes the table itself.' }
    ],
    quiz: [
      { q: 'Which of these is a **DDL** command?', opts: ['TRUNCATE', 'UPDATE', 'SELECT', 'INSERT'], a: 0, why: 'TRUNCATE changes/empties structure ⇒ DDL (auto-commits).' },
      { q: 'A column is `NUMBER(5,2)`. Which value can it store?', opts: ['123.45', '1234.5', '12345.67', '0.123456'], a: 0, why: '5 digits in total, 2 after the point ⇒ at most 3 before it. 123.45 fits.' },
      { q: '`UPDATE emp SET sal = 0;` – what happens?', opts: ['Every employee’s salary becomes 0', 'Syntax error – WHERE is mandatory', 'Only the first row changes', 'Nothing – needs COMMIT first'], a: 0, why: 'Without WHERE the update applies to all rows.' },
      { q: 'Which statement can be rolled back (before commit)?', opts: ['DELETE FROM t', 'TRUNCATE TABLE t', 'DROP TABLE t', 'ALTER TABLE t ADD (x INT)'], a: 0, why: 'DDL statements auto-commit. DELETE is DML.' },
      { q: 'Remove duplicate cities from the output:', opts: ['SELECT DISTINCT city FROM branch', 'SELECT UNIQUE_ONLY city FROM branch', 'SELECT city FROM branch GROUP', 'SELECT city FROM DISTINCT branch'], a: 0, why: 'DISTINCT goes right after SELECT.' },
      { q: 'How do you write a string value in SQL?', opts: ["'DELHI'", '"DELHI"', 'DELHI', '`DELHI`'], a: 0, why: 'Single quotes for strings and dates.' },
      { q: '`INSERT INTO deposit (actno, cname) VALUES (\'9\', \'RAJ\');` – what is `amount` for the new row?', opts: ['NULL', '0', 'empty string', 'the statement fails'], a: 0, why: 'Columns you leave out get their DEFAULT, or NULL if none.' }
    ]
  });
})();
