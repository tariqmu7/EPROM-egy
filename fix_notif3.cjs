const fs = require('fs');

function fixNotif3() {
    const filePath = './components/NotificationBell.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/const handleMarkAllAsRead = \(e: React\.MouseEvent\) => {/g, 'const handleMarkAllAsRead = async (e: React.MouseEvent) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed NotificationBell.tsx');
}

fixNotif3();
