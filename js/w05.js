(function () {
  const { h, h3, p, list, olist, sql, tip, trap, exam, note, table, cmp, flow } = D;
  const DS = `
CREATE TABLE Student (Regno VARCHAR2(6) PRIMARY KEY, Name VARCHAR2(20), DOB DATE, Gender CHAR(1), Dept VARCHAR2(10), Cgpa NUMBER(3,1));
CREATE TABLE Department (Dept_Name VARCHAR2(10) PRIMARY KEY, HOD VARCHAR2(20), Building VARCHAR2(5));
CREATE TABLE Course (Courseid VARCHAR2(8) PRIMARY KEY, Course_Name VARCHAR2(30), Credits NUMBER(1), Dept VARCHAR2(10));
CREATE TABLE Registers (Regno VARCHAR2(6), Courseid VARCHAR2(8), Sem VARCHAR2(8), Year NUMBER(4));
INSERT INTO Student VALUES ('S001', 'Arun', '2003-05-12', 'M', 'SCOPE', 9.2);
INSERT INTO Student VALUES ('S002', 'Divya', '2002-11-20', 'F', 'SCOPE', 8.5);
INSERT INTO Student VALUES ('S003', 'Meena', '2003-02-10', 'F', 'SENSE', 9.0);
INSERT INTO Student VALUES ('S004', 'Rahul', '2002-08-15', 'M', 'SMEC', 7.8);
INSERT INTO Department VALUES ('SCOPE', 'Beena', 'AB1');
INSERT INTO Department VALUES ('SENSE', 'Ravi', 'AB2');
INSERT INTO Department VALUES ('SMEC', 'Kumar', 'AB3');
INSERT INTO Department VALUES ('SITE', 'Latha', 'AB4');
INSERT INTO Course VALUES ('C101', 'DBMS', 4, 'SCOPE');
INSERT INTO Course VALUES ('C102', 'OS', 3, 'SCOPE');
INSERT INTO Course VALUES ('SWE3001', 'Software Engineering', 3, 'SCOPE');
INSERT INTO Course VALUES ('C201', 'AI', 4, 'SENSE');
INSERT INTO Course VALUES ('C301', 'Machine Learning', 4, 'SITE');
INSERT INTO Registers VALUES ('S001', 'C101', 'Fall', 2020);
INSERT INTO Registers VALUES ('S002', 'C101', 'Winter', 2020);
INSERT INTO Registers VALUES ('S001', 'SWE3001', 'Fall', 2021);
INSERT INTO Registers VALUES ('S003', 'C201', 'Winter', 2021);
INSERT INTO Registers VALUES ('S001', 'C102', 'Fall', 2022);
INSERT INTO Registers VALUES ('S003', 'C101', 'Winter', 2021);
-- banking schema from the join notes
CREATE TABLE customer (custname VARCHAR2(10) PRIMARY KEY, custst VARCHAR2(10), custcity VARCHAR2(10));
CREATE TABLE branch (branchname VARCHAR2(10) PRIMARY KEY, branchcity VARCHAR2(10), assets NUMBER(10,2));
CREATE TABLE account (acctno NUMBER(5) PRIMARY KEY, branchname VARCHAR2(10) REFERENCES branch, balance NUMBER(10,2));
CREATE TABLE loan (loanno NUMBER(5) PRIMARY KEY, branchname VARCHAR2(15) REFERENCES branch, amount NUMBER(10,2));
CREATE TABLE depositor (custname VARCHAR2(10) REFERENCES customer, acctno NUMBER(5) REFERENCES account);
CREATE TABLE borrower (custname VARCHAR2(15) REFERENCES customer, loanno NUMBER(5) REFERENCES loan);
INSERT INTO customer VALUES ('aditya','janpath','delhi');
INSERT INTO customer VALUES ('pooja','avadi','chennai');
INSERT INTO customer VALUES ('sai','jayanagar','bangalore');
INSERT INTO customer VALUES ('anaya','rajpath','delhi');
INSERT INTO customer VALUES ('seetha','park st','bangalore');
INSERT INTO customer VALUES ('aryan','vandalur','chennai');
INSERT INTO branch VALUES ('ring road','delhi',233222);
INSERT INTO branch VALUES ('anna salai','chennai',122321);
INSERT INTO branch VALUES ('hal','bangalore',43344);
INSERT INTO branch VALUES ('vandalur','chennai',333211);
INSERT INTO account VALUES (101,'anna salai',2332);
INSERT INTO account VALUES (102,'hal',1221);
INSERT INTO account VALUES (103,'vandalur',4433);
INSERT INTO account VALUES (104,'ring road',5445);
INSERT INTO account VALUES (105,'vandalur',7764);
INSERT INTO loan VALUES (501,'hal',300459);
INSERT INTO loan VALUES (502,'ring road',211222);
INSERT INTO loan VALUES (503,'vandalur',665544);
INSERT INTO loan VALUES (504,'vandalur',232221);
INSERT INTO depositor VALUES ('aditya',104);
INSERT INTO depositor VALUES ('pooja',105);
INSERT INTO depositor VALUES ('sai',102);
INSERT INTO depositor VALUES ('anaya',101);
INSERT INTO depositor VALUES ('aryan',103);
INSERT INTO borrower VALUES ('sai',501);
INSERT INTO borrower VALUES ('seetha',501);
INSERT INTO borrower VALUES ('aryan',504);
INSERT INTO borrower VALUES ('aryan',503);
INSERT INTO borrower VALUES ('anaya',502);
-- tiny tables for visualising joins
CREATE TABLE class (id NUMBER, name VARCHAR2(10));
CREATE TABLE class_info (id NUMBER, address VARCHAR2(10));
INSERT INTO class VALUES (1,'abhi'); INSERT INTO class VALUES (2,'adam'); INSERT INTO class VALUES (3,'alex'); INSERT INTO class VALUES (4,'anu'); INSERT INTO class VALUES (5,'ashish');
INSERT INTO class_info VALUES (1,'DELHI'); INSERT INTO class_info VALUES (2,'MUMBAI'); INSERT INTO class_info VALUES (3,'CHENNAI'); INSERT INTO class_info VALUES (7,'NOIDA'); INSERT INTO class_info VALUES (8,'PANIPAT');
-- for self-join practice
CREATE TABLE emp (eid NUMBER PRIMARY KEY, ename VARCHAR2(10), mgr_id NUMBER);
INSERT INTO emp VALUES (1,'King',NULL); INSERT INTO emp VALUES (2,'Blake',1); INSERT INTO emp VALUES (3,'Clark',1); INSERT INTO emp VALUES (4,'Ford',2); INSERT INTO emp VALUES (5,'Adams',2);
`.trim();

  Weeks.push({
    id: 'w5', num: 5, nav: 'Joins', title: 'SQL Joins', lab: 'Lab sheet 5', time: '45 min',
    summary: 'Combine rows from two or more tables: inner, outer (left/right/full), cross, natural, self joins – and every way to write them.',
    blurb: 'INNER · LEFT/RIGHT/FULL OUTER · CROSS · NATURAL · USING · SELF.',
    tldr: [
      'A join pairs rows of two tables where a **join condition** is true. For *n* tables you need **at least n − 1** conditions.',
      '**INNER** = matches only. **LEFT/RIGHT/FULL OUTER** = matches **plus** unmatched rows of one/other/both sides, padded with NULL.',
      '**CROSS** = every row × every row (no condition). Forget the condition and you get this by accident.',
      '**NATURAL JOIN** joins on *all* columns with the same name – convenient but risky. `USING (col)` is the explicit cousin.',
      'To find rows **with no match** (“students who registered nothing”): `LEFT JOIN … WHERE right.key IS NULL`.'
    ],
    lesson: [
      h('The idea'),
      p('Data is split across tables (so nothing is stored twice). A join stitches it back together. Everything reduces to: **which pairs of rows do I keep?**'),
      table(['Type', 'Rows you get'], [
        ['**INNER** (equi-join)', 'only pairs where the condition is true'],
        ['**LEFT OUTER**', 'inner rows **+ every unmatched row of the left table** (right columns = NULL)'],
        ['**RIGHT OUTER**', 'inner rows + every unmatched row of the **right** table'],
        ['**FULL OUTER**', 'inner rows + unmatched rows of **both** tables'],
        ['**CROSS** (Cartesian)', 'all combinations: |A| × |B| rows'],
        ['**NATURAL**', 'inner join on all same-named columns, shown once'],
        ['**SELF**', 'a table joined to itself using two aliases (employee ↔ manager)']]),

      h('See them with two tiny tables'),
      p('`class(id,name)` has ids 1–5, `class_info(id,address)` has ids 1,2,3,7,8. Click **Run** and compare each result to the table above.'),
      sql(`SELECT * FROM class c INNER JOIN class_info i ON c.id = i.id;`, { note: 'Only ids 1, 2, 3 exist on both sides.' }),
      sql(`SELECT * FROM class c LEFT OUTER JOIN class_info i ON c.id = i.id;`, { note: 'Adds anu (4) and ashish (5) with NULL address.' }),
      sql(`SELECT * FROM class c RIGHT OUTER JOIN class_info i ON c.id = i.id;`, { note: 'Adds NOIDA (7) and PANIPAT (8) with NULL name.' }),
      sql(`SELECT * FROM class c FULL OUTER JOIN class_info i ON c.id = i.id;`, { note: 'Everything: 3 matches + 2 left-only + 2 right-only = 7 rows.' }),
      sql(`SELECT COUNT(*) FROM class CROSS JOIN class_info;`, { note: '5 × 5 = 25 rows.' }),

      h('One query, many spellings'),
      p('“Customers (and account numbers) living in Chennai” – every form below returns the same rows:'),
      table(['Style', 'Query'], [
        ['Implicit (comma) join', '`SELECT d.custname, d.acctno FROM depositor d, customer c WHERE d.custname = c.custname AND c.custcity = \'chennai\';`'],
        ['Explicit INNER JOIN … ON', '`… FROM depositor d INNER JOIN customer c ON d.custname = c.custname WHERE c.custcity = \'chennai\';`'],
        ['JOIN … USING (equi-join)', '`… FROM depositor INNER JOIN customer USING (custname) WHERE custcity = \'chennai\';`'],
        ['NATURAL JOIN', '`… FROM depositor NATURAL JOIN customer WHERE custcity = \'chennai\';`'],
        ['CROSS JOIN + WHERE', '`… FROM depositor CROSS JOIN customer WHERE customer.custname = depositor.custname AND …`']]),
      sql(`SELECT custname, acctno FROM depositor INNER JOIN customer USING (custname) WHERE custcity = 'chennai';
SELECT custname, acctno FROM depositor NATURAL JOIN customer WHERE custcity = 'chennai';`),
      tip('With **USING / NATURAL** the shared column appears once, so you must **not** qualify it (`custname`, not `depositor.custname`). With `ON` it appears twice – qualify it.'),
      trap('**NATURAL JOIN** silently uses *every* same-named column. Add a column called `city` to both tables later and your results change. In an exam prefer `ON` or `USING`, and use NATURAL only when asked.'),

      h('Joining three or more tables'),
      p('Walk along the foreign keys. “Names of students who registered for DBMS”: `Student → Registers → Course`.'),
      sql(`SELECT DISTINCT s.Name
FROM   Student s
JOIN   Registers r ON s.Regno = r.Regno
JOIN   Course c    ON r.Courseid = c.Courseid
WHERE  c.Course_Name = 'DBMS';`, { note: '3 tables ⇒ 2 join conditions. `DISTINCT` because a student could register the same course twice.' }),
      flow('pick the tables', 'find the linking columns (PK ↔ FK)', 'one ON per link', 'put filters in WHERE', 'DISTINCT / GROUP BY if rows repeat'),

      h('Outer-join patterns you will need'),
      sql(`-- students who registered for NOTHING (anti-join)
SELECT s.Name FROM Student s LEFT JOIN Registers r ON s.Regno = r.Regno WHERE r.Regno IS NULL;

-- every course with how many registrations it has (0 included)
SELECT c.Course_Name, COUNT(r.Regno) AS regs
FROM   Course c LEFT JOIN Registers r ON c.Courseid = r.Courseid
GROUP  BY c.Course_Name;`, { note: 'Count a column from the **right** table (`r.Regno`) – `COUNT(*)` would count the NULL-padded row as 1.' }),
      trap('In a LEFT JOIN, a condition on the **right** table belongs in `ON`, not `WHERE`. `… WHERE r.Year = 2021` removes the NULL-padded rows and silently turns your outer join into an inner join.'),

      h('Self join'),
      sql(`-- each employee with their manager's name
SELECT e.ename AS employee, m.ename AS manager
FROM   emp e LEFT JOIN emp m ON e.mgr_id = m.eid;`, { note: 'Same table twice → two aliases are mandatory. LEFT JOIN keeps King (no manager).' }),

      h('Oracle’s old (+) syntax'),
      p('Older Oracle code writes outer joins with a `(+)` on the side that may be **missing**:'),
      table(['ANSI', 'Oracle (+)'], [
        ['`FROM a LEFT JOIN b ON a.id = b.id`', '`FROM a, b WHERE a.id = b.id(+)`'],
        ['`FROM a RIGHT JOIN b ON a.id = b.id`', '`FROM a, b WHERE a.id(+) = b.id`']]),
      note('(+) can’t do FULL OUTER JOIN. The exam notes show both – know that the `(+)` goes on the **deficient** side.')
    ],
    cheat: [
      ['inner', 'SELECT … FROM a JOIN b ON a.k = b.k [JOIN c ON b.k2 = c.k2] WHERE …;'],
      ['using / natural', 'FROM a JOIN b USING (k)      FROM a NATURAL JOIN b'],
      ['outer', 'FROM a LEFT|RIGHT|FULL [OUTER] JOIN b ON a.k = b.k'],
      ['anti-join', 'FROM a LEFT JOIN b ON a.k = b.k WHERE b.k IS NULL'],
      ['self', 'FROM emp e JOIN emp m ON e.mgr_id = m.eid'],
      ['oracle (+)', 'WHERE a.k = b.k(+)   -- left outer']
    ],
    sheetTitle: 'Lab Sheet 5 – SQL Joins',
    scenario: 'University schema **Student, Department, Course, Registers** (the 10 questions of the sheet), then the **banking schema** from the join notes and some outer/self join drills.',
    dataset: { name: 'University + Banking + join demo tables', sql: DS, note: 'Added to the sheet’s data: department SITE and course C301 (no students/registrations) so outer joins have something to show.' },
    practice: [
      { id: 'u1', type: 'sql', q: '**1.** List the names of the students whose HoD name is `Beena`.', answer: "SELECT s.Name FROM Student s JOIN Department d ON s.Dept = d.Dept_Name WHERE d.HOD = 'Beena';", hint: 'Student.Dept ↔ Department.Dept_Name.' },
      { id: 'u2', type: 'sql', q: '**2.** List out the course names offered by the `SENSE` department.', answer: "SELECT Course_Name FROM Course WHERE Dept = 'SENSE';", hint: 'Do you really need a join here? Course already has the department.', explain: 'Trap: no join needed – never join more than the question requires.' },
      { id: 'u3', type: 'sql', q: '**3.** Find the number of **female** students in the `SCOPE` department.', answer: "SELECT COUNT(*) FROM Student WHERE Gender = 'F' AND Dept = 'SCOPE';" },
      { id: 'u4', type: 'sql', q: '**4.** List the names of students who have registered for the `DBMS` course so far.', answer: "SELECT DISTINCT s.Name FROM Student s JOIN Registers r ON s.Regno = r.Regno JOIN Course c ON r.Courseid = c.Courseid WHERE c.Course_Name = 'DBMS';", hint: 'Student → Registers → Course. Use DISTINCT.' },
      { id: 'u5', type: 'sql', q: '**5.** List out the course names that are offered in `Winter 2020`.', answer: "SELECT DISTINCT c.Course_Name FROM Course c JOIN Registers r ON c.Courseid = r.Courseid WHERE r.Sem = 'Winter' AND r.Year = 2020;", hint: '“Offered in” = someone registered in that semester.' },
      { id: 'u6', type: 'sql', q: '**6.** Find the course name which was offered in **both** `Fall 2020` and `Winter 2021`.', answer: "SELECT c.Course_Name FROM Course c JOIN Registers r ON c.Courseid = r.Courseid WHERE r.Sem = 'Fall' AND r.Year = 2020 INTERSECT SELECT c.Course_Name FROM Course c JOIN Registers r ON c.Courseid = r.Courseid WHERE r.Sem = 'Winter' AND r.Year = 2021;", hint: 'One row can’t be in both semesters, so write two queries and INTERSECT them (or self-join Registers twice).', explain: 'Alternative: `… JOIN Registers r1 … JOIN Registers r2 ON r1.Courseid = r2.Courseid WHERE (r1.Sem,r1.Year)=(Fall,2020) AND (r2.Sem,r2.Year)=(Winter,2021)`.' },
      { id: 'u7', type: 'sql', q: '**7.** Find the number of students who have registered for `SWE3001` during `Fall 2021`.', answer: "SELECT COUNT(DISTINCT Regno) FROM Registers WHERE Courseid = 'SWE3001' AND Sem = 'Fall' AND Year = 2021;" },
      { id: 'u8', type: 'sql', q: '**8.** How many courses are offered by the `SCOPE` department during `Fall 2021`?', answer: "SELECT COUNT(DISTINCT c.Courseid) FROM Course c JOIN Registers r ON c.Courseid = r.Courseid WHERE c.Dept = 'SCOPE' AND r.Sem = 'Fall' AND r.Year = 2021;" },
      { id: 'u9', type: 'sql', q: '**9.** List the names of students who are **9 pointers** (CGPA ≥ 9) and registered for courses in `Winter 2021`.', answer: "SELECT DISTINCT s.Name FROM Student s JOIN Registers r ON s.Regno = r.Regno WHERE s.Cgpa >= 9 AND r.Sem = 'Winter' AND r.Year = 2021;" },
      { id: 'u10', type: 'sql', q: '**10.** List out all the **3-credit** courses offered in `Fall 2022`.', answer: "SELECT DISTINCT c.Course_Name FROM Course c JOIN Registers r ON c.Courseid = r.Courseid WHERE c.Credits = 3 AND r.Sem = 'Fall' AND r.Year = 2022;" },
      { id: 'b1', type: 'sql', q: '**Banking 1.** List all account details (`acctno, branchname, balance`) of branches in the city `chennai`, using `NATURAL JOIN`.', answer: "SELECT acctno, branchname, balance FROM account NATURAL JOIN branch WHERE branchcity = 'chennai';", hint: '`account` and `branch` share only `branchname`, so NATURAL JOIN is safe here.' },
      { id: 'b2', type: 'sql', q: '**Banking 2.** List the customer name with the account details (account no, branch, balance).', answer: 'SELECT custname, acctno, branchname, balance FROM depositor NATURAL JOIN account;' },
      { id: 'b3', type: 'sql', q: '**Banking 3.** Show every customer with their loan number (if any) – customers without a loan must still appear.', answer: 'SELECT c.custname, b.loanno FROM customer c LEFT JOIN borrower b ON c.custname = b.custname;', hint: 'Which side must keep its unmatched rows?' },
      { id: 'b4', type: 'sql', q: '**Banking 4.** Customers who have **no account** (not in `depositor`).', answer: 'SELECT c.custname FROM customer c LEFT JOIN depositor d ON c.custname = d.custname WHERE d.custname IS NULL;', hint: 'LEFT JOIN, then keep the rows where the right side is NULL.' },
      { id: 'b5', type: 'sql', q: '**Banking 5.** For each customer show the account number **and** the loan number: `custname, acctno, loanno` (include customers that have only one of the two).', answer: 'SELECT COALESCE(d.custname, b.custname) AS custname, d.acctno, b.loanno FROM depositor d FULL OUTER JOIN borrower b ON d.custname = b.custname;', hint: 'FULL OUTER JOIN between depositor and borrower. The name column may come from either side.', explain: 'Equivalent notes query: `depositor NATURAL FULL OUTER JOIN borrower` (name shown once).' },
      { id: 'b6', type: 'sql', q: '**Banking 6.** Name, account number, branch **and branch city** of customers whose branch is in a different city from their own home city.', answer: 'SELECT c.custname, a.acctno, a.branchname, br.branchcity FROM customer c JOIN depositor d ON c.custname = d.custname JOIN account a ON d.acctno = a.acctno JOIN branch br ON a.branchname = br.branchname WHERE c.custcity <> br.branchcity;', hint: '4 tables ⇒ 3 join conditions, then one extra filter comparing the two cities.' },
      { id: 'b7', type: 'sql', q: '**Banking 7.** Total loan amount per **branch city**, only for cities where the total exceeds 500000.', answer: 'SELECT br.branchcity, SUM(l.amount) FROM loan l JOIN branch br ON l.branchname = br.branchname GROUP BY br.branchcity HAVING SUM(l.amount) > 500000;', hint: 'Join, GROUP BY branchcity, HAVING on the SUM.' },
      { id: 's1', type: 'sql', q: '**Self join.** List each employee with their manager (`employee`, `manager`); employees without a manager must still be listed.', answer: 'SELECT e.ename AS employee, m.ename AS manager FROM emp e LEFT JOIN emp m ON e.mgr_id = m.eid;' },
      { id: 'o1', type: 'sql', q: '**Outer join.** Show each course name and the number of registrations it has (0 for none).', answer: 'SELECT c.Course_Name, COUNT(r.Regno) FROM Course c LEFT JOIN Registers r ON c.Courseid = r.Courseid GROUP BY c.Course_Name;', hint: 'COUNT(r.Regno) – not COUNT(*).' },
      { id: 'o2', type: 'sql', q: '**Outer join.** Departments with **no students** at all.', answer: 'SELECT d.Dept_Name FROM Department d LEFT JOIN Student s ON d.Dept_Name = s.Dept WHERE s.Regno IS NULL;' },
      { id: 'm1', type: 'mcq', q: '`class` has 5 rows and `class_info` has 5 rows; only 3 ids match. How many rows does `class FULL OUTER JOIN class_info ON class.id = class_info.id` return?', opts: ['7', '5', '8', '25'], a: 0, why: '3 matches + 2 unmatched on the left + 2 unmatched on the right = 7.' },
      { id: 'm2', type: 'mcq', q: 'A query joins 4 tables but its `WHERE` has only 2 join conditions. What is the likely result?', opts: ['A partial Cartesian product (too many rows)', 'An error', 'The correct result', 'An empty result'], a: 0, why: 'n tables need n−1 join conditions; a missing one pairs every row with every row of the unconnected table.' }
    ],
    quiz: [
      { q: 'You need all customers, even those without loans. Which join?', opts: ['customer LEFT JOIN borrower', 'customer INNER JOIN borrower', 'borrower LEFT JOIN customer', 'customer CROSS JOIN borrower'], a: 0, why: 'The table whose rows must all survive goes on the LEFT of a LEFT JOIN.' },
      { q: '`SELECT * FROM A CROSS JOIN B` with |A| = 4 and |B| = 6 returns…', opts: ['24 rows', '10 rows', '6 rows', '4 rows'], a: 0, why: '4 × 6.' },
      { q: 'Minimum number of join conditions to connect 5 tables:', opts: ['4', '5', '3', '10'], a: 0, why: 'n − 1.' },
      { q: 'Which finds students with NO registration?', opts: ['LEFT JOIN registers … WHERE r.regno IS NULL', 'INNER JOIN registers … WHERE r.regno IS NULL', 'RIGHT JOIN registers … WHERE s.regno IS NULL', 'CROSS JOIN … WHERE regno IS NULL'], a: 0, why: 'Inner join drops them; LEFT keeps them with NULLs on the right.' },
      { q: 'NATURAL JOIN joins on…', opts: ['all columns with the same name in both tables', 'the primary key only', 'the first column', 'columns you list in USING'], a: 0, why: 'That’s why it is risky.' },
      { q: 'In Oracle’s legacy syntax, `WHERE a.id = b.id(+)` means…', opts: ['LEFT OUTER JOIN of a with b', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'INNER JOIN'], a: 0, why: '(+) marks the side that may be missing (b) ⇒ all of a are kept.' },
      { q: 'Why does `LEFT JOIN … WHERE r.year = 2021` often behave like an inner join?', opts: ['NULL-padded rows have year = NULL, which fails the WHERE test', 'WHERE is evaluated before JOIN', 'LEFT JOIN ignores WHERE', 'year is reserved'], a: 0, why: 'Put right-table filters in the ON clause to keep unmatched left rows.' }
    ]
  });
})();
