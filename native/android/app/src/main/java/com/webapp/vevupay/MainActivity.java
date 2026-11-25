package com.webapp.vevupay;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VevuPayBiometricPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
