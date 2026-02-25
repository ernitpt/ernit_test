/**
 * fix-fonts-for-vercel.mjs
 *
 * Vercel ignores any path containing "node_modules", even inside dist/assets/.
 * This script copies font files from dist/assets/node_modules/... to
 * dist/assets/_fonts/... so Vercel actually uploads them.
 *
 * Run AFTER `npx expo export` and BEFORE `vercel --prod dist`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const sourceBase = path.join(distDir, 'assets', 'node_modules');
const targetBase = path.join(distDir, 'assets', '_fonts');

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return 0;

    let count = 0;
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            count += copyRecursive(srcPath, destPath);
        } else {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.copyFileSync(srcPath, destPath);
            count++;
        }
    }
    return count;
}

console.log('🔧 Fixing font paths for Vercel deployment...');
console.log(`   Source: ${sourceBase}`);
console.log(`   Target: ${targetBase}\n`);

if (!fs.existsSync(sourceBase)) {
    console.error('❌ Source directory not found! Did you run `npx expo export` first?');
    process.exit(1);
}

const copied = copyRecursive(sourceBase, targetBase);
console.log(`\n✅ Copied ${copied} files to assets/_fonts/`);

// Also copy vercel.json into dist/
const vercelSrc = path.join(projectRoot, 'vercel.json');
const vercelDest = path.join(distDir, 'vercel.json');
if (fs.existsSync(vercelSrc)) {
    fs.copyFileSync(vercelSrc, vercelDest);
    console.log('✅ Copied vercel.json into dist/');
}

console.log('\n✨ Ready to deploy with: vercel --prod dist');
