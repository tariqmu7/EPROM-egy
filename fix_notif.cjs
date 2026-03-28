const fs = require('fs');

function updateNotificationBell() {
    const filePath = './components/NotificationBell.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Convert sync calls to async
    content = content.replace(/dataService\.markNotificationAsRead\(id\);/g, 'await dataService.markNotificationAsRead(id);');
    content = content.replace(/dataService\.markAllNotificationsAsRead\(user\.id\);/g, 'await dataService.markAllNotificationsAsRead(user.id);');
    content = content.replace(/dataService\.markNotificationAsRead\(notification\.id\);/g, 'await dataService.markNotificationAsRead(notification.id);');
    
    // Make functions async
    content = content.replace(/const handleMarkAsRead = \(id: string\) => {/g, 'const handleMarkAsRead = async (id: string) => {');
    content = content.replace(/const handleMarkAllAsRead = \(\) => {/g, 'const handleMarkAllAsRead = async () => {');
    content = content.replace(/const handleNotificationClick = \(notification: Notification\) => {/g, 'const handleNotificationClick = async (notification: Notification) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated NotificationBell.tsx');
}

updateNotificationBell();
