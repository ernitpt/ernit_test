const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const assetsDir = path.join(distDir, 'assets');

// Font file mappings based on error messages and metadata
const fontMappings = [
    {
        hash: '5fc3fef1a1a55711c147d344132a468d',
        targetPath: 'assets/node_modules/@expo-google-fonts/outfit/400Regular/Outfit_400Regular.5fc3fef1a1a55711c147d344132a468d.ttf'
    },
    {
        hash: '3af2e072a31b85b3c0a55ede786b31ab',
        targetPath: 'assets/node_modules/@expo-google-fonts/outfit/500Medium/Outfit_500Medium.3af2e072a31b85b3c0a55ede786b31ab.ttf'
    },
    {
        hash: 'fff3440ed39188f5d5bf85305e8b6be8',
        targetPath: 'assets/node_modules/@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.fff3440ed39188f5d5bf85305e8b6be8.ttf'
    },
    {
        hash: '91486df4e5279497efb060b0d3cc797b',
        targetPath: 'assets/node_modules/@expo-google-fonts/outfit/700Bold/Outfit_700Bold.91486df4e5279497efb060b0d3cc797b.ttf'
    },
    {
        hash: 'b4eb097d35f44ed943676fd56f6bdc51',
        targetPath: 'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.b4eb097d35f44ed943676fd56f6bdc51.ttf'
    }
];

console.log('🔧 Fixing font paths for Vercel deployment...\n');

fontMappings.forEach(({ hash, targetPath }) => {
    const sourcePath = path.join(assetsDir, hash);
    const fullTargetPath = path.join(distDir, targetPath);

    if (!fs.existsSync(sourcePath)) {
        console.warn(`⚠️  Source file not found: ${hash}`);
        return;
    }

    // Create target directory
    const targetDir = path.dirname(fullTargetPath);
    fs.mkdirSync(targetDir, { recursive: true });

    // Copy file
    fs.copyFileSync(sourcePath, fullTargetPath);
    console.log(`✅ Copied ${hash.substring(0, 8)}... to ${targetPath}`);
});

console.log('\n✨ Font paths fixed! Ready to deploy.');
