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
  
  // Remove shadows
  content = content.replace(/\bshadow-(sm|md|lg|xl|2xl|panel|float|inner)\b/g, '');
  
  // Replace rounded corners
  content = content.replace(/\brounded-xl\b/g, 'rounded-none');
  content = content.replace(/\brounded-lg\b/g, 'rounded-sm');
  content = content.replace(/\brounded-2xl\b/g, 'rounded-none');
  content = content.replace(/\brounded-3xl\b/g, 'rounded-none');
  
  // Replace colors
  content = content.replace(/\bbg-blue-50\b/g, 'bg-slate-50');
  content = content.replace(/\btext-blue-700\b/g, 'text-slate-900');
  content = content.replace(/\bbg-blue-700\b/g, 'bg-slate-900');
  content = content.replace(/\bbg-blue-600\b/g, 'bg-slate-800');
  content = content.replace(/\bborder-blue-100\b/g, 'border-slate-200');
  content = content.replace(/\bborder-blue-200\b/g, 'border-slate-300');
  content = content.replace(/\bborder-blue-500\b/g, 'border-slate-900');
  content = content.replace(/\bfocus:ring-blue-500\b/g, 'focus:ring-slate-900');
  content = content.replace(/\btext-blue-600\b/g, 'text-slate-800');
  content = content.replace(/\btext-blue-500\b/g, 'text-slate-700');
  content = content.replace(/\bbg-blue-100\b/g, 'bg-slate-200');
  
  // Replace border-slate-200 with border-slate-300 for starker borders
  content = content.replace(/\bborder-slate-200\b/g, 'border-slate-300');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

walk('./pages', processFile);
walk('./components', processFile);
processFile('./App.tsx');

console.log("Refactoring complete.");
