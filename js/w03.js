(function () {
  const { h, h3, p, list, olist, sql, tip, trap, exam, note, table, cmp, flow } = D;
  const DS = `
CREATE TABLE authors (
  authorid NUMBER PRIMARY KEY,
  name     VARCHAR2(30),
  email    VARCHAR2(40) CONSTRAINT uq_email UNIQUE
);
CREATE TABLE books (
  isbn  VARCHAR2(13) PRIMARY KEY,
  title VARCHAR2(60),
  price NUMBER(7,2),
  qty   NUMBER NOT NULL
);
CREATE TABLE book_authors (
  isbn     VARCHAR2(13),
  authorid NUMBER,
  CONSTRAINT fk_ba_isbn   FOREIGN KEY (isbn)     REFERENCES books(isbn) ON DELETE CASCADE,
  CONSTRAINT fk_ba_author FOREIGN KEY (authorid) REFERENCES authors(authorid)
);
CREATE TABLE book_reviews (
  reviewid NUMBER PRIMARY KEY,
  isbn     VARCHAR2(13),
  stars    NUMBER CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT fk_rev_isbn FOREIGN KEY (isbn) REFERENCES books(isbn) ON DELETE SET NULL
);
INSERT INTO authors VALUES (1, 'Korth', 'korth@db.com');
INSERT INTO authors VALUES (2, 'Navathe', 'navathe@db.com');
INSERT INTO authors VALUES (3, 'Ullman', 'ullman@db.com');
INSERT INTO books VALUES ('111', 'Database Systems', 650, 10);
INSERT INTO books VALUES ('222', 'Fundamentals of DBMS', 720, 5);
INSERT INTO books VALUES ('333', 'Principles of SQL', 410, 0);
INSERT INTO book_authors VALUES ('111', 1);
INSERT INTO book_authors VALUES ('111', 2);
INSERT INTO book_authors VALUES ('222', 2);
INSERT INTO book_authors VALUES ('333', 3);
INSERT INTO book_reviews VALUES (1, '111', 5);
INSERT INTO book_reviews VALUES (2, '111', 4);
INSERT INTO book_reviews VALUES (3, '222', 3);
`.trim();
  const R = (re, msg) => ({ re, msg });

  Weeks.push({
    id: 'w3', num: 3, nav: 'Integrity Constraints', title: 'Integrity Constraints & Foreign Keys', lab: 'Lab sheet 3', time: '40 min',
    summary: 'Rules the database enforces for you: NOT NULL, UNIQUE, PRIMARY KEY, FOREIGN KEY, CHECK, DEFAULT – and how to add or drop them.',
    blurb: 'PK · FK · UNIQUE · CHECK · DEFAULT · ON DELETE CASCADE · ALTER / DROP constraint.',
    tldr: [
      '**PRIMARY KEY** = UNIQUE + NOT NULL, once per table. **UNIQUE** allows NULLs. **CHECK** tests a condition. **DEFAULT** fills a missing value.',
      '**FOREIGN KEY** child column must match an existing parent key (or be NULL). Parent must exist first.',
      'Deleting a parent that has children: **error** (default) · `ON DELETE CASCADE` deletes children · `ON DELETE SET NULL` nulls the FK.',
      'Oracle changes constraints with `ALTER TABLE … ADD CONSTRAINT / DROP CONSTRAINT / MODIFY`.',
      'To drop a **primary key**, first drop every foreign key that points at it (or use `CASCADE`).'
    ],
    lesson: [
      h('What a constraint is'),
      p('A constraint is a rule attached to a table. Any `INSERT/UPDATE/DELETE` that breaks it is **rejected with an error** – the data stays clean without any application code.'),
      table(['Constraint', 'Rule', 'NULL allowed?', 'Typical error'], [
        ['`NOT NULL`', 'value required', 'no', 'ORA-01400 cannot insert NULL'],
        ['`UNIQUE`', 'no duplicates', '**yes** (NULLs aren’t compared)', 'ORA-00001 unique constraint violated'],
        ['`PRIMARY KEY`', 'unique **and** not null; identifies the row', 'no', 'ORA-00001 / ORA-01400'],
        ['`FOREIGN KEY`', 'value must exist in the parent’s key', 'yes', 'ORA-02291 parent key not found · ORA-02292 child record found'],
        ['`CHECK (cond)`', 'row must satisfy the condition', 'passes if cond is unknown (NULL)', 'ORA-02290 check constraint violated'],
        ['`DEFAULT v`', 'value used when the column is omitted', '—', '(not a validation rule)']]),
      exam('Oracle detail from the notes: **NOT NULL can only be written at column level** (`qty NUMBER NOT NULL`) – never as a separate table-level clause.'),

      h('Defining them in CREATE TABLE'),
      sql(`CREATE TABLE dept (
  deptno NUMBER        CONSTRAINT pk_dept PRIMARY KEY,
  dname  VARCHAR2(20)  NOT NULL UNIQUE
);
CREATE TABLE emp (
  empno  NUMBER(4)     PRIMARY KEY,
  ename  VARCHAR2(20)  NOT NULL,
  sal    NUMBER(8,2)   CHECK (sal > 0),
  city   VARCHAR2(15)  DEFAULT 'CHENNAI',
  deptno NUMBER,
  CONSTRAINT fk_emp_dept FOREIGN KEY (deptno) REFERENCES dept(deptno)
);
INSERT INTO dept VALUES (10, 'SALES');
INSERT INTO emp (empno, ename, sal, deptno) VALUES (1, 'Ravi', 5000, 10);
SELECT * FROM emp;   -- city was filled by DEFAULT`, { fresh: true }),
      list('**Column level** – written right after the column: `sal NUMBER CHECK (sal > 0)`.', '**Table level** – written after all columns; needed for **composite** keys: `PRIMARY KEY (isbn, authorid)` and for naming FKs.', 'Name constraints (`CONSTRAINT fk_emp_dept …`) – unnamed ones get ugly names like `SYS_C0027603`, which you then have to look up before dropping.'),
      sql(`-- What each rule does when broken (read the errors!)
INSERT INTO dept VALUES (10, 'HR');          -- duplicate primary key
INSERT INTO emp VALUES (2, NULL, 100, 10, 'X');    -- NOT NULL
INSERT INTO emp (empno, ename, sal, deptno) VALUES (3, 'Asha', -5, 10);  -- CHECK
INSERT INTO emp (empno, ename, sal, deptno) VALUES (4, 'Meena', 100, 99);  -- FK: no dept 99`, { fresh: true, expectError: true, setup: "CREATE TABLE dept (deptno NUMBER PRIMARY KEY, dname VARCHAR2(20) NOT NULL UNIQUE); CREATE TABLE emp (empno NUMBER(4) PRIMARY KEY, ename VARCHAR2(20) NOT NULL, sal NUMBER(8,2) CHECK (sal > 0), city VARCHAR2(15) DEFAULT 'CHENNAI', deptno NUMBER, CONSTRAINT fk_emp_dept FOREIGN KEY (deptno) REFERENCES dept(deptno)); INSERT INTO dept VALUES (10,'SALES');", note: 'Each statement is rejected on its own – the four errors are four different rules: PK/UNIQUE · NOT NULL · CHECK · FOREIGN KEY.' }),

      h('Foreign keys: the parent/child rules'),
      flow('PARENT table (has the PK)', 'CHILD table (has the FK)'),
      list('Create the **parent first**, drop it **last**. Insert parent rows before child rows.', 'The FK column(s) must reference a **PRIMARY KEY or UNIQUE** column of the parent.', 'A child value is either **NULL** or an existing parent key – no orphans.', 'Data types must match.'),
      h3('What happens when you delete a parent row?'),
      table(['FK clause', 'Delete parent that has children…'], [
        ['(nothing – default)', '**Error** ORA-02292 “child record found”. You must delete children first.'],
        ['`ON DELETE CASCADE`', 'children are **deleted automatically**'],
        ['`ON DELETE SET NULL`', 'children stay but their FK becomes **NULL**']]),
      sql(`DELETE FROM books WHERE isbn = '111';
SELECT 'book_authors' AS tbl, COUNT(*) FROM book_authors
UNION ALL SELECT 'reviews with NULL isbn', COUNT(*) FROM book_reviews WHERE isbn IS NULL;`, { note: '`book_authors` uses CASCADE (its 2 rows for ISBN 111 vanish); `book_reviews` uses SET NULL (its 2 rows stay with isbn = NULL).' }),
      trap('Oracle has **no `ON UPDATE CASCADE`** (some web articles mention it – that’s MySQL/PostgreSQL). In Oracle you can’t change a parent key that children reference.'),

      h('Changing constraints later (Oracle syntax)'),
      table(['I want to…', 'Statement'], [
        ['add UNIQUE', '`ALTER TABLE books ADD CONSTRAINT uq_title UNIQUE (title);`'],
        ['add CHECK', '`ALTER TABLE books ADD CONSTRAINT ck_price CHECK (price > 0);`'],
        ['add PRIMARY KEY / FOREIGN KEY', '`ALTER TABLE t ADD CONSTRAINT pk_t PRIMARY KEY (id);` · `… ADD CONSTRAINT fk FOREIGN KEY (c) REFERENCES p(id);`'],
        ['make a column NOT NULL / allow NULL', '`ALTER TABLE books MODIFY price NOT NULL;` · `ALTER TABLE books MODIFY qty NULL;`'],
        ['set / change a DEFAULT', '`ALTER TABLE books MODIFY qty DEFAULT 0;`'],
        ['drop a named constraint', '`ALTER TABLE books DROP CONSTRAINT uq_title;`'],
        ['drop primary key / unique', '`ALTER TABLE books DROP PRIMARY KEY;` · `ALTER TABLE authors DROP UNIQUE (email);`'],
        ['add a column with a constraint', '`ALTER TABLE authors ADD (age NUMBER CHECK (age >= 18));`']]),
      note('These Oracle `ALTER … MODIFY / ADD CONSTRAINT / DROP CONSTRAINT` statements can’t run in the browser’s SQLite engine – so the lab sheet questions for them are *write-the-statement* questions checked by pattern. Learn the shapes above.'),
      h3('Finding a constraint’s name before dropping it'),
      sql(`SELECT constraint_name, constraint_type
FROM   user_constraints
WHERE  table_name = 'BOOK_AUTHORS';   -- table name in UPPER CASE`, { static: true, note: 'Types: `P` primary key · `R` foreign key (referential) · `U` unique · `C` check / not null. If you never named the constraint Oracle invented `SYS_C00…`.' }),
      h3('Order matters when dropping'),
      olist('Drop (or `CASCADE`) the **foreign keys** that reference the key.', 'Then drop the **primary key**.', 'Or in one go: `DROP TABLE parent CASCADE CONSTRAINTS;`'),
      trap('`ALTER TABLE books DROP PRIMARY KEY;` fails with *ORA-02273: this unique/primary key is referenced by some foreign keys* while `book_authors` still points at it. Use `DROP PRIMARY KEY CASCADE` or drop the FK first (that is exactly lab question 8).')
    ],
    cheat: [
      ['column level', 'c NUMBER PRIMARY KEY | c VARCHAR2(9) NOT NULL UNIQUE | c NUMBER CHECK (c > 0) | c NUMBER DEFAULT 0'],
      ['table level', 'CONSTRAINT pk PRIMARY KEY (a, b),\nCONSTRAINT fk FOREIGN KEY (b) REFERENCES parent(b) ON DELETE CASCADE | SET NULL'],
      ['alter', "ALTER TABLE t ADD CONSTRAINT uq UNIQUE (c);\nALTER TABLE t MODIFY c NOT NULL;   -- or MODIFY c NULL\nALTER TABLE t MODIFY c DEFAULT 0;\nALTER TABLE t DROP CONSTRAINT uq;\nALTER TABLE t DROP PRIMARY KEY [CASCADE];"],
      ['find names', "SELECT constraint_name, constraint_type FROM user_constraints WHERE table_name = 'T';"]
    ],
    sheetTitle: 'Lab Sheet 3 – Integrity constraints',
    scenario: 'Tables **Books**, **Authors**, **Book_Authors**. Questions 1–3 build the tables (graded by trying valid and invalid inserts). Questions 4–13 are the ALTER/DROP tasks from the sheet (Oracle syntax – checked by pattern; compare with the model answer).',
    dataset: { name: 'Books / Authors (with reviews)', sql: DS, note: 'Already contains the three lab tables plus `book_reviews` (to demonstrate ON DELETE SET NULL).' },
    practice: [
      { id: 'c1', type: 'sql', fresh: true, q: '**Create `authors`:** `authorid` NUMBER primary key, `name` VARCHAR2(30), `email` VARCHAR2(40) **unique**. (Graded by test inserts: a duplicate id and a duplicate email must be rejected, a NULL email accepted.)', answer: 'CREATE TABLE authors (authorid NUMBER PRIMARY KEY, name VARCHAR2(30), email VARCHAR2(40) UNIQUE);', probes: ["INSERT INTO authors VALUES (1,'A','a@x.com')", "INSERT INTO authors VALUES (1,'B','b@x.com')", "INSERT INTO authors VALUES (2,'C','a@x.com')", "INSERT INTO authors VALUES (3,'D',NULL)", "INSERT INTO authors VALUES (4,'E',NULL)"], verify: "SELECT lower(name) FROM pragma_table_info('authors') ORDER BY cid", hint: 'Column constraints go right after the column: `authorid NUMBER PRIMARY KEY`.', explain: 'Two NULL emails are both accepted – UNIQUE does not compare NULLs.' },
      { id: 'c2', type: 'sql', fresh: true, q: '**Create `books`:** `isbn` (primary key), `title`, `price`, `qty` (**NOT NULL**). Test inserts: duplicate isbn rejected, NULL qty rejected.', answer: 'CREATE TABLE books (isbn VARCHAR2(13) PRIMARY KEY, title VARCHAR2(60), price NUMBER(7,2), qty NUMBER NOT NULL);', probes: ["INSERT INTO books VALUES ('1','T',10,5)", "INSERT INTO books VALUES ('1','U',10,5)", "INSERT INTO books VALUES ('2','V',10,NULL)", "INSERT INTO books (isbn, title) VALUES ('3','W')", "INSERT INTO books VALUES ('4','X',NULL,0)"], verify: "SELECT lower(name) FROM pragma_table_info('books') ORDER BY cid", hint: 'Use exactly the column names isbn, title, price, qty.' },
      { id: 'c3', type: 'sql', fresh: true, q: '**Create `book_authors`** with `isbn` → foreign key to `books`, `authorid` → foreign key to `authors` (parents already exist with a few rows). Inserting a missing isbn or author must fail.', setup: "CREATE TABLE authors (authorid NUMBER PRIMARY KEY, name VARCHAR2(30)); CREATE TABLE books (isbn VARCHAR2(13) PRIMARY KEY, title VARCHAR2(60)); INSERT INTO authors VALUES (1,'Korth'); INSERT INTO books VALUES ('111','DB');", answer: 'CREATE TABLE book_authors (isbn VARCHAR2(13) REFERENCES books(isbn), authorid NUMBER REFERENCES authors(authorid));', probes: ["INSERT INTO book_authors VALUES ('111',1)", "INSERT INTO book_authors VALUES ('999',1)", "INSERT INTO book_authors VALUES ('111',9)", "INSERT INTO book_authors VALUES (NULL,1)"], verify: "SELECT lower(name) FROM pragma_table_info('book_authors') ORDER BY cid", hint: '`isbn VARCHAR2(13) REFERENCES books(isbn)` – or a table-level `FOREIGN KEY (isbn) REFERENCES books(isbn)`.', explain: 'A NULL foreign key is allowed (no parent needed) unless you also declare NOT NULL.' },
      { id: 'a1', type: 'write', q: '**1.** Add a unique constraint to `title` in the `books` table.', answer: 'ALTER TABLE books ADD CONSTRAINT uq_books_title UNIQUE (title);', needs: [R('alter\\s+table\\s+books', 'starts with ALTER TABLE books'), R('add\\s+(constraint\\s+\\w+\\s+)?unique\\s*\\(\\s*title\\s*\\)', 'ADD [CONSTRAINT name] UNIQUE (title)')], hint: 'ALTER TABLE … ADD CONSTRAINT name UNIQUE (column)' },
      { id: 'a2', type: 'write', q: '**2.** Add a NOT NULL constraint to `price` in the `books` table.', answer: 'ALTER TABLE books MODIFY price NOT NULL;', needs: [R('alter\\s+table\\s+books', 'ALTER TABLE books'), R('modify\\s*\\(?\\s*price\\s+(\\w+(\\([^)]*\\))?\\s+)?not\\s+null', 'MODIFY price … NOT NULL')], hint: 'NOT NULL is not “added”, you MODIFY the column.', explain: 'Fails in real Oracle if any existing row has a NULL price – fix the data first.' },
      { id: 'a3', type: 'write', q: '**3.** Alter the NOT NULL constraint on `price` and set a CHECK so that the value is greater than 0.0.', answer: 'ALTER TABLE books MODIFY price NUMBER(7,2) NOT NULL CHECK (price > 0.0);', needs: [R('alter\\s+table\\s+books', 'ALTER TABLE books'), R('price', 'mentions price'), R('check\\s*\\(\\s*price\\s*>\\s*0(\\.0)?\\s*\\)', 'CHECK (price > 0.0)')], hint: 'Either `MODIFY price … CHECK (…)` or a separate `ADD CONSTRAINT … CHECK (…)`.' },
      { id: 'a4', type: 'write', q: '**4.** Drop the NOT NULL constraint for `qty` in `books`.', answer: 'ALTER TABLE books MODIFY qty NULL;', needs: [R('alter\\s+table\\s+books', 'ALTER TABLE books'), R('^(?![\\s\\S]*not\\s+null)[\\s\\S]*modify\\s*\\(?\\s*qty\\s+(\\w+(\\([^)]*\\))?\\s+)?null', 'MODIFY qty NULL (no NOT)')], hint: 'To allow NULLs again you MODIFY the column to NULL.' },
      { id: 'a5', type: 'write', q: '**5.** Set a default value of `qty` in `books` as 0.', answer: 'ALTER TABLE books MODIFY qty DEFAULT 0;', needs: [R('alter\\s+table\\s+books', 'ALTER TABLE books'), R('modify\\s*\\(?\\s*qty\\s+(\\w+(\\([^)]*\\))?\\s+)?default\\s+0', 'MODIFY qty DEFAULT 0')] },
      { id: 'a6', type: 'write', q: '**6.** Drop the unique constraint on the `email` attribute of `authors`.', answer: 'ALTER TABLE authors DROP CONSTRAINT uq_email;\n-- or, without knowing the name:\nALTER TABLE authors DROP UNIQUE (email);', needs: [R('alter\\s+table\\s+authors', 'ALTER TABLE authors'), R('drop\\s+(constraint\\s+\\w+|unique\\s*\\(\\s*email\\s*\\))', 'DROP CONSTRAINT name  (or DROP UNIQUE (email))')], hint: 'Two ways: by constraint name, or `DROP UNIQUE (column)`.' },
      { id: 'a7', type: 'write', q: '**7.** Find the names of the constraints on `book_authors`, then drop any one foreign key.', answer: "SELECT constraint_name, constraint_type FROM user_constraints WHERE table_name = 'BOOK_AUTHORS';\nALTER TABLE book_authors DROP CONSTRAINT fk_ba_isbn;", needs: [R('user_constraints', 'queries USER_CONSTRAINTS'), R("table_name\\s*=\\s*'BOOK_AUTHORS'", "table name in UPPER CASE: 'BOOK_AUTHORS'"), R('alter\\s+table\\s+book_authors\\s+drop\\s+constraint\\s+\\w+', 'ALTER TABLE book_authors DROP CONSTRAINT <name>')], hint: 'Stored table names are upper case in the data dictionary.' },
      { id: 'a8', type: 'write', q: '**8.** Drop the primary key of `books` (after the foreign keys referencing it are dropped).', answer: 'ALTER TABLE book_authors DROP CONSTRAINT fk_ba_isbn;\nALTER TABLE books DROP PRIMARY KEY;', needs: [R('alter\\s+table\\s+book_authors\\s+drop\\s+constraint', 'drops the referencing foreign key first'), R('alter\\s+table\\s+books\\s+drop\\s+(primary\\s+key|constraint\\s+\\w+)', 'then ALTER TABLE books DROP PRIMARY KEY')], explain: 'Shortcut: `ALTER TABLE books DROP PRIMARY KEY CASCADE;` drops the dependent foreign keys for you.' },
      { id: 'a9', type: 'write', q: '**9.** Add an attribute `age` to `authors` and put a constraint on it (age must be at least 18).', answer: 'ALTER TABLE authors ADD (age NUMBER CHECK (age >= 18));', needs: [R('alter\\s+table\\s+authors', 'ALTER TABLE authors'), R('add\\s*\\(?\\s*age', 'ADD age …'), R('check\\s*\\(\\s*age\\s*>=?\\s*\\d+', 'CHECK (age >= 18)')] },
      { id: 'f1', type: 'sql', q: '**Cascade in action.** Delete the book with isbn `\'111\'` so that its `book_authors` rows disappear automatically but its `book_reviews` stay (with a NULL isbn).', answer: "DELETE FROM books WHERE isbn = '111';", verify: "SELECT 'ba', COUNT(*) FROM book_authors UNION ALL SELECT 'rev_null', COUNT(*) FROM book_reviews WHERE isbn IS NULL", hint: 'Nothing special in the statement – the FK definitions (CASCADE / SET NULL) do the work.' },
      { id: 'f2', type: 'sql', q: '**Safe delete.** Delete author 3 (Ullman). `book_authors` has no cascade rule for authors, so first remove his rows there, then the author.', answer: "DELETE FROM book_authors WHERE authorid = 3; DELETE FROM authors WHERE authorid = 3;", verify: "SELECT (SELECT COUNT(*) FROM authors), (SELECT COUNT(*) FROM book_authors)", hint: 'Child rows first, then the parent. (Try deleting the author alone and read the error.)', explain: 'This is the ORA-02292 situation: without CASCADE you delete bottom-up (child → parent).' },
      { id: 'fi', type: 'fill', q: '**Fill in the blanks:** a table with a composite primary key and a foreign key that cascades.', code: `CREATE TABLE enrol (
  regno   VARCHAR2(10),
  courseid VARCHAR2(8),
  ___1___ pk_enrol ___2___ (regno, courseid),
  CONSTRAINT fk_enrol_course FOREIGN KEY (courseid)
     ___3___ course(courseid) ON DELETE ___4___
);`, blanks: [['CONSTRAINT'], ['PRIMARY KEY'], ['REFERENCES'], ['CASCADE']] },
      { id: 'm1', type: 'mcq', q: 'Table `emp(deptno)` has a foreign key to `dept(deptno)` with **no** ON DELETE clause. `DELETE FROM dept WHERE deptno = 10;` – department 10 has employees. Result?', opts: ['Error: child record found (ORA-02292)', 'Department and its employees are deleted', 'Department deleted, employees’ deptno set to NULL', 'Nothing happens silently'], a: 0, why: 'Default behaviour is to refuse. You need CASCADE / SET NULL, or delete the children first.' },
      { id: 'm2', type: 'mcq', q: 'Which statement about UNIQUE vs PRIMARY KEY is **true**?', opts: ['A table can have many UNIQUE constraints but one PRIMARY KEY; UNIQUE columns may hold NULL', 'UNIQUE and PRIMARY KEY are identical', 'PRIMARY KEY allows one NULL', 'UNIQUE columns cannot be foreign-key targets'], a: 0, why: 'PK = UNIQUE + NOT NULL, one per table. A FK may reference a UNIQUE column too.' }
    ],
    quiz: [
      { q: 'Which constraint **cannot** be declared at table level in Oracle?', opts: ['NOT NULL', 'PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY'], a: 0, why: 'NOT NULL is column-level only.' },
      { q: 'A column has `UNIQUE`. How many rows may have NULL in it?', opts: ['Any number (NULLs are not compared)', 'Exactly one', 'None', 'Two'], a: 0, why: 'Standard behaviour – NULL ≠ NULL for uniqueness.' },
      { q: '`CHECK (qty > 0)` and you insert a row with `qty = NULL`. The result?', opts: ['Accepted – the condition is UNKNOWN, not FALSE', 'Rejected', 'qty becomes 0', 'Error ORA-02290'], a: 0, why: 'A CHECK only rejects rows where the condition is **false**. Use NOT NULL as well to forbid NULL.' },
      { q: 'You want child rows removed automatically when the parent is deleted. Add to the FK:', opts: ['ON DELETE CASCADE', 'ON UPDATE CASCADE', 'ON DELETE NULL', 'WITH CASCADE'], a: 0, why: 'Oracle: ON DELETE CASCADE or ON DELETE SET NULL. No ON UPDATE in Oracle.' },
      { q: 'Which dictionary view lists a table’s constraints?', opts: ['USER_CONSTRAINTS', 'USER_TABLES', 'ALL_CONSTRAINTS_LIST', 'DBA_KEYS'], a: 0, why: 'USER_CONSTRAINTS (constraint_name, constraint_type, table_name…).' },
      { q: 'Dropping a PRIMARY KEY that is referenced by a foreign key…', opts: ['fails unless you drop the FK first or use CASCADE', 'always succeeds', 'silently drops the child table', 'sets all FK values to NULL'], a: 0, why: 'ORA-02273 – referenced by some foreign keys.' },
      { q: 'You insert a child row whose FK value is not in the parent table. Error?', opts: ['ORA-02291 integrity constraint violated – parent key not found', 'ORA-02292 child record found', 'ORA-00001 unique constraint', 'ORA-01400 cannot insert NULL'], a: 0, why: '02291 = parent missing (insert/update child); 02292 = child exists (delete parent).' }
    ]
  });
})();
