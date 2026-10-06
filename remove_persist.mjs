import fs from 'fs';
import path from 'path';

const storeDir = path.join(process.cwd(), 'src', 'store');
const files = fs.readdirSync(storeDir).filter(f => f.endsWith('.ts'));

files.forEach(file => {
  const filePath = path.join(storeDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Skip useAuthStore because we just customized it with partialize
  if (file === 'useAuthStore.ts') return;
  // Skip useHoldStore because it's for draft POS transactions (needs to be local)
  // Actually, wait, the user said "hapus yang berhubungan dengan local storage".
  // But holding a cart locally is common. Let's see if we should migrate it too?
  // Let's just remove persist from all except useAuthStore.

  let modified = false;

  if (content.includes('persist(')) {
    // 1. Remove import { persist } from 'zustand/middleware';
    content = content.replace(/import\s*\{\s*persist\s*\}\s*from\s*['"]zustand\/middleware['"];?\r?\n?/g, '');
    
    // 2. Remove persist( wrapper
    content = content.replace(/persist\(\s*\r?\n?\s*/g, '');

    // 3. Remove the end of persist block
    // This is trickier because it's usually `}), { name: '...' } )`
    // We can use a regex that matches `\},\s*\{\s*name:\s*['"][a-zA-Z0-9_-]+['"](\s*,\s*partialize:.*?)?\s*\}\s*\)/g
    content = content.replace(/\},\s*\{\s*name:\s*['"][a-zA-Z0-9_-]+['"](?:.|\r|\n)*?\}\s*\)/g, '}');

    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Removed persist from ${file}`);
  }
});
