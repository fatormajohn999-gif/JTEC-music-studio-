package com.jtecmusic.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.TextUtils;
import android.util.LruCache;
import android.widget.RemoteViews;

import com.jtecmusic.app.MainActivity;
import com.jtecmusic.app.R;

import java.io.File;
import java.util.Locale;

public class JtecWidgetRenderer {
    private static final int LAYOUT_COMPACT = 0;
    private static final int LAYOUT_STANDARD = 1;
    private static final int LAYOUT_LARGE = 2;

    // Keep cached bitmaps bounded in memory (3 MB) and small per-bitmap so RemoteViews IPC stays well below Binder limits
    private static final LruCache<String, Bitmap> BITMAP_CACHE = new LruCache<String, Bitmap>(3 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap value) {
            return value != null ? value.getByteCount() : 0;
        }
    };

    public static boolean hasAnyWidgets(Context context) {
        if (context == null) {
            return false;
        }
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            if (manager == null) {
                return false;
            }
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, JtecMusicWidgetProvider.class));
            return ids != null && ids.length > 0;
        } catch (Throwable ignored) {
            return false;
        }
    }

    public static void renderAllWidgets(Context context) {
        if (context == null) {
            return;
        }
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            if (manager == null) {
                return;
            }
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, JtecMusicWidgetProvider.class));
            if (ids == null || ids.length == 0) {
                return;
            }
            renderWidgets(context, manager, ids);
        } catch (Throwable ignored) {
        }
    }

    public static void renderWidgets(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        if (context == null || manager == null || appWidgetIds == null || appWidgetIds.length == 0) {
            return;
        }
        try {
            JtecWidgetState state = JtecWidgetState.load(context);
            for (int widgetId : appWidgetIds) {
                try {
                    RemoteViews views = buildRemoteViews(context, manager, widgetId, state);
                    if (views != null) {
                        manager.updateAppWidget(widgetId, views);
                    }
                } catch (Throwable ignored) {
                }
            }
        } catch (Throwable ignored) {
        }
    }

    public static void updateProgressOnly(Context context) {
        if (context == null) {
            return;
        }
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            if (manager == null) {
                return;
            }
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, JtecMusicWidgetProvider.class));
            if (ids == null || ids.length == 0) {
                return;
            }
            JtecWidgetState state = JtecWidgetState.load(context);
            boolean effectivePlaying = state.playing && (JtecWidgetPlugin.isBridgeAlive() || JtecWidgetTimer.isRunning());
            if (!effectivePlaying || !state.hasTrack()) {
                return;
            }

            long posMs = state.computeCurrentPositionMs();
            float fraction = state.durationMs > 0L
                    ? Math.max(0f, Math.min(1f, (float) posMs / (float) state.durationMs))
                    : 0f;
            int accentInt = parseColorSafe(state.accentColor, 0xFF22D3EE);
            Bitmap progressBmp = buildProgressBitmap(320, 12, fraction, accentInt);

            for (int widgetId : ids) {
                try {
                    Bundle options = manager.getAppWidgetOptions(widgetId);
                    int layoutType = resolveLayoutType(options);
                    if (layoutType == LAYOUT_COMPACT) {
                        continue;
                    }
                    RemoteViews partial = new RemoteViews(context.getPackageName(), getLayoutRes(layoutType));
                    if (progressBmp != null) {
                        partial.setImageViewBitmap(R.id.widget_progress_bar, progressBmp);
                    }
                    manager.partiallyUpdateAppWidget(widgetId, partial);
                } catch (Throwable ignored) {
                }
            }
        } catch (Throwable ignored) {
        }
    }

    private static RemoteViews buildRemoteViews(
            Context context,
            AppWidgetManager manager,
            int widgetId,
            JtecWidgetState state
    ) {
        Bundle options = null;
        try {
            options = manager.getAppWidgetOptions(widgetId);
        } catch (Throwable ignored) {
        }

        int layoutType = resolveLayoutType(options);
        int layoutRes = getLayoutRes(layoutType);
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutRes);

        // Stale state protection: if app process restarted so bridge and timer are dead, draw paused
        boolean bridgeAlive = JtecWidgetPlugin.isBridgeAlive();
        boolean timerAlive = JtecWidgetTimer.isRunning();
        boolean effectivePlaying = state.playing && (bridgeAlive || timerAlive);

        boolean hasTrack = state.hasTrack();
        int accentInt = parseColorSafe(state.accentColor, 0xFF22D3EE);

        // Determine widget dimensions in dp for aspect-aware background rendering
        int minWidthDp = (options != null && options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) > 0)
                ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
                : 280;
        int minHeightDp = (options != null && options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT) > 0)
                ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
                : (layoutType == LAYOUT_COMPACT ? 72 : layoutType == LAYOUT_LARGE ? 210 : 120);

        boolean hasValidArtwork = hasTrack && !TextUtils.isEmpty(state.artworkPath) && new File(state.artworkPath).exists();

        // 1. Background & Cover
        if (hasValidArtwork) {
            Bitmap rawArt = decodeSampledArtwork(state.artworkPath, 256);
            if (rawArt != null) {
                Bitmap bgBmp = getOrCreateBlurredBackground(
                        state.trackId,
                        state.artworkPath,
                        minWidthDp,
                        minHeightDp,
                        accentInt,
                        rawArt
                );
                if (bgBmp != null) {
                    views.setImageViewBitmap(R.id.widget_bg, bgBmp);
                } else {
                    views.setImageViewResource(R.id.widget_bg, R.drawable.widget_bg_default);
                }

                int coverTargetPx = layoutType == LAYOUT_COMPACT ? 112 : layoutType == LAYOUT_LARGE ? 192 : 144;
                Bitmap coverBmp = getOrCreateRoundedCover(state.trackId, state.artworkPath, coverTargetPx, rawArt);
                if (coverBmp != null) {
                    views.setImageViewBitmap(R.id.widget_cover, coverBmp);
                } else {
                    views.setImageViewResource(R.id.widget_cover, R.mipmap.ic_launcher_foreground);
                }
            } else {
                hasValidArtwork = false;
            }
        }

        if (!hasValidArtwork) {
            if (hasTrack) {
                Bitmap defaultBgBmp = getOrCreateDefaultGradientBackground(minWidthDp, minHeightDp, accentInt);
                if (defaultBgBmp != null) {
                    views.setImageViewBitmap(R.id.widget_bg, defaultBgBmp);
                } else {
                    views.setImageViewResource(R.id.widget_bg, R.drawable.widget_bg_default);
                }
            } else {
                views.setImageViewResource(R.id.widget_bg, R.drawable.widget_bg_default);
            }
            views.setImageViewResource(R.id.widget_cover, R.mipmap.ic_launcher_foreground);
        }

        // 2. Title & Artist
        if (!hasTrack) {
            views.setTextViewText(R.id.widget_title, "JTEC MUSIC");
            views.setTextViewText(R.id.widget_artist, "Tap to play");
        } else {
            views.setTextViewText(R.id.widget_title, state.title);
            if (!effectivePlaying && !bridgeAlive) {
                String subtitle = TextUtils.isEmpty(state.artist)
                        ? "Tap play to continue"
                        : state.artist + " \u2022 Tap play to continue";
                views.setTextViewText(R.id.widget_artist, subtitle);
            } else {
                views.setTextViewText(R.id.widget_artist,
                        !TextUtils.isEmpty(state.artist) ? state.artist : "Unknown Artist");
            }
        }

        // 3. Transport icons & states
        views.setImageViewResource(
                R.id.widget_btn_play,
                effectivePlaying ? R.drawable.ic_widget_pause : R.drawable.ic_widget_play
        );
        views.setContentDescription(R.id.widget_btn_play, effectivePlaying ? "Pause" : "Play");

        boolean prevEnabled = hasTrack && state.hasPrev;
        boolean nextEnabled = hasTrack && state.hasNext;
        views.setInt(R.id.widget_btn_prev, "setImageAlpha", prevEnabled ? 255 : 110);
        views.setInt(R.id.widget_btn_next, "setImageAlpha", nextEnabled ? 255 : 110);

        if (layoutType == LAYOUT_LARGE) {
            views.setImageViewResource(
                    R.id.widget_btn_favorite,
                    state.isFavorite ? R.drawable.ic_widget_heart_on : R.drawable.ic_widget_heart_off
            );
            views.setContentDescription(
                    R.id.widget_btn_favorite,
                    state.isFavorite ? "Remove from favorites" : "Add to favorites"
            );
        }

        // 4. Chronometer, Progress Bar, Duration (Standard & Large)
        if (layoutType != LAYOUT_COMPACT) {
            long displayPosMs = effectivePlaying ? state.computeCurrentPositionMs() : state.positionMs;
            if (state.durationMs > 0L) {
                displayPosMs = Math.min(displayPosMs, state.durationMs);
            }
            displayPosMs = Math.max(0L, displayPosMs);

            long chronometerBase = SystemClock.elapsedRealtime() - displayPosMs;
            views.setChronometer(R.id.widget_elapsed_time, chronometerBase, null, effectivePlaying);
            views.setTextViewText(R.id.widget_total_time, formatDuration(state.durationMs));

            float fraction = state.durationMs > 0L
                    ? Math.max(0f, Math.min(1f, (float) displayPosMs / (float) state.durationMs))
                    : 0f;
            Bitmap progressBmp = buildProgressBitmap(320, 12, fraction, accentInt);
            if (progressBmp != null) {
                views.setImageViewBitmap(R.id.widget_progress_bar, progressBmp);
            }
        }

        // 5. Click Intents
        PendingIntent openAppPi = buildOpenAppPendingIntent(context);
        views.setOnClickPendingIntent(R.id.widget_root, openAppPi);
        views.setOnClickPendingIntent(R.id.widget_cover, openAppPi);

        views.setOnClickPendingIntent(
                R.id.widget_btn_play,
                buildActionPendingIntent(context, JtecWidgetActionReceiver.ACTION_PLAY_PAUSE, 101)
        );
        views.setOnClickPendingIntent(
                R.id.widget_btn_prev,
                buildActionPendingIntent(context, JtecWidgetActionReceiver.ACTION_PREVIOUS, 102)
        );
        views.setOnClickPendingIntent(
                R.id.widget_btn_next,
                buildActionPendingIntent(context, JtecWidgetActionReceiver.ACTION_NEXT, 103)
        );
        if (layoutType == LAYOUT_LARGE) {
            views.setOnClickPendingIntent(
                    R.id.widget_btn_favorite,
                    buildActionPendingIntent(context, JtecWidgetActionReceiver.ACTION_TOGGLE_FAVORITE, 104)
            );
        }

        return views;
    }

    private static int resolveLayoutType(Bundle options) {
        if (options == null) {
            return LAYOUT_STANDARD;
        }
        int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (minHeight <= 0) {
            return LAYOUT_STANDARD;
        }
        if (minHeight < 90) {
            return LAYOUT_COMPACT;
        }
        if (minHeight <= 180) {
            return LAYOUT_STANDARD;
        }
        return LAYOUT_LARGE;
    }

    private static int getLayoutRes(int layoutType) {
        if (layoutType == LAYOUT_COMPACT) {
            return R.layout.widget_compact;
        }
        if (layoutType == LAYOUT_LARGE) {
            return R.layout.widget_large;
        }
        return R.layout.widget_standard;
    }

    private static PendingIntent buildOpenAppPendingIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, 100, intent, flags);
    }

    private static PendingIntent buildActionPendingIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, JtecWidgetActionReceiver.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, flags);
    }

    private static Bitmap decodeSampledArtwork(String path, int maxSize) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(path, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                return null;
            }
            int sample = 1;
            int maxDim = Math.max(bounds.outWidth, bounds.outHeight);
            while (maxDim / sample > maxSize * 2) {
                sample *= 2;
            }
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            return BitmapFactory.decodeFile(path, opts);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static Bitmap getOrCreateBlurredBackground(
            String trackId,
            String artworkPath,
            int minWidthDp,
            int minHeightDp,
            int accentColor,
            Bitmap source
    ) {
        // Cap background bitmap size well below RemoteViews IPC limit
        float ratio = (float) Math.max(120, minWidthDp) / (float) Math.max(56, minHeightDp);
        ratio = Math.max(1.1f, Math.min(3.5f, ratio));
        int bgW = 380;
        int bgH = Math.max(110, Math.min(260, Math.round(bgW / ratio)));
        float cornerRadius = 24f * ((float) bgH / (float) Math.max(56, minHeightDp));
        cornerRadius = Math.max(24f, Math.min(54f, cornerRadius));

        String cacheKey = "bg_" + trackId + "_" + artworkPath + "_" + bgW + "x" + bgH + "_" + accentColor;
        Bitmap cached = BITMAP_CACHE.get(cacheKey);
        if (cached != null && !cached.isRecycled()) {
            return cached;
        }

        try {
            // Downscale to ~24px and upscale twice with bilinear filtering for smooth glass blur
            Bitmap tiny = Bitmap.createScaledBitmap(source, 24, 24, true);
            Bitmap mid = Bitmap.createScaledBitmap(tiny, Math.max(32, bgW / 4), Math.max(24, bgH / 4), true);
            Bitmap upscaled = Bitmap.createScaledBitmap(mid, bgW, bgH, true);
            if (tiny != source && tiny != upscaled) tiny.recycle();
            if (mid != upscaled) mid.recycle();

            Bitmap output = Bitmap.createBitmap(bgW, bgH, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);

            // Clip rounded corners first
            Paint maskPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            maskPaint.setColor(Color.BLACK);
            RectF rect = new RectF(0f, 0f, bgW, bgH);
            canvas.drawRoundRect(rect, cornerRadius, cornerRadius, maskPaint);

            Paint imgPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            imgPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
            canvas.drawBitmap(upscaled, 0f, 0f, imgPaint);
            if (upscaled != source) upscaled.recycle();

            // Dark translucent gradient overlay (~55% to 72% dark navy) tinted with accent color
            int accentOverlay = Color.argb(
                    88,
                    Color.red(accentColor),
                    Color.green(accentColor),
                    Color.blue(accentColor)
            );
            int darkTop = Color.argb(148, 6, 10, 24);
            int darkBottom = Color.argb(196, 6, 8, 18);

            Paint tintPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            tintPaint.setShader(new LinearGradient(
                    0f, 0f, bgW, bgH,
                    new int[]{blendColors(darkTop, accentOverlay), darkTop, darkBottom},
                    new float[]{0f, 0.45f, 1f},
                    Shader.TileMode.CLAMP
            ));
            tintPaint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP));
            canvas.drawRect(rect, tintPaint);

            // Subtle glass rim border
            Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(2f);
            borderPaint.setColor(Color.argb(55, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)));
            canvas.drawRoundRect(new RectF(1f, 1f, bgW - 1f, bgH - 1f), cornerRadius, cornerRadius, borderPaint);

            BITMAP_CACHE.put(cacheKey, output);
            return output;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static Bitmap getOrCreateDefaultGradientBackground(int minWidthDp, int minHeightDp, int accentColor) {
        float ratio = (float) Math.max(120, minWidthDp) / (float) Math.max(56, minHeightDp);
        ratio = Math.max(1.1f, Math.min(3.5f, ratio));
        int bgW = 360;
        int bgH = Math.max(100, Math.min(240, Math.round(bgW / ratio)));
        float cornerRadius = Math.max(24f, Math.min(52f, 24f * ((float) bgH / (float) Math.max(56, minHeightDp))));

        String cacheKey = "defbg_" + bgW + "x" + bgH + "_" + accentColor;
        Bitmap cached = BITMAP_CACHE.get(cacheKey);
        if (cached != null && !cached.isRecycled()) {
            return cached;
        }

        try {
            Bitmap output = Bitmap.createBitmap(bgW, bgH, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);
            RectF rect = new RectF(0f, 0f, bgW, bgH);

            int accentDark = Color.argb(
                    255,
                    Math.max(10, Color.red(accentColor) / 3),
                    Math.max(18, Color.green(accentColor) / 3),
                    Math.max(36, Color.blue(accentColor) / 3)
            );
            Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            bgPaint.setShader(new LinearGradient(
                    0f, 0f, bgW, bgH,
                    new int[]{0xFF061024, accentDark, 0xFF280B4E},
                    new float[]{0f, 0.52f, 1f},
                    Shader.TileMode.CLAMP
            ));
            canvas.drawRoundRect(rect, cornerRadius, cornerRadius, bgPaint);

            Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(2f);
            borderPaint.setColor(Color.argb(65, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)));
            canvas.drawRoundRect(new RectF(1f, 1f, bgW - 1f, bgH - 1f), cornerRadius, cornerRadius, borderPaint);

            BITMAP_CACHE.put(cacheKey, output);
            return output;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static Bitmap getOrCreateRoundedCover(
            String trackId,
            String artworkPath,
            int targetSize,
            Bitmap source
    ) {
        String cacheKey = "cov_" + trackId + "_" + artworkPath + "_" + targetSize;
        Bitmap cached = BITMAP_CACHE.get(cacheKey);
        if (cached != null && !cached.isRecycled()) {
            return cached;
        }

        try {
            int sw = source.getWidth();
            int sh = source.getHeight();
            int minDim = Math.min(sw, sh);
            int sx = (sw - minDim) / 2;
            int sy = (sh - minDim) / 2;

            Bitmap square = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888);
            Canvas sqCanvas = new Canvas(square);
            Paint drawPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            sqCanvas.drawBitmap(
                    source,
                    new Rect(sx, sy, sx + minDim, sy + minDim),
                    new Rect(0, 0, targetSize, targetSize),
                    drawPaint
            );

            Bitmap output = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888);
            Canvas outCanvas = new Canvas(output);
            Paint shaderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            shaderPaint.setShader(new BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
            float radius = targetSize * 0.16f;
            outCanvas.drawRoundRect(new RectF(0f, 0f, targetSize, targetSize), radius, radius, shaderPaint);
            square.recycle();

            BITMAP_CACHE.put(cacheKey, output);
            return output;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static Bitmap buildProgressBitmap(int width, int height, float fraction, int accentColor) {
        try {
            Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bmp);
            float radius = height / 2f;

            Paint trackPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            trackPaint.setColor(Color.argb(60, 255, 255, 255));
            canvas.drawRoundRect(new RectF(0f, 0f, width, height), radius, radius, trackPaint);

            if (fraction > 0.002f) {
                float fillWidth = Math.max(height, width * Math.max(0f, Math.min(1f, fraction)));
                Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
                fillPaint.setColor(accentColor);
                canvas.drawRoundRect(new RectF(0f, 0f, fillWidth, height), radius, radius, fillPaint);
            }
            return bmp;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static int blendColors(int baseColor, int overlayColor) {
        float a = Color.alpha(overlayColor) / 255f;
        float inv = 1f - a;
        int r = Math.min(255, Math.round(Color.red(baseColor) * inv + Color.red(overlayColor) * a));
        int g = Math.min(255, Math.round(Color.green(baseColor) * inv + Color.green(overlayColor) * a));
        int b = Math.min(255, Math.round(Color.blue(baseColor) * inv + Color.blue(overlayColor) * a));
        return Color.argb(Color.alpha(baseColor), r, g, b);
    }

    private static int parseColorSafe(String hex, int fallback) {
        if (TextUtils.isEmpty(hex)) {
            return fallback;
        }
        try {
            return Color.parseColor(hex.trim());
        } catch (Throwable ignored) {
            return fallback;
        }
    }

    private static String formatDuration(long durationMs) {
        if (durationMs <= 0L) {
            return "0:00";
        }
        long totalSec = durationMs / 1000L;
        long hours = totalSec / 3600L;
        long mins = (totalSec % 3600L) / 60L;
        long secs = totalSec % 60L;
        if (hours > 0L) {
            return String.format(Locale.US, "%d:%02d:%02d", hours, mins, secs);
        }
        return String.format(Locale.US, "%d:%02d", mins, secs);
    }
}
