const fs = require('fs');

function updateBehavioral() {
    const filePath = './pages/BehavioralAssessment.tsx';
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    content = content.replace(/dataService\.addAssessment\(\{/g, 'await dataService.addAssessment({');
    content = content.replace(/const handleSubmit = \(e: React\.FormEvent\) => {/g, 'const handleSubmit = async (e: React.FormEvent) => {');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated BehavioralAssessment.tsx');
}

updateBehavioral();
