const fs = require('fs');

function fixNotif() {
    const filePath = './components/NotificationBell.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/const handleMarkAsRead = \(e: React\.MouseEvent, id: string\) => {/g, 'const handleMarkAsRead = async (e: React.MouseEvent, id: string) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed NotificationBell.tsx');
}

fixNotif();
