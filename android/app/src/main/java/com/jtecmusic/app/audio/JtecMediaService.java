package com.jtecmusic.app.audio;

import android.content.Context;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

public class JtecMediaService extends MediaSessionService {
    private static ExoPlayer sharedPlayer;
    private static MediaSession sharedSession;

    public static synchronized ExoPlayer getSharedPlayer(Context context) {
        if (sharedPlayer == null) {
            Context appContext = context.getApplicationContext();
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .setUsage(C.USAGE_MEDIA)
                    .build();

            sharedPlayer = new ExoPlayer.Builder(appContext).build();
            sharedPlayer.setAudioAttributes(audioAttributes, true);
            sharedPlayer.setHandleAudioBecomingNoisy(true);
        }
        return sharedPlayer;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ExoPlayer player = getSharedPlayer(this);
        sharedSession = new MediaSession.Builder(this, player).build();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return sharedSession;
    }

    @Override
    public void onDestroy() {
        if (sharedSession != null) {
            sharedSession.release();
            sharedSession = null;
        }
        if (sharedPlayer != null) {
            sharedPlayer.release();
            sharedPlayer = null;
        }
        super.onDestroy();
    }
}
