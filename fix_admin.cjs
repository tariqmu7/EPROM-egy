const fs = require('fs');

function updateAdminPanel() {
    const filePath = './pages/AdminPanel.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add async/await to dataService calls
    content = content.replace(/dataService\.updateUser\(\{ \.\.\.user, status: 'ACTIVE' \}\);/g, 'await dataService.updateUser({ ...user, status: \'ACTIVE\' });');
    content = content.replace(/dataService\.logActivity\('Approved User', user\.name\);/g, 'await dataService.logActivity(\'Approved User\', user.name);');
    content = content.replace(/dataService\.updateUser\(\{ \.\.\.user, status: 'REJECTED' \}\);/g, 'await dataService.updateUser({ ...user, status: \'REJECTED\' });');
    content = content.replace(/dataService\.logActivity\('Rejected User', user\.name\);/g, 'await dataService.logActivity(\'Rejected User\', user.name);');
    
    content = content.replace(/if \(type === 'USER'\) dataService\.removeUser\(id\);/g, 'if (type === \'USER\') await dataService.removeUser(id);');
    content = content.replace(/if \(type === 'JOB'\) dataService\.removeJobProfile\(id\);/g, 'if (type === \'JOB\') await dataService.removeJobProfile(id);');
    content = content.replace(/if \(type === 'SKILL'\) dataService\.removeSkill\(id\);/g, 'if (type === \'SKILL\') await dataService.removeSkill(id);');
    content = content.replace(/if \(type === 'DEPT'\) dataService\.removeDepartment\(id\);/g, 'if (type === \'DEPT\') await dataService.removeDepartment(id);');

    content = content.replace(/if \(exists\) dataService\.updateUser\(item\);/g, 'if (exists) await dataService.updateUser(item);');
    content = content.replace(/else dataService\.addUser\(item\);/g, 'else await dataService.addUser(item);');
    
    content = content.replace(/if \(formType === 'JOB'\) editItem \? dataService\.updateJobProfile\(item\) : dataService\.addJobProfile\(item\);/g, 'if (formType === \'JOB\') editItem ? await dataService.updateJobProfile(item) : await dataService.addJobProfile(item);');
    content = content.replace(/if \(formType === 'SKILL'\) editItem \? dataService\.updateSkill\(item\) : dataService\.addSkill\(item\);/g, 'if (formType === \'SKILL\') editItem ? await dataService.updateSkill(item) : await dataService.addSkill(item);');
    content = content.replace(/if \(formType === 'DEPT'\) editItem \? dataService\.updateDepartment\(item\) : dataService\.addDepartment\(item\);/g, 'if (formType === \'DEPT\') editItem ? await dataService.updateDepartment(item) : await dataService.addDepartment(item);');

    // Make functions async
    content = content.replace(/const handleApproveUser = \(user: User\) => {/g, 'const handleApproveUser = async (user: User) => {');
    content = content.replace(/const handleRejectUser = \(user: User\) => {/g, 'const handleRejectUser = async (user: User) => {');
    content = content.replace(/const handleDelete = \(id: string, type: 'USER' \| 'JOB' \| 'SKILL' \| 'DEPT'\) => {/g, 'const handleDelete = async (id: string, type: \'USER\' | \'JOB\' | \'SKILL\' | \'DEPT\') => {');
    content = content.replace(/const handleSave = \(item: any\) => {/g, 'const handleSave = async (item: any) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated AdminPanel.tsx');
}

updateAdminPanel();
