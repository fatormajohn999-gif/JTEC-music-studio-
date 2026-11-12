package com.jtecmusic.app.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.jtecmusic.app.MainActivity;

public class JtecWidgetActionReceiver extends BroadcastReceiver {
    public static final String ACTION_PLAY_PAUSE = "com.jtecmusic.app.widget.ACTION_PLAY_PAUSE";
    public static final String ACTION_NEXT = "com.jtecmusic.app.widget.ACTION_NEXT";
    public static final String ACTION_PREVIOUS = "com.jtecmusic.app.widget.ACTION_PREVIOUS";
    public static final String ACTION_TOGGLE_FAVORITE = "com.jtecmusic.app.widget.ACTION_TOGGLE_FAVORITE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }
        try {
            String action = intent.getAction();
            String jsAction = mapToJsAction(action);
            if (jsAction == null) {
                return;
            }

            JtecWidgetPlugin plugin = JtecWidgetPlugin.getInstance();
            if (plugin != null && JtecWidgetPlugin.isBridgeAlive()) {
                plugin.emitWidgetAction(jsAction);
            } else {
                JtecWidgetState.savePendingAction(context, jsAction);
                Intent launchIntent = new Intent(context, MainActivity.class);
                launchIntent.setAction(Intent.ACTION_MAIN);
                launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                launchIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK
                                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                );
                context.startActivity(launchIntent);
            }
        } catch (Throwable ignored) {
        }
    }

    private static String mapToJsAction(String action) {
        if (ACTION_PLAY_PAUSE.equals(action)) {
            return "playPause";
        }
        if (ACTION_NEXT.equals(action)) {
            return "next";
        }
        if (ACTION_PREVIOUS.equals(action)) {
            return "previous";
        }
        if (ACTION_TOGGLE_FAVORITE.equals(action)) {
            return "toggleFavorite";
        }
        return null;
    }
}
