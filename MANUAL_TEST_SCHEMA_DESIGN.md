# Manual Test Cases — Designing a Schema in the SQL Editor

These cases test the **CREATE** write operation. They build a complete schema
(the *City Clinic* scenario) from an empty SQLite file, entirely inside SQL
Sensi's **SQL Editor**: tables, keys, relationships, indexes, a view, then
sample data and queries.

Mark each case **PASS / FAIL** in the Result column and note anything unexpected.

---

## What is being tested

| Allowed (admin only, when CREATE is permitted) | Still refused |
|---|---|
| `CREATE TABLE …` (also `IF NOT EXISTS`, `TEMP`) | `ALTER TABLE …` |
| `CREATE INDEX …`, `CREATE UNIQUE INDEX …` | `DROP TABLE / INDEX / VIEW …` |
| `CREATE VIEW …` | `CREATE TRIGGER`, `CREATE VIRTUAL TABLE`, `TRUNCATE` |
| | Several statements pasted together |

> **Important:** `ALTER` and `DROP` are blocked, so a table **cannot be changed
> or removed** from inside the app once it exists. Read each statement before
> confirming it. If you make a mistake, recreate `empty.db` (see S4) and start
> again.

---

## Setup (do once)

| # | Step |
|---|---|
| S1 | Open a terminal that is **not** the VS Code integrated terminal, go to the project folder and run `pnpm dev`. Wait for the Electron window. |
| S2 | Sign in with an **administrator** account (credentials as in `MANUAL_TEST_CASES.md`). |
| S3 | Have a **standard (non-admin)** account ready for case N6. Register one if needed. |
| S4 | Make sure `empty.db` exists in the project folder and has no tables. To (re)create it, delete it and run: `python -c "import sqlite3; d=sqlite3.connect('empty.db'); d.execute('CREATE TABLE _x(a)'); d.execute('DROP TABLE _x'); d.commit(); d.execute('VACUUM')"` |

### How to run a statement in the SQL Editor

1. Open **SQL Editor**, clear the editor and paste **one** statement.
2. The main button changes to **Review CREATE** (or **Review INSERT** / **Review UPDATE**). Click it.
3. A preview dialog shows the statement. Nothing has run yet.
4. Click **Run CREATE** (or **Run INSERT** / **Run UPDATE**).
5. The dialog shows **Committed.** and a row count. A `CREATE` always reports **0 rows affected**; that is correct.
6. Click **Close**.

**SELECT queries** (section F): paste the query, click **Validate & Optimize**, then **Execute Query**.

---

## A. Policy and permissions

| ID | Objective | Steps | Expected result | Result |
|---|---|---|---|---|
| A1 | CREATE option is visible | Open **Settings** (Safety & write policy) | Under **Permitted operations** there are four buttons: **INSERT, UPDATE, DELETE, CREATE**. Hovering **CREATE** shows a tooltip about CREATE TABLE / INDEX / VIEW | |
| A2 | CREATE refused while not permitted | In **Settings**, untick **CREATE** (keep writes enabled) → **Save policy**. Connect `empty.db` (**Connections** → SQLite → Browse). In the SQL Editor run `CREATE TABLE t (id INTEGER PRIMARY KEY);` | Dialog shows an error: **"CREATE is not an allowed operation under the current policy."** No table is created | |
| A3 | CREATE refused while writes are off | **Settings** → turn **Enable write operations** OFF → **Save policy**. Repeat the statement from A2 | Error: **"Writes are disabled…"**. No table is created | |
| A4 | Enable CREATE for the test | **Settings** → **Enable write operations** ON → tick **INSERT**, **UPDATE** and **CREATE** → **Save policy** | Policy saved; the version number goes up | |
| A5 | Schema is empty before starting | Open the **Schema** page for `empty.db` | No tables, views or relationships are shown | |

---

## B. Create the tables

Run each statement on its own, in this order. `Department` refers to `Doctor`
before `Doctor` exists; SQLite allows this, so B1 must still succeed.

| ID | Statement | Expected result | Result |
|---|---|---|---|
| B1 | **Department** (see SQL below) | Button reads **Review CREATE**; after **Run CREATE**: *Committed. 0 rows affected* | |
| B2 | **Doctor** | Committed | |
| B3 | **Patient** | Committed | |
| B4 | **Appointment** | Committed | |
| B5 | **Medicine** | Committed | |
| B6 | **Prescription** (junction table, composite primary key) | Committed | |
| B7 | **Bill** | Committed | |

**B1 — Department**
```sql
CREATE TABLE Department (
  DepartmentId INTEGER PRIMARY KEY,
  Name         TEXT    NOT NULL UNIQUE,
  Floor        INTEGER NOT NULL CHECK (Floor >= 0),
  HeadDoctorId INTEGER UNIQUE REFERENCES Doctor (DoctorId)
);
```

**B2 — Doctor**
```sql
CREATE TABLE Doctor (
  DoctorId       INTEGER PRIMARY KEY,
  FirstName      TEXT    NOT NULL,
  LastName       TEXT    NOT NULL,
  Specialization TEXT    NOT NULL,
  Phone          TEXT,
  Email          TEXT    NOT NULL UNIQUE,
  HireDate       TEXT    NOT NULL,
  DepartmentId   INTEGER NOT NULL REFERENCES Department (DepartmentId)
);
```

**B3 — Patient**
```sql
CREATE TABLE Patient (
  PatientId    INTEGER PRIMARY KEY,
  FirstName    TEXT NOT NULL,
  LastName     TEXT NOT NULL,
  DateOfBirth  TEXT NOT NULL,
  Gender       TEXT NOT NULL CHECK (Gender IN ('Male', 'Female', 'Other')),
  Phone        TEXT NOT NULL UNIQUE,
  Address      TEXT,
  RegisteredOn TEXT NOT NULL DEFAULT CURRENT_DATE
);
```

**B4 — Appointment**
```sql
CREATE TABLE Appointment (
  AppointmentId   INTEGER PRIMARY KEY,
  PatientId       INTEGER NOT NULL REFERENCES Patient (PatientId),
  DoctorId        INTEGER NOT NULL REFERENCES Doctor (DoctorId),
  AppointmentTime TEXT    NOT NULL,
  Reason          TEXT    NOT NULL,
  Status          TEXT    NOT NULL DEFAULT 'Scheduled' CHECK (Status IN ('Scheduled', 'Completed', 'Cancelled')),
  DiagnosisNotes  TEXT
);
```

**B5 — Medicine**
```sql
CREATE TABLE Medicine (
  MedicineId   INTEGER PRIMARY KEY,
  Name         TEXT    NOT NULL UNIQUE,
  Manufacturer TEXT,
  UnitPrice    NUMERIC NOT NULL CHECK (UnitPrice >= 0)
);
```

**B6 — Prescription**
```sql
CREATE TABLE Prescription (
  AppointmentId INTEGER NOT NULL REFERENCES Appointment (AppointmentId),
  MedicineId    INTEGER NOT NULL REFERENCES Medicine (MedicineId),
  Dosage        TEXT    NOT NULL,
  DurationDays  INTEGER NOT NULL CHECK (DurationDays > 0),
  PRIMARY KEY (AppointmentId, MedicineId)
);
```

**B7 — Bill**
```sql
CREATE TABLE Bill (
  BillId        INTEGER PRIMARY KEY,
  AppointmentId INTEGER NOT NULL UNIQUE REFERENCES Appointment (AppointmentId),
  Amount        NUMERIC NOT NULL CHECK (Amount >= 0),
  PaymentStatus TEXT    NOT NULL DEFAULT 'Unpaid' CHECK (PaymentStatus IN ('Paid', 'Unpaid')),
  PaidOn        TEXT
);
```

---

## C. Create the indexes and the view

| ID | Statement | Expected result | Result |
|---|---|---|---|
| C1 | `CREATE INDEX idx_doctor_department ON Doctor (DepartmentId);` | Committed | |
| C2 | `CREATE INDEX idx_appointment_patient ON Appointment (PatientId);` | Committed | |
| C3 | `CREATE INDEX idx_appointment_doctor ON Appointment (DoctorId);` | Committed | |
| C4 | `CREATE INDEX idx_prescription_medicine ON Prescription (MedicineId);` | Committed | |
| C5 | **UnpaidBills** view (SQL below) | Committed | |

**C5 — UnpaidBills view**
```sql
CREATE VIEW UnpaidBills AS
SELECT p.PatientId, p.FirstName || ' ' || p.LastName AS Patient, b.BillId, b.Amount
FROM Bill b
JOIN Appointment a ON a.AppointmentId = b.AppointmentId
JOIN Patient p ON p.PatientId = a.PatientId
WHERE b.PaymentStatus = 'Unpaid';
```

---

## D. Check the schema the app shows

| ID | Objective | Steps | Expected result | Result |
|---|---|---|---|---|
| D1 | All tables listed | Open the **Schema** page (reload it if it was already open) | **7 tables**: Appointment, Bill, Department, Doctor, Medicine, Patient, Prescription; and **1 view**: UnpaidBills | |
| D2 | Primary keys | Expand each table | PK is `DepartmentId`, `DoctorId`, `PatientId`, `AppointmentId`, `MedicineId`, `BillId`; **Prescription** has a two-column PK (`AppointmentId`, `MedicineId`) | |
| D3 | Relationships | Look at the relationships / foreign keys | **7 relationships**: Department.HeadDoctorId → Doctor · Doctor.DepartmentId → Department · Appointment.PatientId → Patient · Appointment.DoctorId → Doctor · Prescription.AppointmentId → Appointment · Prescription.MedicineId → Medicine · Bill.AppointmentId → Appointment | |
| D4 | Indexes | Look at the indexes | The four indexes from C1–C4 are listed against the right tables | |
| D5 | Column rules | Expand **Patient** | `Phone` is NOT NULL; `Address` is nullable; `RegisteredOn` has default `CURRENT_DATE` | |
| D6 | Audit log records CREATE | Open **Audit Log** | One **CREATE** entry with outcome *success* per statement in B and C, with the table name (for an index, the indexed table; for the view, `UnpaidBills`). The A2/A3 attempts appear as *denied* | |

Relationship types to confirm while looking at D3:

| Relationship | Type |
|---|---|
| Department → Doctor (`HeadDoctorId`, UNIQUE) | 1 : 1 (head of department) |
| Department ← Doctor (`DepartmentId`) | 1 : N |
| Patient ← Appointment, Doctor ← Appointment | 1 : N |
| Appointment ↔ Medicine through **Prescription** | M : N (junction table) |
| Appointment ← Bill (`AppointmentId`, UNIQUE) | 1 : 1 |

---

## E. Insert the sample data

Run in this order. Departments are inserted without a head first, because the
doctors do not exist yet; E3 fills in the heads.

| ID | Statement | Expected result | Result |
|---|---|---|---|
| E1 | Departments | **Review INSERT** → **Run INSERT** → *3 rows affected* | |
| E2 | Doctors | *4 rows affected* | |
| E3 | Set department heads (UPDATE) | **Review UPDATE** → *3 rows affected* | |
| E4 | Patients | *4 rows affected* | |
| E5 | Appointments | *6 rows affected* | |
| E6 | Medicines | *4 rows affected* | |
| E7 | Prescriptions | *5 rows affected* | |
| E8 | Bills | *4 rows affected* | |

**E1**
```sql
INSERT INTO Department (DepartmentId, Name, Floor) VALUES
  (1, 'Cardiology', 2),
  (2, 'Pediatrics', 1),
  (3, 'General Medicine', 0);
```

**E2**
```sql
INSERT INTO Doctor (DoctorId, FirstName, LastName, Specialization, Phone, Email, HireDate, DepartmentId) VALUES
  (1, 'Sara',  'Khan',   'Cardiologist',      '0300-1111111', 'sara.khan@cityclinic.test',   '2019-03-01', 1),
  (2, 'Usman', 'Tariq',  'Cardiologist',      '0300-2222222', 'usman.tariq@cityclinic.test', '2021-07-15', 1),
  (3, 'Hina',  'Malik',  'Pediatrician',      '0300-3333333', 'hina.malik@cityclinic.test',  '2018-01-10', 2),
  (4, 'Bilal', 'Ahmed',  'General Physician', '0300-4444444', 'bilal.ahmed@cityclinic.test', '2020-11-20', 3);
```

**E3**
```sql
UPDATE Department
SET HeadDoctorId = CASE DepartmentId WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 4 END
WHERE DepartmentId IN (1, 2, 3);
```

**E4**
```sql
INSERT INTO Patient (PatientId, FirstName, LastName, DateOfBirth, Gender, Phone, Address, RegisteredOn) VALUES
  (1, 'Ayesha', 'Noor',  '1990-05-12', 'Female', '0311-1000001', 'Lahore',    '2026-01-05'),
  (2, 'Ali',    'Raza',  '1985-09-30', 'Male',   '0311-1000002', 'Karachi',   '2026-02-14'),
  (3, 'Zain',   'Iqbal', '2019-04-02', 'Male',   '0311-1000003', 'Islamabad', '2026-03-20'),
  (4, 'Fatima', 'Shah',  '1972-12-25', 'Female', '0311-1000004', 'Lahore',    '2026-06-01');
```

**E5**
```sql
INSERT INTO Appointment (AppointmentId, PatientId, DoctorId, AppointmentTime, Reason, Status, DiagnosisNotes) VALUES
  (1, 1, 1, '2026-11-02 10:00', 'Chest pain',          'Completed', 'Mild angina; ECG normal'),
  (2, 2, 1, '2026-11-05 11:30', 'High blood pressure', 'Completed', 'Hypertension stage 1'),
  (3, 3, 3, '2026-11-06 09:00', 'Fever',               'Completed', 'Viral fever'),
  (4, 4, 4, '2026-11-10 14:00', 'Routine check-up',    'Completed', 'Healthy'),
  (5, 1, 2, '2026-11-18 12:00', 'Follow-up',           'Scheduled', NULL),
  (6, 2, 4, '2026-10-28 16:00', 'Cough',               'Cancelled', NULL);
```

**E6**
```sql
INSERT INTO Medicine (MedicineId, Name, Manufacturer, UnitPrice) VALUES
  (1, 'Aspirin 75mg',      'PharmaOne', 5.00),
  (2, 'Amlodipine 5mg',    'HealWell',  12.50),
  (3, 'Paracetamol 500mg', 'PharmaOne', 2.00),
  (4, 'Vitamin D3',        'NutriLab',  8.00);
```

**E7**
```sql
INSERT INTO Prescription (AppointmentId, MedicineId, Dosage, DurationDays) VALUES
  (1, 1, '1 tablet daily',         30),
  (2, 2, '1 tablet daily',         60),
  (2, 1, '1 tablet daily',         30),
  (3, 3, '1 tablet every 6 hours',  5),
  (4, 4, '1 capsule weekly',        8);
```

**E8**
```sql
INSERT INTO Bill (BillId, AppointmentId, Amount, PaymentStatus, PaidOn) VALUES
  (1, 1, 2500, 'Paid',   '2026-11-02'),
  (2, 2, 3000, 'Unpaid', NULL),
  (3, 3, 1500, 'Paid',   '2026-11-06'),
  (4, 4, 1000, 'Unpaid', NULL);
```

---

## F. Query the schema (reads)

For each query: paste it → **Validate & Optimize** → **Execute Query**. You can
also ask the same question in **Chat** and compare the AI's answer with the
expected result.

| ID | Question | Expected result | Result |
|---|---|---|---|
| F1 | Which doctors work in Cardiology? | 2 rows: **Sara Khan**, **Usman Tariq** (both Cardiologist) | |
| F2 | Appointments per doctor in November 2026 | Sara Khan **2**, Bilal Ahmed **1**, Hina Malik **1**, Usman Tariq **1** | |
| F3 | Medicines prescribed to patient Ali Raza (PatientId 2) | 2 rows: **Amlodipine 5mg** (60 days), **Aspirin 75mg** (30 days) | |
| F4 | Patients with unpaid bills and total owed (uses the view) | **Ali Raza 3000**, **Fatima Shah 1000** | |
| F5 | Most-prescribed medicine | **Aspirin 75mg**, prescribed **2** times | |
| F6 | Head of each department | Cardiology → **Sara Khan**, General Medicine → **Bilal Ahmed**, Pediatrics → **Hina Malik** | |

**F1**
```sql
SELECT d.FirstName || ' ' || d.LastName AS Doctor, d.Specialization
FROM Doctor d JOIN Department dep ON dep.DepartmentId = d.DepartmentId
WHERE dep.Name = 'Cardiology'
ORDER BY Doctor;
```

**F2**
```sql
SELECT d.FirstName || ' ' || d.LastName AS Doctor, COUNT(a.AppointmentId) AS Appointments
FROM Doctor d
LEFT JOIN Appointment a ON a.DoctorId = d.DoctorId
  AND a.AppointmentTime >= '2026-11-01' AND a.AppointmentTime < '2026-12-01'
GROUP BY d.DoctorId
ORDER BY Appointments DESC, Doctor;
```

**F3**
```sql
SELECT m.Name AS Medicine, pr.Dosage, pr.DurationDays
FROM Prescription pr
JOIN Appointment a ON a.AppointmentId = pr.AppointmentId
JOIN Medicine m ON m.MedicineId = pr.MedicineId
WHERE a.PatientId = 2
ORDER BY m.Name;
```

**F4**
```sql
SELECT Patient, SUM(Amount) AS TotalOwed
FROM UnpaidBills
GROUP BY PatientId
ORDER BY TotalOwed DESC;
```

**F5**
```sql
SELECT m.Name AS Medicine, COUNT(*) AS TimesPrescribed
FROM Prescription pr JOIN Medicine m ON m.MedicineId = pr.MedicineId
GROUP BY m.MedicineId
ORDER BY TimesPrescribed DESC, m.Name
LIMIT 1;
```

**F6**
```sql
SELECT dep.Name AS Department, d.FirstName || ' ' || d.LastName AS Head
FROM Department dep LEFT JOIN Doctor d ON d.DoctorId = dep.HeadDoctorId
ORDER BY dep.Name;
```

| ID | Objective | Steps | Expected result | Result |
|---|---|---|---|---|
| F7 | Indexes are used | Run **Validate & Optimize** on F3 and look at the query plan | The plan mentions **USING INDEX** (for example `idx_prescription_medicine` or a primary-key index), not only full scans | |

---

## G. Negative tests (must be refused or rejected)

| ID | Objective | Statement / steps | Expected result | Result |
|---|---|---|---|---|
| G1 | DROP is blocked | `DROP TABLE Bill;` | Error: **"ALTER, DROP and other schema or destructive statements are outside Version 2 scope…"**. `Bill` still exists | |
| G2 | ALTER is blocked | `ALTER TABLE Patient ADD COLUMN Email TEXT;` | Same refusal as G1. Patient has no new column | |
| G3 | Several statements at once | `CREATE TABLE A (id INTEGER PRIMARY KEY); CREATE TABLE B (id INTEGER PRIMARY KEY);` | Refused: **"This statement could not be classified as a supported read or write, so it is refused."** Neither table is created | |
| G4 | Trigger is blocked | `CREATE TRIGGER trg AFTER INSERT ON Bill BEGIN SELECT 1; END;` | Refused (the trigger body contains `;`, so it is treated like G3). No trigger is created | |
| G5 | Duplicate table | Run B5 (`CREATE TABLE Medicine …`) a second time | **Write failed: table Medicine already exists**. Nothing changes | |
| G6 | Standard user cannot CREATE | Sign out → sign in as a **standard** user → connect `empty.db` → run `CREATE TABLE t (id INTEGER PRIMARY KEY);` | Refused: **"Only an administrator can run write operations."** Audit log (as admin) shows a *denied* entry | |
| G7 | NOT NULL enforced | `INSERT INTO Patient (PatientId, FirstName, LastName, DateOfBirth, Gender) VALUES (9, 'No', 'Phone', '2000-01-01', 'Male');` | **Write failed: NOT NULL constraint failed: Patient.Phone** | |
| G8 | CHECK enforced | `UPDATE Appointment SET Status = 'Done' WHERE AppointmentId = 5;` | **Write failed: CHECK constraint failed: Status IN ('Scheduled', 'Completed', 'Cancelled')** | |
| G9 | UNIQUE enforced (1:1 bill) | `INSERT INTO Bill (BillId, AppointmentId, Amount) VALUES (9, 1, 100);` | **Write failed: UNIQUE constraint failed: Bill.AppointmentId** | |
| G10 | Composite PK enforced | `INSERT INTO Prescription (AppointmentId, MedicineId, Dosage, DurationDays) VALUES (1, 1, 'again', 3);` | **Write failed: UNIQUE constraint failed: Prescription.AppointmentId, Prescription.MedicineId** | |
| G11 | Failed write leaves data unchanged | After G7–G10 run `SELECT COUNT(*) FROM Patient;` and `SELECT COUNT(*) FROM Bill;` | Still **4** and **4** | |

---

## H. Known limitation: foreign keys are not enforced

SQLite only enforces `REFERENCES` constraints when `PRAGMA foreign_keys = ON`
is set on the connection, and SQL Sensi's SQLite adapter does not set it.
Relationships are therefore **stored and shown** (section D) but **not
enforced** when rows are inserted.

| ID | Objective | Statement | Current behaviour (expected in this build) | Result |
|---|---|---|---|---|
| H1 | Invalid foreign key | `INSERT INTO Doctor (DoctorId, FirstName, LastName, Specialization, Email, HireDate, DepartmentId) VALUES (9, 'Test', 'Orphan', 'None', 'orphan@cityclinic.test', '2026-01-01', 99);` | **Accepted** (1 row affected), although department 99 does not exist. Record this as a known issue, not a test failure | |

---

## Results summary

| Section | Cases | Passed | Failed | Notes |
|---|---|---|---|---|
| A. Policy and permissions | 5 | | | |
| B. Create tables | 7 | | | |
| C. Indexes and view | 5 | | | |
| D. Schema shown | 6 | | | |
| E. Sample data | 8 | | | |
| F. Queries | 7 | | | |
| G. Negative tests | 11 | | | |
| H. Known limitation | 1 | | | |
| **Total** | **50** | | | |

Tested by: ____________________  Date: ______________  Build / commit: ______________
