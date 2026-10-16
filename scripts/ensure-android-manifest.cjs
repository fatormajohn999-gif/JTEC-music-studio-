const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.log('[ensure-manifest] android manifest not found at', manifestPath);
  process.exit(0);
}

let content = fs.readFileSync(manifestPath, 'utf8');

const requiredPermissions = [
  'android.permission.INTERNET',
  'android.permission.WAKE_LOCK',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.POST_NOTIFICATIONS',
];

let changed = false;

for (const perm of requiredPermissions) {
  const permTag = `<uses-permission android:name="${perm}" />`;
  if (!content.includes(perm)) {
    content = content.replace('</manifest>', `    ${permTag}\n</manifest>`);
    changed = true;
    console.log(`[ensure-manifest] Added missing permission: ${perm}`);
  }
}

if (!content.includes('MediaSessionService')) {
  const serviceSnippet = `        <service
            android:name="io.github.jofr.capacitor.mediasessionplugin.MediaSessionService"
            android:enabled="true"
            android:exported="true"
            android:foregroundServiceType="mediaPlayback">
            <intent-filter>
                <action android:name="android.intent.action.MEDIA_BUTTON" />
            </intent-filter>
        </service>`;
  content = content.replace('</application>', `${serviceSnippet}\n    </application>`);
  changed = true;
  console.log('[ensure-manifest] Added MediaSessionService to AndroidManifest.xml');
}

if (changed) {
  fs.writeFileSync(manifestPath, content, 'utf8');
  console.log('[ensure-manifest] Updated AndroidManifest.xml successfully.');
} else {
  console.log('[ensure-manifest] AndroidManifest.xml already has all required entries.');
}
