const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walk(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace playful colors with corporate colors where appropriate
  content = content.replace(/hover:text-emerald-700 hover:bg-emerald-50/g, 'hover:text-slate-900 hover:bg-slate-200');
  
  // Let's replace some common decorative colors
  content = content.replace(/\bbg-blue-500\b/g, 'bg-slate-800');
  content = content.replace(/\bbg-blue-400\b/g, 'bg-slate-700');
  content = content.replace(/\btext-blue-400\b/g, 'text-slate-400');
  
  // Replace rounded-full with rounded-none except for avatars and icons
  // Actually, rounded-none is already applied to many things by the previous script.
  
  // Let's make sure buttons are sharp
  content = content.replace(/\brounded-md\b/g, 'rounded-sm');
  content = content.replace(/\brounded\b/g, 'rounded-none');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

walk('./pages', processFile);
walk('./components', processFile);
processFile('./App.tsx');

console.log("Color refactoring complete.");
