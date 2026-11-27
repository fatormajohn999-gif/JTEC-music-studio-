package com.jtecmusic.app.audio;

import android.content.Context;
import android.media.audiofx.BassBoost;
import android.media.audiofx.EnvironmentalReverb;
import android.media.audiofx.Equalizer;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "JtecAudioPlayer")
public class JtecAudioPlayerPlugin extends Plugin {
    private ExoPlayer player;
    private Handler progressHandler;
    private Runnable progressRunnable;
    private boolean isPlaying = false;

    private BassBoost bassBoost;
    private EnvironmentalReverb reverb;
    private Equalizer equalizer;

    @Override
    public void load() {
        super.load();
        Context ctx = getContext();
        if (ctx != null) {
            player = JtecMediaService.getSharedPlayer(ctx);
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
        releaseAudioEffects();
        super.handleOnDestroy();
    }

    private void releaseAudioEffects() {
        try {
            if (bassBoost != null) {
                bassBoost.release();
                bassBoost = null;
            }
            if (reverb != null) {
                reverb.release();
                reverb = null;
            }
            if (equalizer != null) {
                equalizer.release();
                equalizer = null;
            }
        } catch (Exception ignored) {}
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
    public void loadBase64Audio(PluginCall call) {
        String base64Data = call.getString("data");
        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Base64 data is required");
            return;
        }
        try {
            Context ctx = getContext();
            if (ctx == null || player == null) {
                call.reject("Context or player not available");
                return;
            }

            int commaIdx = base64Data.indexOf(',');
            if (commaIdx >= 0) {
                base64Data = base64Data.substring(commaIdx + 1);
            }

            byte[] decodedBytes = Base64.decode(base64Data, Base64.DEFAULT);
            File tempFile = new File(ctx.getCacheDir(), "jtec_native_playback_" + System.currentTimeMillis() + ".mp3");
            FileOutputStream fos = new FileOutputStream(tempFile);
            fos.write(decodedBytes);
            fos.close();

            player.stop();
            MediaItem mediaItem = MediaItem.fromUri(Uri.fromFile(tempFile));
            player.setMediaItem(mediaItem);
            player.prepare();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to load base64 audio: " + e.getMessage());
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
        Double reverbWet = call.getDouble("reverbWet", 0.0);
        Double bassGain = call.getDouble("bassGain", 0.0);
        Double trebleGain = call.getDouble("trebleGain", 0.0);

        try {
            if (player != null) {
                float speed = Math.max(0.5f, Math.min(1.5f, rate != null ? rate.floatValue() : 1.0f));
                float pitch = (preservesPitch != null && preservesPitch) ? 1.0f : speed;
                player.setPlaybackParameters(new PlaybackParameters(speed, pitch));

                int audioSessionId = player.getAudioSessionId();
                if (audioSessionId != 0) {
                    try {
                        if (bassBoost == null) {
                            bassBoost = new BassBoost(0, audioSessionId);
                        }
                        bassBoost.setEnabled(true);
                        float bassVal = bassGain != null ? bassGain.floatValue() : 0.0f;
                        short strength = (short) Math.max(0, Math.min(1000, (bassVal / 35.0f) * 1000.0f));
                        bassBoost.setStrength(strength);
                    } catch (Exception ignored) {}

                    try {
                        if (reverb == null) {
                            reverb = new EnvironmentalReverb(0, audioSessionId);
                        }
                        float revVal = reverbWet != null ? reverbWet.floatValue() : 0.0f;
                        if (revVal > 0.01f) {
                            reverb.setEnabled(true);
                            short roomLevel = (short) (-3000 + (revVal * 3000.0f));
                            reverb.setRoomLevel(roomLevel);
                            reverb.setDecayTime((int) (1000 + revVal * 3000.0f));
                        } else {
                            reverb.setEnabled(false);
                        }
                    } catch (Exception ignored) {}

                    try {
                        if (equalizer == null) {
                            equalizer = new Equalizer(0, audioSessionId);
                        }
                        equalizer.setEnabled(true);
                        short numBands = equalizer.getNumberOfBands();
                        if (numBands >= 2) {
                            float bassV = bassGain != null ? bassGain.floatValue() : 0.0f;
                            float trebleV = trebleGain != null ? trebleGain.floatValue() : 0.0f;
                            short bassMillibels = (short) (bassV * 120);
                            short trebleMillibels = (short) (trebleV * 120);
                            equalizer.setBandLevel((short) 0, bassMillibels);
                            equalizer.setBandLevel((short) (numBands - 1), trebleMillibels);
                        }
                    } catch (Exception ignored) {}
                }

                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        } catch (Exception e) {
            call.reject("Failed to set effects: " + e.getMessage());
        }
    }
}
