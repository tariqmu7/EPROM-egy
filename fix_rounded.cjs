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
  
  content = content.replace(/rounded-none-none/g, 'rounded-none');
  content = content.replace(/rounded-none-sm/g, 'rounded-sm');
  content = content.replace(/rounded-none-md/g, 'rounded-sm');
  content = content.replace(/rounded-none-lg/g, 'rounded-sm');
  content = content.replace(/rounded-none-xl/g, 'rounded-none');
  content = content.replace(/rounded-none-2xl/g, 'rounded-none');
  content = content.replace(/rounded-none-3xl/g, 'rounded-none');
  content = content.replace(/rounded-none-full/g, 'rounded-none'); // Make everything sharp
  content = content.replace(/rounded-none-t/g, 'rounded-t-none');
  content = content.replace(/rounded-none-b/g, 'rounded-b-none');
  content = content.replace(/rounded-none-l/g, 'rounded-l-none');
  content = content.replace(/rounded-none-r/g, 'rounded-r-none');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

walk('./pages', processFile);
walk('./components', processFile);
processFile('./App.tsx');

console.log("Fix rounded complete.");
