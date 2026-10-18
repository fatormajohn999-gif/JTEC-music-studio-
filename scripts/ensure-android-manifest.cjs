const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.log('[ensure-manifest] android manifest not found at', manifestPath);
  process.exit(0);
}

let content = fs.readFileSync(manifestPath, 'utf-8');

const requiredPermissions = [
  'android.permission.INTERNET',
  'android.permission.WAKE_LOCK',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'
];

let modified = false;

requiredPermissions.forEach((perm) => {
  if (!content.includes(perm)) {
    const permTag = `    <uses-permission android:name="${perm}" />\n`;
    content = content.replace('</manifest>', `${permTag}</manifest>`);
    modified = true;
    console.log(`[ensure-manifest] Added missing permission: ${perm}`);
  }
});

if (modified) {
  fs.writeFileSync(manifestPath, content, 'utf-8');
  console.log('[ensure-manifest] Manifest updated successfully.');
} else {
  console.log('[ensure-manifest] AndroidManifest.xml already has all required entries.');
}
