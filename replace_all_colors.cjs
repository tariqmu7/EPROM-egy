const fs = require('fs');
const path = require('path');

function walkSync(currentDirPath, callback) {
    if (!fs.existsSync(currentDirPath)) return;
    fs.readdirSync(currentDirPath).forEach(function (name) {
        var filePath = path.join(currentDirPath, name);
        var stat = fs.statSync(filePath);
        if (stat.isFile() && (filePath.endsWith('.tsx') || filePath.endsWith('.ts'))) {
            callback(filePath, stat);
        } else if (stat.isDirectory() && name !== 'node_modules' && name !== '.git') {
            walkSync(filePath, callback);
        }
    });
}

const colorMap = {
    'emerald': 'slate',
    'cyan': 'slate',
    'amber': 'slate',
    'rose': 'slate',
    'indigo': 'slate',
    'violet': 'slate',
    'fuchsia': 'slate',
    'pink': 'slate',
    'teal': 'slate',
    'lime': 'slate',
    'orange': 'slate',
    'purple': 'slate',
    'green': 'slate',
    'blue': 'slate',
    'red': 'slate',
    'yellow': 'slate'
};

const dirs = ['./pages', './components', './services', './App.tsx', './index.tsx'];

dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        if (fs.statSync(dir).isFile()) {
            processFile(dir);
        } else {
            walkSync(dir, processFile);
        }
    }
});

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Replace all color classes like text-emerald-500, bg-cyan-100, border-rose-200
    for (const [oldColor, newColor] of Object.entries(colorMap)) {
        const regex = new RegExp(`\\b([a-z]+-)?${oldColor}-(\\d{2,3}(?:\\/\\d{2})?)\\b`, 'g');
        content = content.replace(regex, (match, prefix, weight) => {
            return `${prefix || ''}${newColor}-${weight}`;
        });
    }

    // Fix any double slates like slate-slate-500
    content = content.replace(/slate-slate-/g, 'slate-');
    
    // Also replace shadow classes
    content = content.replace(/\bshadow-(sm|md|lg|xl|2xl|panel|float|inner|none)\b/g, '');
    content = content.replace(/\bshadow\b/g, '');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}
