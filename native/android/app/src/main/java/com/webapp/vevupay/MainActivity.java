package com.webapp.vevupay;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VevuPayBiometricPlugin.class);
        registerPlugin(VevuPayUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
