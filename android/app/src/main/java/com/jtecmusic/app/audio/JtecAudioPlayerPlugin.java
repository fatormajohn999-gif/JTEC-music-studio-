package com.jtecmusic.app.audio;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "JtecAudioPlayer")
public class JtecAudioPlayerPlugin extends Plugin {
    private ExoPlayer player;
    private Handler progressHandler;
    private Runnable progressRunnable;
    private boolean isPlaying = false;

    @Override
    public void load() {
        super.load();
        Context ctx = getContext();
        if (ctx != null) {
            player = new ExoPlayer.Builder(ctx).build();
            setupPlayerListeners();
            setupProgressTicker();
        }
    }

    private void setupPlayerListeners() {
        if (player == null) return;
        player.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean playing) {
                isPlaying = playing;
                JSObject ret = new JSObject();
                ret.put("isPlaying", playing);
                notifyListeners("playStateChange", ret);
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_ENDED) {
                    JSObject ret = new JSObject();
                    notifyListeners("ended", ret);
                }
            }

            @Override
            public void onPlayerError(androidx.media3.common.PlaybackException error) {
                JSObject ret = new JSObject();
                ret.put("message", error.getMessage() != null ? error.getMessage() : "Audio playback error");
                notifyListeners("error", ret);
            }
        });
    }

    private void setupProgressTicker() {
        progressHandler = new Handler(Looper.getMainLooper());
        progressRunnable = new Runnable() {
            @Override
            public void run() {
                if (player != null && isPlaying) {
                    long currentMs = player.getCurrentPosition();
                    long durationMs = player.getDuration();
                    JSObject ret = new JSObject();
                    ret.put("currentTime", currentMs / 1000.0);
                    ret.put("duration", durationMs > 0 ? durationMs / 1000.0 : 0.0);
                    notifyListeners("timeUpdate", ret);
                }
                if (progressHandler != null) {
                    progressHandler.postDelayed(this, 250);
                }
            }
        };
        progressHandler.postDelayed(progressRunnable, 250);
    }

    @Override
    protected void handleOnDestroy() {
        if (progressHandler != null && progressRunnable != null) {
            progressHandler.removeCallbacks(progressRunnable);
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void loadSource(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }
        try {
            if (player != null) {
                player.stop();
                MediaItem mediaItem = MediaItem.fromUri(Uri.parse(url));
                player.setMediaItem(mediaItem);
                player.prepare();
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        } catch (Exception e) {
            call.reject("Failed to load audio: " + e.getMessage());
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        try {
            if (player != null) {
                player.play();
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        } catch (Exception e) {
            call.reject("Failed to play: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        try {
            if (player != null) {
                player.pause();
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        } catch (Exception e) {
            call.reject("Failed to pause: " + e.getMessage());
        }
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double timeSec = call.getDouble("time", 0.0);
        try {
            if (player != null) {
                long posMs = (long) (timeSec * 1000.0);
                player.seekTo(posMs);
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        } catch (Exception e) {
            call.reject("Failed to seek: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volume = call.getDouble("volume", 1.0);
        try {
            if (player != null) {
                player.setVolume(Math.max(0.0f, Math.min(1.0f, volume.floatValue())));
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        } catch (Exception e) {
            call.reject("Failed to set volume: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setEffects(PluginCall call) {
        Double rate = call.getDouble("playbackRate", 1.0);
        Boolean preservesPitch = call.getBoolean("preservesPitch", true);
        try {
            if (player != null) {
                float speed = Math.max(0.5f, Math.min(1.5f, rate.floatValue()));
                float pitch = preservesPitch ? 1.0f : speed;
                player.setPlaybackParameters(new PlaybackParameters(speed, pitch));
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        } catch (Exception e) {
            call.reject("Failed to set effects: " + e.getMessage());
        }
    }
}
