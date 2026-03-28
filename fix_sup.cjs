const fs = require('fs');

function updateSupervisor() {
    const filePath = './pages/SupervisorApproval.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/dataService\.updateEvidenceStatus\(id, 'APPROVED', currentUser\.id, selectedLevel\);/g, 'await dataService.updateEvidenceStatus(id, \'APPROVED\', currentUser.id, selectedLevel);');
    content = content.replace(/dataService\.updateEvidenceStatus\(id, 'REJECTED', currentUser\.id\);/g, 'await dataService.updateEvidenceStatus(id, \'REJECTED\', currentUser.id);');
    
    content = content.replace(/const handleApprove = \(id: string\) => {/g, 'const handleApprove = async (id: string) => {');
    content = content.replace(/const handleReject = \(id: string\) => {/g, 'const handleReject = async (id: string) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated SupervisorApproval.tsx');
}

updateSupervisor();
