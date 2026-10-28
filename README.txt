SQL MIDTERM LAB  –  your personal study platform
================================================

HOW TO OPEN
  Double-click  index.html  (or  "SQL-Midterm-Lab (single file).html" – same app in one file,
  handy for copying to a phone/laptop).  No internet, install or server needed.
  Use Chrome / Edge / Firefox.  Your progress and drafts are saved in the browser.

STUDY LOOP (per week)
  1. Learn        – 5–10 min lesson: concept, template, exam traps. Every code box has a Run button.
  2. Lab sheet    – same format as your PDFs (schema + data + numbered questions).
                    Run = see output, Check answer = auto-graded, Hint, Model answer.
  3. Quick quiz   – concept-trap multiple choice.

WEEKS
  1 Normalization (FDs, closure, keys, BCNF/3NF, lossless)     7  Subqueries & set operations
  2 DDL & DML                                                   8  PL/SQL basics
  3 Integrity constraints & foreign keys                        9  Procedures & functions
  4 Aggregates, GROUP BY, HAVING, ORDER BY                     10  Cursors
  5 Joins                                                      11  Triggers
  6 Strings, NULL, views

TOOLS: SQL*Plus terminal · Playground (free SQL/PL-SQL console) · Normalization lab · Rapid-fire quiz · Cheat sheet

SQL*PLUS TERMINAL  (sidebar → SQL*Plus terminal)
  A black console that behaves like SQL*Plus on the lab PC.
  * Log in with ANY user-name / password (e.g. system / oracle). Each user name is its own schema.
  * Memory: COMMITted data, tables, views, sequences, procedures/functions/triggers, bind variables,
    files and command recall are kept in the browser. Like real SQL*Plus, work you did not COMMIT is
    rolled back if you close the tab / press X; EXIT, CONNECT and DDL commit. SET options reset each
    launch – put your favourites in login.sql (ED login) and they run at every login.
  * Typing: line numbers on multi-line statements, ; or / runs, blank line or . ends without running,
    Up/Down = recall, Esc = clear line, Ctrl+C = cancel, paste multi-line scripts, drop .sql files on the window.
  * Buffer:  L[IST]  n  n text  A[PPEND]  C[HANGE] /old/new  DEL  I[NPUT]  R[UN]  /  ED[IT] (notepad)
  * Files:   SAVE  GET  @file / START  SPOOL file … SPOOL OFF (downloads the .lst)  STORE SET  HOST DIR
             wk02.sql … wk11.sql are the weekly lab datasets – e.g. @wk04
  * Report:  SET LINESIZE/PAGESIZE/FEEDBACK/HEADING/NULL/COLSEP/NUMWIDTH/SERVEROUTPUT/TIMING/ECHO/VERIFY…
             COLUMN … FORMAT a20 / 99,999.99 / HEADING / NOPRINT,  BREAK ON … SKIP n,  COMPUTE SUM OF … ON …,
             TTITLE / BTITLE,  SHOW ALL / USER / ERRORS
  * Variables: &name / &&name (DEFINE, UNDEFINE, ACCEPT … PROMPT),  VARIABLE x NUMBER + EXEC :x := … + PRINT x
  * Oracle behaviour on top of the sandbox: real ORA-/SP2- messages with the * marker, VARCHAR2 length and
    NUMBER precision checks (ORA-12899/01438), ORA-00937/00979 GROUP BY errors, Oracle division (1/3 = .333…),
    ALTER TABLE ADD/MODIFY/DROP COLUMN/ADD|DROP CONSTRAINT, sequences (.NEXTVAL), ROWNUM, USER,
    TO_CHAR/TO_DATE with formats, ADD_MONTHS, LAST_DAY, data dictionary (TAB, USER_TABLES, USER_CONSTRAINTS,
    USER_OBJECTS, USER_SOURCE …), SHOW ERRORS after a procedure "created with compilation errors".
  * HELP INDEX lists every supported command.  Still a simulator: packages, REFCURSOR and some rare syntax
    are not supported.

GOOD TO KNOW
  * SQL runs on SQLite (in the browser) with an Oracle-style layer: VARCHAR2, NUMBER, MINUS, ANY/ALL,
    NVL, DUAL, SYSDATE, DESC, '01-JAN-06' dates, views you can INSERT/UPDATE through, COMMIT/ROLLBACK.
  * ALTER TABLE ... MODIFY / ADD|DROP CONSTRAINT are Oracle-only, so in the lab sheets those (Week 3) are
    "write the statement" questions checked by pattern – compare with the model answer.
    (They do run in the SQL*Plus terminal.)
  * PL/SQL is a study SIMULATOR (blocks, procedures, functions, cursors, triggers, exceptions) – great for
    learning and checking logic, but real Oracle is the final judge for edge cases.
  * PL/SQL questions are re-run with hidden test values; keep the first declaration line (e.g. n NUMBER := 17;)
    as given and print the exact format requested.
  * In the real lab: suffix table names with the last 4 digits of your reg. no. and submit screenshots.
