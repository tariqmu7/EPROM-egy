const fs = require('fs');

function fixEvidence() {
    const filePath = './pages/EvidencePortal.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/setTimeout\(\(\) => \{/g, 'setTimeout(async () => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed EvidencePortal.tsx');
}

fixEvidence();
