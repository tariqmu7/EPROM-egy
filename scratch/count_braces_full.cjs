const fs = require('fs');
const content = fs.readFileSync('pages/AdminPanel.tsx', 'utf8');
const lines = content.split('\n');

let braceCount = 0;
let parenCount = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '(') parenCount++;
        if (char === ')') parenCount--;
    }
}
console.log(`Final total: brace=${braceCount}, paren=${parenCount}`);
