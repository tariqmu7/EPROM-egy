const fs = require('fs');

function fixAdmin() {
    const filePath = './pages/AdminPanel.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/const handleApprove = useCallback\(\(user: User\) => {/g, 'const handleApprove = useCallback(async (user: User) => {');
    content = content.replace(/const handleReject = useCallback\(\(user: User\) => {/g, 'const handleReject = useCallback(async (user: User) => {');
    content = content.replace(/const handleDelete = useCallback\(\(id: string, type: 'USER' \| 'JOB' \| 'SKILL' \| 'DEPT'\) => {/g, 'const handleDelete = useCallback(async (id: string, type: \'USER\' | \'JOB\' | \'SKILL\' | \'DEPT\') => {');
    content = content.replace(/const handleSave = useCallback\(\(item: any\) => {/g, 'const handleSave = useCallback(async (item: any) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed AdminPanel.tsx');
}

fixAdmin();
