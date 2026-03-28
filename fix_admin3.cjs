const fs = require('fs');

function fixAdmin3() {
    const filePath = './pages/AdminPanel.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/const handleDelete = useCallback\(\(type: 'USER' \| 'JOB' \| 'SKILL' \| 'DEPT', id: string\) => {/g, 'const handleDelete = useCallback(async (type: \'USER\' | \'JOB\' | \'SKILL\' | \'DEPT\', id: string) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed AdminPanel.tsx');
}

fixAdmin3();
