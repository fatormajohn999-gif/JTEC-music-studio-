package com.jtecmusic.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.text.TextUtils;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "JtecWidget")
public class JtecWidgetPlugin extends Plugin {
    private static volatile JtecWidgetPlugin activeInstance = null;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        try {
            JtecWidgetTimer.stop(getContext());
        } catch (Throwable ignored) {
        }
        super.handleOnDestroy();
    }

    public static JtecWidgetPlugin getInstance() {
        return activeInstance;
    }

    public static boolean isBridgeAlive() {
        JtecWidgetPlugin inst = activeInstance;
        return inst != null && inst.getBridge() != null;
    }

    public void emitWidgetAction(String action) {
        try {
            if (TextUtils.isEmpty(action)) {
                return;
            }
            JSObject data = new JSObject();
            data.put("action", action);
            notifyListeners("widgetAction", data);
        } catch (Throwable ignored) {
        }
    }

    @PluginMethod
    public void updateState(final PluginCall call) {
        try {
            final Context ctx = getContext() != null ? getContext().getApplicationContext() : null;
            if (ctx == null || !JtecWidgetRenderer.hasAnyWidgets(ctx)) {
                call.resolve();
                return;
            }

            final String trackId = call.getString("trackId", "");
            final String title = call.getString("title", "");
            final String artist = call.getString("artist", "");
            final String album = call.getString("album", "");
            final boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
            final long positionMs = call.getData() != null ? Math.max(0L, call.getData().optLong("positionMs", 0L)) : 0L;
            final long durationMs = call.getData() != null ? Math.max(0L, call.getData().optLong("durationMs", 0L)) : 0L;
            final Double rateVal = call.getDouble("rate", 1.0);
            final float rate = rateVal != null ? rateVal.floatValue() : 1.0f;
            final String accentColor = call.getString("accentColor", "#22D3EE");
            final boolean isFavorite = Boolean.TRUE.equals(call.getBoolean("isFavorite", false));
            final boolean hasPrev = Boolean.TRUE.equals(call.getBoolean("hasPrev", true));
            final boolean hasNext = Boolean.TRUE.equals(call.getBoolean("hasNext", true));
            final String artworkB64 = call.getString("artwork", null);

            JtecWidgetTimer.runOnBackground(new Runnable() {
                @Override
                public void run() {
                    try {
                        JtecWidgetState prev = JtecWidgetState.load(ctx);
                        JtecWidgetState next = new JtecWidgetState();
                        next.trackId = trackId != null ? trackId : "";
                        next.title = title != null ? title : "";
                        next.artist = artist != null ? artist : "";
                        next.album = album != null ? album : "";
                        next.playing = playing;
                        next.positionMs = positionMs;
                        next.durationMs = durationMs;
                        next.rate = rate;
                        next.accentColor = !TextUtils.isEmpty(accentColor) ? accentColor : "#22D3EE";
                        next.isFavorite = isFavorite;
                        next.hasPrev = hasPrev;
                        next.hasNext = hasNext;
                        next.updatedAtMs = System.currentTimeMillis();

                        if (!TextUtils.isEmpty(artworkB64)) {
                            String cleaned = artworkB64;
                            int commaIdx = cleaned.indexOf(',');
                            if (commaIdx >= 0) {
                                cleaned = cleaned.substring(commaIdx + 1);
                            }
                            byte[] decoded = Base64.decode(cleaned, Base64.DEFAULT);
                            String savedPath = JtecWidgetState.saveArtworkBytes(ctx, next.trackId, decoded);
                            next.artworkPath = savedPath != null ? savedPath : "";
                        } else if (TextUtils.equals(prev.trackId, next.trackId)
                                && !TextUtils.isEmpty(prev.artworkPath)
                                && new File(prev.artworkPath).exists()) {
                            next.artworkPath = prev.artworkPath;
                        } else {
                            next.artworkPath = "";
                        }

                        next.save(ctx);
                        JtecWidgetRenderer.renderAllWidgets(ctx);

                        if (next.playing) {
                            JtecWidgetTimer.startIfNeeded(ctx);
                        } else {
                            JtecWidgetTimer.stop(ctx);
                        }
                    } catch (Throwable ignored) {
                    }
                }
            });

            call.resolve();
        } catch (Throwable ignored) {
            call.resolve();
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            final Context ctx = getContext() != null ? getContext().getApplicationContext() : null;
            if (ctx != null) {
                JtecWidgetTimer.runOnBackground(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            JtecWidgetState.clear(ctx);
                            JtecWidgetTimer.stop(ctx);
                            if (JtecWidgetRenderer.hasAnyWidgets(ctx)) {
                                JtecWidgetRenderer.renderAllWidgets(ctx);
                            }
                        } catch (Throwable ignored) {
                        }
                    }
                });
            }
        } catch (Throwable ignored) {
        }
        call.resolve();
    }

    @PluginMethod
    public void hasWidgets(PluginCall call) {
        JSObject result = new JSObject();
        boolean exists = false;
        try {
            Context ctx = getContext() != null ? getContext().getApplicationContext() : null;
            exists = JtecWidgetRenderer.hasAnyWidgets(ctx);
        } catch (Throwable ignored) {
        }
        result.put("value", exists);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPinWidget(PluginCall call) {
        JSObject result = new JSObject();
        boolean supported = false;
        try {
            Context ctx = getContext();
            if (ctx != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
                if (manager != null && manager.isRequestPinAppWidgetSupported()) {
                    ComponentName provider = new ComponentName(ctx, JtecMusicWidgetProvider.class);
                    Intent callbackIntent = new Intent(ctx, JtecMusicWidgetProvider.class);
                    callbackIntent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
                    PendingIntent successCallback = PendingIntent.getBroadcast(ctx, 200, callbackIntent, flags);
                    supported = manager.requestPinAppWidget(provider, null, successCallback);
                }
            }
        } catch (Throwable ignored) {
            supported = false;
        }
        result.put("supported", supported);
        call.resolve(result);
    }

    @PluginMethod
    public void getLaunchAction(PluginCall call) {
        JSObject result = new JSObject();
        String action = null;
        try {
            Context ctx = getContext() != null ? getContext().getApplicationContext() : null;
            action = JtecWidgetState.consumePendingAction(ctx);
        } catch (Throwable ignored) {
        }
        result.put("action", action);
        call.resolve(result);
    }
}
