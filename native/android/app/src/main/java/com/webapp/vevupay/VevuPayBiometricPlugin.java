package com.webapp.vevupay;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.security.keystore.KeyInfo;
import android.security.keystore.StrongBoxUnavailableException;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;

@CapacitorPlugin(name = "VevuPayBiometric")
public class VevuPayBiometricPlugin extends Plugin {
    private static final String KEY_ALIAS = "vevupay_biometric_signing_v1";
    private PluginCall pendingSignCall;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int result = BiometricManager.from(getContext()).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        );
        JSObject out = new JSObject();
        out.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        out.put("strongBiometry", result == BiometricManager.BIOMETRIC_SUCCESS);
        if (result != BiometricManager.BIOMETRIC_SUCCESS) out.put("reason", biometricError(result));
        call.resolve(out);
    }

    @PluginMethod
    public void createKey(PluginCall call) {
        String challengeB64 = call.getString("attestationChallenge");
        if (challengeB64 == null || challengeB64.isEmpty()) {
            call.reject("A server-issued attestation challenge is required."); return;
        }
        try {
            byte[] challenge = Base64.decode(challengeB64, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            if (challenge.length < 16 || challenge.length > 128) throw new IllegalArgumentException("Invalid attestation challenge length.");
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);

            KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
            )
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setAttestationChallenge(challenge)
                .setUserAuthenticationRequired(true);
            if (Build.VERSION.SDK_INT >= 30) {
                builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
            } else {
                builder.setUserAuthenticationValidityDurationSeconds(-1);
            }
            if (Build.VERSION.SDK_INT >= 28) {
                try { builder.setIsStrongBoxBacked(true); } catch (Exception ignored) { }
            }
            generator.initialize(builder.build());
            KeyPair pair;
            try { pair = generator.generateKeyPair(); }
            catch (Exception strongBoxError) {
                // Retry using the device TEE if StrongBox is unavailable.
                if (Build.VERSION.SDK_INT < 28) throw strongBoxError;
                KeyGenParameterSpec.Builder tee = new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setAttestationChallenge(challenge)
                    .setUserAuthenticationRequired(true);
                if (Build.VERSION.SDK_INT >= 30) tee.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
                else tee.setUserAuthenticationValidityDurationSeconds(-1);
                generator.initialize(tee.build());
                pair = generator.generateKeyPair();
            }
            Certificate[] chain = keyStore.getCertificateChain(KEY_ALIAS);
            ArrayList<String> certificates = new ArrayList<>();
            if (chain != null) for (Certificate cert : chain) certificates.add(Base64.encodeToString(cert.getEncoded(), Base64.NO_WRAP));

            KeyFactory factory = KeyFactory.getInstance(pair.getPublic().getAlgorithm(), "AndroidKeyStore");
            KeyInfo keyInfo = factory.getKeySpec(pair.getPrivate(), KeyInfo.class);
            String level = "UNKNOWN";
            if (Build.VERSION.SDK_INT >= 31) {
                int security = keyInfo.getSecurityLevel();
                if (security == KeyProperties.SECURITY_LEVEL_STRONGBOX) level = "STRONGBOX";
                else if (security == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT) level = "TEE";
                else if (security == KeyProperties.SECURITY_LEVEL_SOFTWARE) level = "SOFTWARE";
            } else if (keyInfo.isInsideSecureHardware()) level = "TEE";
            JSObject out = new JSObject();
            out.put("publicKeySpki", Base64.encodeToString(pair.getPublic().getEncoded(), Base64.NO_WRAP));
            out.put("attestationCertificates", new org.json.JSONArray(certificates));
            out.put("securityLevel", level);
            call.resolve(out);
        } catch (Exception e) { call.reject("Unable to create a hardware-backed biometric key: " + e.getMessage()); }
    }

    @PluginMethod
    public void sign(PluginCall call) {
        String message = call.getString("message");
        if (message == null || message.isEmpty() || message.length() > 12000) { call.reject("Invalid signing message."); return; }
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
            PrivateKey key = (PrivateKey) store.getKey(KEY_ALIAS, null);
            if (key == null) { call.reject("Biometric signing key is not enrolled on this device."); return; }
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(key);
            Executor executor = ContextCompat.getMainExecutor(getContext());
            BiometricPrompt prompt = new BiometricPrompt(getActivity(), executor, new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    try {
                        Signature authenticated = result.getCryptoObject().getSignature();
                        authenticated.update(message.getBytes(StandardCharsets.UTF_8));
                        byte[] signed = authenticated.sign();
                        JSObject out = new JSObject();
                        out.put("signature", Base64.encodeToString(signed, Base64.NO_WRAP));
                        call.resolve(out);
                    } catch (Exception e) { call.reject("Could not sign authorization message.", e); }
                }
                @Override public void onAuthenticationError(int code, @NonNull CharSequence err) { call.reject(err.toString()); }
                @Override public void onAuthenticationFailed() { /* Prompt remains available for retry. */ }
            });
            pendingSignCall = call;
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(call.getString("promptTitle", "Authorize with fingerprint"))
                .setSubtitle(call.getString("promptSubtitle", "Confirm your identity"))
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build();
            prompt.authenticate(info, new BiometricPrompt.CryptoObject(signature));
        } catch (Exception e) { call.reject("Biometric signing is unavailable: " + e.getMessage()); }
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
            if (store.containsAlias(KEY_ALIAS)) store.deleteEntry(KEY_ALIAS);
            JSObject out = new JSObject(); out.put("deleted", true); call.resolve(out);
        } catch (Exception e) { call.reject("Could not remove biometric key.", e); }
    }

    private String biometricError(int code) {
        switch (code) {
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE: return "This device has no supported biometric sensor.";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE: return "Biometric hardware is currently unavailable.";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED: return "Add a fingerprint in Android Settings first.";
            default: return "Strong biometric authentication is unavailable on this device.";
        }
    }
}
