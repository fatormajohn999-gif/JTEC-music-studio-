package com.jtecmusic.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.jtecmusic.app.widget.JtecWidgetPlugin;
import com.jtecmusic.app.audio.JtecAudioPlayerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JtecWidgetPlugin.class);
        registerPlugin(JtecAudioPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
