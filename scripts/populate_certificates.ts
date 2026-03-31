import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Read config
const configPath = './firebase-applet-config.json';
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const CERT_MAPPING: Record<string, string[]> = {
  'Safety': ['NEBOSH IGC', 'IOSH Managing Safely', 'OSHA 30-Hour Construction'],
  'HSE': ['NEBOSH IGC', 'IOSH Managing Safely', 'OSHA 30-Hour Construction'],
  'Operations': ['API 510 Pressure Vessel Inspector', 'CMRP (Maintenance & Reliability)', 'Six Sigma Green Belt'],
  'Maintenance': ['ASNT Level II NDT', 'CMRP (Maintenance & Reliability)', 'Vibration Analysis Cat II'],
  'Engineering': ['PMP (Project Management)', 'LEED Green Associate', 'Autodesk Certified Professional'],
  'Electrical': ['NFPA 70E Arc Flash Safety', 'Certified Energy Manager', 'PLC Programming Specialist'],
  'Mechanical': ['API 570 Piping Inspector', 'Certified Reliability Engineer', 'ASME Section IX Welding'],
  'HR': ['PHR (Professional in HR)', 'CIPD Level 5', 'Microsoft Office Specialist'],
  'Finance': ['ACCA Financial Accounting', 'CPA (Certified Public Accountant)', 'CFA Level 1'],
  'General': ['Time Management Mastery', 'Effective Communication', 'Leadership Fundamentals']
};

async function populate() {
  console.log('Fetching users and departments...');
  const usersSnap = await getDocs(collection(db, 'users'));
  const deptsSnap = await getDocs(collection(db, 'departments'));
  
  const depts = deptsSnap.docs.reduce((acc: any, d) => {
    acc[d.id] = d.data().name;
    return acc;
  }, {});

  let count = 0;
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const deptId = userData.departmentId;
    const deptName = depts[deptId] || 'General';
    
    // Find best match in mapping
    let matchedKey = 'General';
    for (const key in CERT_MAPPING) {
      if (deptName.toLowerCase().includes(key.toLowerCase())) {
        matchedKey = key;
        break;
      }
    }

    const certs = CERT_MAPPING[matchedKey];
    
    // Update user: certificates is stored as JSON string in this app's store.ts implementation
    // Line 162 in store.ts: certificates: data.certificates ? JSON.parse(data.certificates) : []
    // So we should store it as a JSON string.
    await updateDoc(doc(db, 'users', userDoc.id), {
      certificates: JSON.stringify(certs)
    });
    
    console.log(`Updated ${userData.name} (${deptName}) with certs: ${certs.join(', ')}`);
    count++;
  }

  console.log(`Done! Updated ${count} users.`);
  process.exit(0);
}

populate().catch(err => {
  console.error(err);
  process.exit(1);
});
