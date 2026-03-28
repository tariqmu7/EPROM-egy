const fs = require('fs');

function updateEvidencePortal() {
    const filePath = './pages/EvidencePortal.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/dataService\.addSkill\(newSkill\);/g, 'await dataService.addSkill(newSkill);');
    content = content.replace(/dataService\.addEvidence\(\{/g, 'await dataService.addEvidence({');
    content = content.replace(/const handleSubmit = \(e: React\.FormEvent\) => {/g, 'const handleSubmit = async (e: React.FormEvent) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated EvidencePortal.tsx');
}

updateEvidencePortal();
