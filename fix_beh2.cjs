const fs = require('fs');

function fixBehavioral() {
    const filePath = './pages/BehavioralAssessment.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/setTimeout\(\(\) => \{/g, 'setTimeout(async () => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed BehavioralAssessment.tsx');
}

fixBehavioral();
