package io.voteatlas.collector;

import android.accessibilityservice.AccessibilityService;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.json.JSONObject;

public final class IdolChampService extends AccessibilityService {
    private static final String PACKAGE = "com.nwz.ichampclient";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastRead = 0;
    private String lastFingerprint = "";

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!getSharedPreferences("settings", MODE_PRIVATE).getBoolean("active", false)) return;
        if (event == null || event.getPackageName() == null || !PACKAGE.contentEquals(event.getPackageName())) return;
        long now = android.os.SystemClock.elapsedRealtime();
        if (now - lastRead < 1300) return;
        lastRead = now;
        handler.postDelayed(this::captureCurrentScreen, 350);
    }

    private void captureCurrentScreen() {
        if (!getSharedPreferences("settings", MODE_PRIVATE).getBoolean("active", false)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !PACKAGE.contentEquals(root.getPackageName())) return;
        LinkedHashSet<String> all = new LinkedHashSet<>();
        visit(root, all, 0);
        if (all.isEmpty()) return;
        List<String> lines = new ArrayList<>(all);
        String fingerprint = String.join("|", lines);
        if (fingerprint.equals(lastFingerprint)) return;
        lastFingerprint = fingerprint;
        JSONObject event = PollParser.parse(lines);
        if (event == null) return;
        ObservationStore.add(this, event);
        UploadClient.upload(this, false, null);
    }

    private void visit(AccessibilityNodeInfo node, LinkedHashSet<String> out, int depth) {
        if (node == null || depth > 24 || out.size() >= 240) return;
        if (node.isPassword() || node.isEditable()) return;
        CharSequence t = node.getText();
        if (t != null) include(out, t.toString());
        CharSequence desc = node.getContentDescription();
        if (desc != null) include(out, desc.toString());
        for (int i = 0; i < node.getChildCount() && out.size() < 240; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) visit(child, out, depth + 1);
        }
    }

    private void include(LinkedHashSet<String> out, String line) {
        String value = line.trim().replaceAll("\\s+", " ");
        if (value.length() >= 2 && value.length() <= 200) out.add(value);
    }

    @Override public void onInterrupt() {}
}
