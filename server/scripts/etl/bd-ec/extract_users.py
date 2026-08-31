# -*- coding: utf-8 -*-
"""BD / External-Contracts import, step 1 of 2 for the PEOPLE — EXTRACT.

    python scripts/etl/bd-ec/extract_users.py

Reads `Employees Info.xlsx` (sheet `Final`, Arabic names only) and writes
`scripts/etl/data/bd-ec/users.json`: one ECMS user document per employee, plus
the department->manager fixes that go with them.

The workbook carries no email, no org id and no Latin spelling, so the mapping
below (employee id -> Latin name, unit, org level, job profile, manager) is the
judgement part of this step and is kept HERE, in the open, rather than inside
the loader. The extract REFUSES if the workbook and the mapping disagree, so a
re-issued sheet cannot silently drop or add a person.

Placement rules used:
  * the unit is the org-chart node whose structural type matches the org level
    (GENERAL->GM, ASSISTANT_GENERAL->AGM, DEPARTMENT->DM, SECTION->SP/JP/FR);
  * `managerId` follows the org chart upward to the nearest person we have;
  * emails are firstname.lastname@eprom.com, transliterated from the Arabic.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'bd-ec', 'users.json')
SRC = os.environ.get(
    'EMPLOYEES_XLSX',
    r'C:\Users\tariq\Desktop\work\Work laptop\BD\BD and IC Job Profile'
    r'\1_Final_Deliverables\Employees Info.xlsx',
)

# employeeId -> everything the workbook cannot tell us.
PLACEMENT = {
    560: dict(
        name='Neveen Mohamed Amin Mohamed Anwar', email='neveen.anwar@eprom.com',
        departmentId='g-bizdev', generalDepartmentId='g-bizdev',
        orgLevel='GM', jobProfileId='jp-bd-gm', managerEmployeeId=None,
        manages=['g-bizdev'],
    ),
    1347: dict(
        name='Ali Ahmed Ali Ahmed', email='ali.ahmed@eprom.com',
        departmentId='d-bizdev-ext', generalDepartmentId='g-bizdev',
        orgLevel='AGM', jobProfileId='jp-ec-agm', managerEmployeeId=560,
        manages=['d-bizdev-ext'],
    ),
    1832: dict(
        name='Hisham Medhat Kamal Abaza', email='hisham.abaza@eprom.com',
        departmentId='d-supply-contr', generalDepartmentId='g-supply',
        orgLevel='AGM', jobProfileId='jp-ec-agm', managerEmployeeId=None,
        manages=['d-supply-contr'],
    ),
    1844: dict(
        name='Noha Medhat Bahgat', email='noha.bahgat@eprom.com',
        departmentId='dept-bizdev-mkt-programs', generalDepartmentId='g-bizdev',
        orgLevel='DM', jobProfileId='jp-bd-dm', managerEmployeeId=560,
        manages=['d-bizdev-mkt', 'dept-bizdev-mkt-programs'],
    ),
    2954: dict(
        name='Tarek Mohamed Salama Soliman', email='t.salama@eprom.com',
        departmentId='sect-bizdev-mkt-bd', generalDepartmentId='g-bizdev',
        orgLevel='SP', jobProfileId='jp-bd-sp', managerEmployeeId=1844,
        id='9bry6ro95', manages=[],
    ),
    3397: dict(
        name='Mohamed Ibrahim El-Demerdash', email='mohamed.eldemerdash@eprom.com',
        departmentId='sect-bizdev-ext-contracts', generalDepartmentId='g-bizdev',
        orgLevel='SP', jobProfileId='jp-ec-sp', managerEmployeeId=1347, manages=[],
    ),
    3448: dict(
        name='Randa Mohamed Tawfik Gadallah', email='randa.gadallah@eprom.com',
        departmentId='sect-bizdev-ext-contracts', generalDepartmentId='g-bizdev',
        orgLevel='JP', jobProfileId='jp-ec-jp', managerEmployeeId=1347, manages=[],
    ),
    3851: dict(
        name='Mennatallah Khaled Hussein Sayed Soliman',
        email='mennatallah.soliman@eprom.com',
        departmentId='sect-bizdev-ext-followup', generalDepartmentId='g-bizdev',
        orgLevel='FR', jobProfileId='jp-ec-fr-fu', managerEmployeeId=1347, manages=[],
    ),
    3852: dict(
        name='Abdelrahman Ali Ibrahim Mohamed Abdelrahim',
        email='abdelrahman.abdelrahim@eprom.com',
        departmentId='sect-bizdev-ext-followup', generalDepartmentId='g-bizdev',
        orgLevel='FR', jobProfileId='jp-ec-fr-fu', managerEmployeeId=1347, manages=[],
    ),
    3910: dict(
        name='Dina Mohamed Nour Eldin Maghazi', email='dina.maghazi@eprom.com',
        departmentId='sect-bizdev-ext-contracts', generalDepartmentId='g-bizdev',
        orgLevel='FR', jobProfileId='jp-ec-fr', managerEmployeeId=1347, manages=[],
    ),
}

# Department manager references left over from the Firebase export that point at
# dead UIDs. `chairman` has no counterpart in this workbook, so it is CLEARED
# rather than pointed at the wrong person (see load-users.mjs).
CLEAR_DEPARTMENT_MANAGERS = ['chairman']


def user_id(emp_id, override):
    return override or 'u-%d' % emp_id


def main():
    try:
        import openpyxl
    except ImportError:
        sys.exit('openpyxl is required: pip install openpyxl')

    ws = openpyxl.load_workbook(SRC)['Final']
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        arabic, emp, dept_en, title_ar = r[1], r[2], r[3], r[4]
        if emp is None:
            continue
        rows.append(dict(arabicName=str(arabic).strip(), employeeId=int(emp),
                         sourceDepartment=str(dept_en or '').strip(),
                         sourceTitle=str(title_ar or '').strip()))

    seen = {r['employeeId'] for r in rows}
    problems = []
    for emp in sorted(seen - set(PLACEMENT)):
        problems.append('employee %d is in the workbook but has no placement' % emp)
    for emp in sorted(set(PLACEMENT) - seen):
        problems.append('employee %d is placed but is no longer in the workbook' % emp)
    emails = {}
    for emp, p in PLACEMENT.items():
        if not re.match(r'^[a-z][a-z.\-]*@eprom\.com$', p['email']):
            problems.append('employee %d: bad email %s' % (emp, p['email']))
        emails.setdefault(p['email'], []).append(emp)
    for email, owners in emails.items():
        if len(owners) > 1:
            problems.append('email %s claimed by %s' % (email, owners))
    if problems:
        print('REFUSING: %d problem(s):' % len(problems), file=sys.stderr)
        for m in problems:
            print('  -', m, file=sys.stderr)
        sys.exit(1)

    users, dept_managers = [], {}
    for row in sorted(rows, key=lambda r: r['employeeId']):
        emp = row['employeeId']
        p = PLACEMENT[emp]
        uid = user_id(emp, p.get('id'))
        doc = {
            'id': uid,
            'name': p['name'],
            'email': p['email'],
            'role': 'EMPLOYEE',
            'status': 'ACTIVE',
            'employeeId': emp,
            'departmentId': p['departmentId'],
            'generalDepartmentId': p['generalDepartmentId'],
            'orgLevel': p['orgLevel'],
            'jobProfileId': p['jobProfileId'],
            'location': 'Alexandria',
            'projectName': 'HQ',
            # Kept for traceability back to the HR sheet — the app ignores them.
            'arabicName': row['arabicName'],
            'sourceTitle': row['sourceTitle'],
        }
        if p['managerEmployeeId'] is not None:
            m = PLACEMENT[p['managerEmployeeId']]
            doc['managerId'] = user_id(p['managerEmployeeId'], m.get('id'))
        users.append(doc)
        for dept in p['manages']:
            dept_managers[dept] = uid

    payload = {
        'users': users,
        'departmentManagers': dept_managers,
        'clearDepartmentManagers': CLEAR_DEPARTMENT_MANAGERS,
    }
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print('wrote %d users -> %s' % (len(users), os.path.normpath(OUT)))
    print('department managers: %s'
          % ', '.join('%s=%s' % kv for kv in sorted(dept_managers.items())))
    print('cleared: %s' % ', '.join(CLEAR_DEPARTMENT_MANAGERS))


if __name__ == '__main__':
    main()
