package com.jtecmusic.app.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class JtecWidgetTimer {
    private static final long PROGRESS_INTERVAL_MS = 5000L;

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());

    private static volatile boolean running = false;
    private static volatile boolean screenReceiverRegistered = false;
    private static Context appContextRef = null;
    private static BroadcastReceiver screenReceiver = null;

    private static final Runnable TICK_RUNNABLE = new Runnable() {
        @Override
        public void run() {
            if (!running || appContextRef == null) {
                return;
            }
            final Context ctx = appContextRef;
            try {
                if (!JtecWidgetRenderer.hasAnyWidgets(ctx)) {
                    stop(ctx);
                    return;
                }
                if (!isScreenOn(ctx)) {
                    running = false;
                    return;
                }
                JtecWidgetState state = JtecWidgetState.load(ctx);
                if (!state.playing || !JtecWidgetPlugin.isBridgeAlive()) {
                    stop(ctx);
                    return;
                }
                runOnBackground(new Runnable() {
                    @Override
                    public void run() {
                        JtecWidgetRenderer.updateProgressOnly(ctx);
                    }
                });
                MAIN_HANDLER.postDelayed(this, PROGRESS_INTERVAL_MS);
            } catch (Throwable ignored) {
                running = false;
            }
        }
    };

    public static void runOnBackground(final Runnable task) {
        if (task == null) {
            return;
        }
        try {
            EXECUTOR.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        task.run();
                    } catch (Throwable ignored) {
                    }
                }
            });
        } catch (Throwable ignored) {
        }
    }

    public static boolean isRunning() {
        return running;
    }

    public static synchronized void startIfNeeded(Context context) {
        if (context == null) {
            return;
        }
        try {
            Context appCtx = context.getApplicationContext();
            appContextRef = appCtx;
            ensureScreenReceiverRegistered(appCtx);

            if (!JtecWidgetRenderer.hasAnyWidgets(appCtx)) {
                stop(appCtx);
                return;
            }
            JtecWidgetState state = JtecWidgetState.load(appCtx);
            if (!state.playing || !JtecWidgetPlugin.isBridgeAlive()) {
                stopTimerOnly();
                return;
            }
            if (!isScreenOn(appCtx)) {
                stopTimerOnly();
                return;
            }
            if (running) {
                return;
            }
            running = true;
            MAIN_HANDLER.removeCallbacks(TICK_RUNNABLE);
            MAIN_HANDLER.postDelayed(TICK_RUNNABLE, PROGRESS_INTERVAL_MS);
        } catch (Throwable ignored) {
        }
    }

    private static synchronized void stopTimerOnly() {
        running = false;
        try {
            MAIN_HANDLER.removeCallbacks(TICK_RUNNABLE);
        } catch (Throwable ignored) {
        }
    }

    public static synchronized void stop(Context context) {
        stopTimerOnly();
        if (context != null) {
            try {
                if (!JtecWidgetRenderer.hasAnyWidgets(context.getApplicationContext())) {
                    unregisterScreenReceiver(context.getApplicationContext());
                }
            } catch (Throwable ignored) {
            }
        }
    }

    public static synchronized void unregisterScreenReceiver(Context context) {
        if (!screenReceiverRegistered || screenReceiver == null || context == null) {
            return;
        }
        try {
            context.getApplicationContext().unregisterReceiver(screenReceiver);
        } catch (Throwable ignored) {
        } finally {
            screenReceiverRegistered = false;
            screenReceiver = null;
        }
    }

    private static void ensureScreenReceiverRegistered(Context appCtx) {
        if (screenReceiverRegistered || appCtx == null) {
            return;
        }
        try {
            screenReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null) {
                        return;
                    }
                    String action = intent.getAction();
                    if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                        stopTimerOnly();
                    } else if (Intent.ACTION_SCREEN_ON.equals(action)) {
                        final Context c = context.getApplicationContext();
                        JtecWidgetState state = JtecWidgetState.load(c);
                        if (state.playing && JtecWidgetPlugin.isBridgeAlive() && JtecWidgetRenderer.hasAnyWidgets(c)) {
                            runOnBackground(new Runnable() {
                                @Override
                                public void run() {
                                    JtecWidgetRenderer.renderAllWidgets(c);
                                }
                            });
                            startIfNeeded(c);
                        }
                    }
                }
            };
            IntentFilter filter = new IntentFilter();
            filter.addAction(Intent.ACTION_SCREEN_ON);
            filter.addAction(Intent.ACTION_SCREEN_OFF);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                appCtx.registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                appCtx.registerReceiver(screenReceiver, filter);
            }
            screenReceiverRegistered = true;
        } catch (Throwable ignored) {
        }
    }

    private static boolean isScreenOn(Context context) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            return pm == null || pm.isInteractive();
        } catch (Throwable ignored) {
            return true;
        }
    }
}
