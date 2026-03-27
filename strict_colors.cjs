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
  
  // Replace playful colors with strict corporate palette
  
  // Cyan -> Slate
  content = content.replace(/\bbg-cyan-50\b/g, 'bg-slate-100');
  content = content.replace(/\btext-cyan-600\b/g, 'text-slate-700');
  content = content.replace(/\btext-cyan-700\b/g, 'text-slate-800');
  content = content.replace(/\bbg-cyan-500\/20\b/g, 'bg-slate-500/20');
  
  // Emerald -> Slate/Green (keep green for success but more muted, or just use slate)
  // Let's use stark white and slate for almost everything, with minimal green/red for strict status
  content = content.replace(/\bbg-emerald-50\b/g, 'bg-slate-50 border border-slate-200');
  content = content.replace(/\btext-emerald-700\b/g, 'text-slate-800');
  content = content.replace(/\btext-emerald-600\b/g, 'text-slate-700');
  content = content.replace(/\bbg-emerald-600\b/g, 'bg-slate-800');
  content = content.replace(/\bbg-emerald-100\b/g, 'bg-slate-200');
  content = content.replace(/\bborder-emerald-200\b/g, 'border-slate-300');
  content = content.replace(/\btext-emerald-800\b/g, 'text-slate-900');
  
  // Orange/Amber -> Slate
  content = content.replace(/\bbg-orange-50\b/g, 'bg-slate-50 border border-slate-200');
  content = content.replace(/\btext-orange-600\b/g, 'text-slate-800');
  content = content.replace(/\btext-orange-500\b/g, 'text-slate-700');
  content = content.replace(/\bbg-orange-600\b/g, 'bg-slate-800');
  
  // Rose/Red -> Slate (except for destructive actions)
  content = content.replace(/\bbg-rose-50\b/g, 'bg-slate-50 border border-slate-200');
  content = content.replace(/\btext-rose-700\b/g, 'text-slate-800');
  content = content.replace(/\btext-rose-600\b/g, 'text-slate-700');
  content = content.replace(/\bbg-rose-100\b/g, 'bg-slate-200');
  
  // Purple -> Slate
  content = content.replace(/\bg-purple-600\b/g, 'bg-slate-800');
  content = content.replace(/\btext-purple-600\b/g, 'text-slate-800');
  
  // Make sure borders are stark
  content = content.replace(/\bborder-slate-200\b/g, 'border-slate-300');
  content = content.replace(/\bborder-slate-100\b/g, 'border-slate-300');
  
  // Replace divide-slate-100 with divide-slate-300 for classic divider lines
  content = content.replace(/\bdivide-slate-100\b/g, 'divide-slate-300');
  content = content.replace(/\bdivide-slate-200\b/g, 'divide-slate-300');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

walk('./pages', processFile);
walk('./components', processFile);
processFile('./App.tsx');
processFile('./components/Layout.tsx');

console.log("Strict corporate colors applied.");
