package com.webapp.vevupay;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "VevuPayUpdater")
public class VevuPayUpdaterPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String urlValue = call.getString("url");
        String expectedSha256 = call.getString("sha256", "");
        Integer versionCode = call.getInt("versionCode");
        if (urlValue == null || versionCode == null || versionCode < 1) {
            call.reject("A valid update URL and version code are required.");
            return;
        }
        executor.execute(() -> {
            HttpURLConnection connection = null;
            File output = null;
            try {
                URL url = new URL(urlValue);
                if (!"https".equalsIgnoreCase(url.getProtocol())) throw new Exception("Only secure HTTPS update links are supported.");
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
                connection.connect();
                int status = connection.getResponseCode();
                if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) throw new Exception("The update server redirected to an insecure URL.");
                if (status < 200 || status >= 300) throw new Exception("The update server returned HTTP " + status + ".");
                int total = connection.getContentLength();
                File directory = new File(getContext().getCacheDir(), "vevupay-updates");
                if (!directory.exists() && !directory.mkdirs()) throw new Exception("Unable to create private update storage.");
                output = new File(directory, "vevupay-update-" + versionCode + ".apk");
                if (output.exists() && !output.delete()) throw new Exception("Unable to replace an earlier update download.");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long downloaded = 0;
                byte[] buffer = new byte[64 * 1024];
                try (InputStream input = new BufferedInputStream(connection.getInputStream()); FileOutputStream file = new FileOutputStream(output)) {
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        file.write(buffer, 0, count);
                        digest.update(buffer, 0, count);
                        downloaded += count;
                        JSObject progress = new JSObject();
                        progress.put("bytesDownloaded", downloaded);
                        progress.put("totalBytes", total > 0 ? total : 0);
                        progress.put("percent", total > 0 ? Math.min(100, (int) ((downloaded * 100) / total)) : -1);
                        notifyListeners("downloadProgress", progress);
                    }
                    file.getFD().sync();
                }
                if (output.length() < 1024) throw new Exception("The downloaded update file is incomplete.");
                String actualHash = toHex(digest.digest());
                if (expectedSha256 != null && !expectedSha256.trim().isEmpty() && !actualHash.equalsIgnoreCase(expectedSha256.trim())) {
                    output.delete();
                    throw new Exception("The downloaded update failed its SHA-256 integrity check.");
                }
                JSObject result = new JSObject();
                result.put("path", output.getAbsolutePath());
                result.put("sizeBytes", output.length());
                result.put("sha256", actualHash);
                call.resolve(result);
            } catch (Exception error) {
                if (output != null && output.exists()) output.delete();
                call.reject(error.getMessage() == null ? "Unable to download the update." : error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("The downloaded update file is missing.");
            return;
        }
        try {
            File apk = new File(path).getCanonicalFile();
            File updates = new File(getContext().getCacheDir(), "vevupay-updates").getCanonicalFile();
            if (!apk.getPath().startsWith(updates.getPath() + File.separator) || !apk.isFile() || !apk.getName().endsWith(".apk")) {
                call.reject("The update file is not in VevuPay's private update storage.");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                call.reject("Allow VevuPay to install updates, then return and tap Install update again.");
                return;
            }
            Uri apkUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            install.setData(apkUri);
            install.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            install.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
            getContext().startActivity(install);
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Unable to start Android's package installer." : error.getMessage());
        }
    }

    @PluginMethod
    public void cleanupDownloads(PluginCall call) {
        try {
            File directory = new File(getContext().getCacheDir(), "vevupay-updates");
            File[] files = directory.listFiles();
            if (files != null) for (File file : files) if (file.isFile() && file.getName().endsWith(".apk")) file.delete();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to clean temporary update files.");
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.US, "%02x", value & 0xff));
        return result.toString();
    }
}
