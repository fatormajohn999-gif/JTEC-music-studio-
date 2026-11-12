package com.jtecmusic.app.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

public class JtecMusicWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(final Context context, final AppWidgetManager appWidgetManager, final int[] appWidgetIds) {
        try {
            final PendingResult pendingResult = goAsync();
            final Context appCtx = context.getApplicationContext();
            JtecWidgetTimer.runOnBackground(new Runnable() {
                @Override
                public void run() {
                    try {
                        JtecWidgetRenderer.renderWidgets(appCtx, appWidgetManager, appWidgetIds);
                        JtecWidgetTimer.startIfNeeded(appCtx);
                    } catch (Throwable ignored) {
                    } finally {
                        try {
                            pendingResult.finish();
                        } catch (Throwable ignored) {
                        }
                    }
                }
            });
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(
            final Context context,
            final AppWidgetManager appWidgetManager,
            final int appWidgetId,
            final Bundle newOptions
    ) {
        try {
            final PendingResult pendingResult = goAsync();
            final Context appCtx = context.getApplicationContext();
            JtecWidgetTimer.runOnBackground(new Runnable() {
                @Override
                public void run() {
                    try {
                        JtecWidgetRenderer.renderWidgets(appCtx, appWidgetManager, new int[]{appWidgetId});
                    } catch (Throwable ignored) {
                    } finally {
                        try {
                            pendingResult.finish();
                        } catch (Throwable ignored) {
                        }
                    }
                }
            });
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onEnabled(Context context) {
        try {
            JtecWidgetTimer.startIfNeeded(context.getApplicationContext());
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        try {
            Context appCtx = context.getApplicationContext();
            if (!JtecWidgetRenderer.hasAnyWidgets(appCtx)) {
                JtecWidgetTimer.stop(appCtx);
                JtecWidgetTimer.unregisterScreenReceiver(appCtx);
            }
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onDisabled(Context context) {
        try {
            Context appCtx = context.getApplicationContext();
            JtecWidgetTimer.stop(appCtx);
            JtecWidgetTimer.unregisterScreenReceiver(appCtx);
        } catch (Throwable ignored) {
        }
    }
}
