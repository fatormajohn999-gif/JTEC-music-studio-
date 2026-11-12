package com.jtecmusic.app.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Arrays;
import java.util.Comparator;

public class JtecWidgetState {
    private static final String PREFS_NAME = "jtec_widget_state";
    private static final String KEY_TRACK_ID = "track_id";
    private static final String KEY_TITLE = "title";
    private static final String KEY_ARTIST = "artist";
    private static final String KEY_ALBUM = "album";
    private static final String KEY_PLAYING = "playing";
    private static final String KEY_POSITION_MS = "position_ms";
    private static final String KEY_DURATION_MS = "duration_ms";
    private static final String KEY_RATE = "rate";
    private static final String KEY_ACCENT_COLOR = "accent_color";
    private static final String KEY_IS_FAVORITE = "is_favorite";
    private static final String KEY_HAS_PREV = "has_prev";
    private static final String KEY_HAS_NEXT = "has_next";
    private static final String KEY_UPDATED_AT_MS = "updated_at_ms";
    private static final String KEY_ARTWORK_PATH = "artwork_path";
    private static final String KEY_PENDING_ACTION = "pending_action";

    private static final String ARTWORK_DIR = "widget_art";
    private static final int MAX_CACHED_ARTWORK_FILES = 2;

    public String trackId = "";
    public String title = "";
    public String artist = "";
    public String album = "";
    public boolean playing = false;
    public long positionMs = 0L;
    public long durationMs = 0L;
    public float rate = 1.0f;
    public String accentColor = "#22D3EE";
    public boolean isFavorite = false;
    public boolean hasPrev = true;
    public boolean hasNext = true;
    public long updatedAtMs = 0L;
    public String artworkPath = "";

    public boolean hasTrack() {
        return !TextUtils.isEmpty(trackId) && !TextUtils.isEmpty(title);
    }

    public long computeCurrentPositionMs() {
        if (!playing || updatedAtMs <= 0L) {
            return Math.max(0L, positionMs);
        }
        long elapsedMs = Math.max(0L, System.currentTimeMillis() - updatedAtMs);
        float safeRate = (rate >= 0.25f && rate <= 3.0f) ? rate : 1.0f;
        long computed = Math.max(0L, positionMs) + (long) (elapsedMs * safeRate);
        if (durationMs > 0L) {
            return Math.min(durationMs, computed);
        }
        return computed;
    }

    public static JtecWidgetState load(Context context) {
        JtecWidgetState state = new JtecWidgetState();
        if (context == null) {
            return state;
        }
        try {
            SharedPreferences prefs = context.getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            state.trackId = prefs.getString(KEY_TRACK_ID, "");
            state.title = prefs.getString(KEY_TITLE, "");
            state.artist = prefs.getString(KEY_ARTIST, "");
            state.album = prefs.getString(KEY_ALBUM, "");
            state.playing = prefs.getBoolean(KEY_PLAYING, false);
            state.positionMs = prefs.getLong(KEY_POSITION_MS, 0L);
            state.durationMs = prefs.getLong(KEY_DURATION_MS, 0L);
            state.rate = prefs.getFloat(KEY_RATE, 1.0f);
            state.accentColor = prefs.getString(KEY_ACCENT_COLOR, "#22D3EE");
            state.isFavorite = prefs.getBoolean(KEY_IS_FAVORITE, false);
            state.hasPrev = prefs.getBoolean(KEY_HAS_PREV, true);
            state.hasNext = prefs.getBoolean(KEY_HAS_NEXT, true);
            state.updatedAtMs = prefs.getLong(KEY_UPDATED_AT_MS, 0L);
            state.artworkPath = prefs.getString(KEY_ARTWORK_PATH, "");
        } catch (Throwable ignored) {
        }
        return state;
    }

    public void save(Context context) {
        if (context == null) {
            return;
        }
        try {
            SharedPreferences prefs = context.getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putString(KEY_TRACK_ID, trackId != null ? trackId : "")
                    .putString(KEY_TITLE, title != null ? title : "")
                    .putString(KEY_ARTIST, artist != null ? artist : "")
                    .putString(KEY_ALBUM, album != null ? album : "")
                    .putBoolean(KEY_PLAYING, playing)
                    .putLong(KEY_POSITION_MS, Math.max(0L, positionMs))
                    .putLong(KEY_DURATION_MS, Math.max(0L, durationMs))
                    .putFloat(KEY_RATE, (rate >= 0.25f && rate <= 3.0f) ? rate : 1.0f)
                    .putString(KEY_ACCENT_COLOR, !TextUtils.isEmpty(accentColor) ? accentColor : "#22D3EE")
                    .putBoolean(KEY_IS_FAVORITE, isFavorite)
                    .putBoolean(KEY_HAS_PREV, hasPrev)
                    .putBoolean(KEY_HAS_NEXT, hasNext)
                    .putLong(KEY_UPDATED_AT_MS, updatedAtMs > 0L ? updatedAtMs : System.currentTimeMillis())
                    .putString(KEY_ARTWORK_PATH, artworkPath != null ? artworkPath : "")
                    .commit();
        } catch (Throwable ignored) {
        }
    }

    public static void clear(Context context) {
        if (context == null) {
            return;
        }
        try {
            SharedPreferences prefs = context.getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .remove(KEY_TRACK_ID)
                    .remove(KEY_TITLE)
                    .remove(KEY_ARTIST)
                    .remove(KEY_ALBUM)
                    .putBoolean(KEY_PLAYING, false)
                    .putLong(KEY_POSITION_MS, 0L)
                    .putLong(KEY_DURATION_MS, 0L)
                    .putFloat(KEY_RATE, 1.0f)
                    .putString(KEY_ACCENT_COLOR, "#22D3EE")
                    .putBoolean(KEY_IS_FAVORITE, false)
                    .putBoolean(KEY_HAS_PREV, false)
                    .putBoolean(KEY_HAS_NEXT, false)
                    .remove(KEY_UPDATED_AT_MS)
                    .remove(KEY_ARTWORK_PATH)
                    .commit();
            clearArtworkCache(context);
        } catch (Throwable ignored) {
        }
    }

    public static void savePendingAction(Context context, String action) {
        if (context == null || TextUtils.isEmpty(action)) {
            return;
        }
        try {
            SharedPreferences prefs = context.getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_PENDING_ACTION, action).commit();
        } catch (Throwable ignored) {
        }
    }

    public static String consumePendingAction(Context context) {
        if (context == null) {
            return null;
        }
        try {
            SharedPreferences prefs = context.getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String action = prefs.getString(KEY_PENDING_ACTION, null);
            if (!TextUtils.isEmpty(action)) {
                prefs.edit().remove(KEY_PENDING_ACTION).commit();
                return action;
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    public static String saveArtworkBytes(Context context, String trackId, byte[] jpegBytes) {
        if (context == null || jpegBytes == null || jpegBytes.length == 0) {
            return null;
        }
        try {
            File dir = new File(context.getApplicationContext().getCacheDir(), ARTWORK_DIR);
            if (!dir.exists() && !dir.mkdirs()) {
                return null;
            }
            String safeId = !TextUtils.isEmpty(trackId)
                    ? String.valueOf(Math.abs(trackId.hashCode()))
                    : "track";
            File outFile = new File(dir, "art_" + safeId + "_" + System.currentTimeMillis() + ".jpg");
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(jpegBytes);
                fos.flush();
            }
            pruneOldArtworkFiles(dir);
            return outFile.getAbsolutePath();
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static void pruneOldArtworkFiles(File dir) {
        try {
            File[] files = dir.listFiles();
            if (files == null || files.length <= MAX_CACHED_ARTWORK_FILES) {
                return;
            }
            Arrays.sort(files, new Comparator<File>() {
                @Override
                public int compare(File a, File b) {
                    return Long.compare(b.lastModified(), a.lastModified());
                }
            });
            for (int i = MAX_CACHED_ARTWORK_FILES; i < files.length; i++) {
                try {
                    //noinspection ResultOfMethodCallIgnored
                    files[i].delete();
                } catch (Throwable ignored) {
                }
            }
        } catch (Throwable ignored) {
        }
    }

    public static void clearArtworkCache(Context context) {
        if (context == null) {
            return;
        }
        try {
            File dir = new File(context.getApplicationContext().getCacheDir(), ARTWORK_DIR);
            if (dir.exists() && dir.isDirectory()) {
                File[] files = dir.listFiles();
                if (files != null) {
                    for (File file : files) {
                        try {
                            //noinspection ResultOfMethodCallIgnored
                            file.delete();
                        } catch (Throwable ignored) {
                        }
                    }
                }
            }
        } catch (Throwable ignored) {
        }
    }
}
