const fs = require('fs');
const content = fs.readFileSync('pages/AdminPanel.tsx', 'utf8');
const lines = content.split('\n');

let braceCount = 0;
let parenCount = 0;

for (let i = 0; i < 200; i++) {
    const line = lines[i];
    if (!line) continue;
    for (let char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '(') parenCount++;
        if (char === ')') parenCount--;
    }
    console.log(`${i + 1}: brace=${braceCount}, paren=${parenCount} | ${line.trim().substring(0, 40)}`);
}
