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
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.REQUEST_INSTALL_PACKAGES'
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

const widgetProviderBlock = `        <receiver
            android:name="com.jtecmusic.app.widget.JtecMusicWidgetProvider"
            android:exported="true"
            android:label="@string/app_name">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/jtec_music_widget_info" />
        </receiver>\n`;

const actionReceiverBlock = `        <receiver
            android:name="com.jtecmusic.app.widget.JtecWidgetActionReceiver"
            android:exported="false" />\n`;

if (!content.includes('com.jtecmusic.app.widget.JtecMusicWidgetProvider')) {
  content = content.replace('</application>', `${widgetProviderBlock}</application>`);
  modified = true;
  console.log('[ensure-manifest] Added JtecMusicWidgetProvider receiver');
}

if (!content.includes('com.jtecmusic.app.widget.JtecWidgetActionReceiver')) {
  content = content.replace('</application>', `${actionReceiverBlock}</application>`);
  modified = true;
  console.log('[ensure-manifest] Added JtecWidgetActionReceiver receiver');
}

if (modified) {
  fs.writeFileSync(manifestPath, content, 'utf-8');
  console.log('[ensure-manifest] Manifest updated successfully.');
} else {
  console.log('[ensure-manifest] AndroidManifest.xml already has all required entries.');
}
