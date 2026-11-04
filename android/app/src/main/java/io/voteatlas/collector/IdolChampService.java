package io.voteatlas.collector;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Path;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.os.Build;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.view.Display;
import android.view.WindowManager;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

/**
 * Conservative unattended best-effort navigator for idolchamp ONLY.
 * Never clicks vote/purchase/login controls and never bypasses a device lock.
 * Requires a real, unlocked, interactive device and user-enabled accessibility.
 */
public final class IdolChampService extends AccessibilityService {
    private static final String PACKAGE = "com.nwz.ichampclient";
    private static WeakReference<IdolChampService> instance = new WeakReference<>(null);
    private final Handler handler = new Handler(Looper.getMainLooper());

    private enum Stage { IDLE, LAUNCH, LIST, DETAIL }
    private Stage stage = Stage.IDLE;
    private final Set<String> visited = new HashSet<>();
    private final Set<String> listPages = new HashSet<>();
    private final LinkedHashSet<String> detailText = new LinkedHashSet<>();
    private boolean running = false;
    private boolean manual = false;
    private boolean ocrPending = false;
    private TextRecognizer recognizer;
    private long startedAt = 0;
    private int actions = 0, details = 0, listSwipes = 0, detailSwipes = 0, captured = 0;
    private static final int MAX_ACTIONS = 90;
    private static final int MAX_DETAILS = 30;
    private static final int MAX_LIST_SWIPES = 12;
    private static final int MAX_DETAIL_SWIPES = 5;
    private static final int MAX_MINUTES = 15;
    private Runnable pendingTick;

    public static void requestScheduledRun(Context context) {
        context.getSharedPreferences("settings", Context.MODE_PRIVATE).edit()
                .putBoolean("run_requested", true).apply();
        IdolChampService active = instance.get();
        if (active == null) {
            DailyScheduler.status(context, "접근성 수집 서비스가 실행 중이지 않습니다. 설정에서 서비스 권한을 확인해 주세요.");
            DailyScheduler.retry(context, 30);
            return;
        }
        active.handler.post(() -> active.start(false));
    }

    public static boolean requestManualRun(Context context) {
        IdolChampService active = instance.get();
        if (active == null) return false;
        active.handler.post(() -> active.start(true));
        return true;
    }

    public static boolean requestStop(Context context) {
        IdolChampService active = instance.get();
        if (active == null) return false;
        active.handler.post(() -> active.finish("사용자 요청으로 수집 중지", false));
        return true;
    }

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        instance = new WeakReference<>(this);
        recognizer = TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build());
        if (getSharedPreferences("settings", MODE_PRIVATE).getBoolean("run_requested", false)) {
            handler.postDelayed(() -> start(false), 900);
        }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        if (!PACKAGE.contentEquals(event.getPackageName())) return;
        if (running && pendingTick == null && !ocrPending) queueTick(1100);
        // User-driven reading remains available while the collector is switched on.
        if (!running && getSharedPreferences("settings", MODE_PRIVATE).getBoolean("active", false)) {
            handler.removeCallbacks(userCapture);
            handler.postDelayed(userCapture, 700);
        }
    }

    private final Runnable userCapture = () -> {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!correctPackage(root)) return;
        JSONObject parsed = PollParser.parse(allText(root));
        if (parsed == null) return;
        ObservationStore.add(this, parsed);
        if (DailyScheduler.onWifi(this)) UploadClient.upload(this, false, null);
    };

    private boolean ready() {
        if (!DailyScheduler.onWifi(this)) {
            DailyScheduler.status(this, "Wi-Fi에 연결되어 있지 않아 수집을 재시도합니다.");
            return false;
        }
        KeyguardManager guard = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if ((guard != null && guard.isKeyguardLocked()) || power == null || !power.isInteractive()) {
            DailyScheduler.status(this, "화면이 잠겼거나 꺼져 있습니다. 잠금 해제된 화면이 필요합니다.");
            return false;
        }
        return true;
    }

    private void start(boolean manualRequest) {
        if (running) return;
        if (!manualRequest && !getSharedPreferences("settings", MODE_PRIVATE)
                .getBoolean("daily_enabled", false)) return;
        if (!ready()) {
            getSharedPreferences("settings", MODE_PRIVATE).edit().putBoolean("run_requested", false).apply();
            if (!manualRequest) DailyScheduler.retry(this, 30);
            return;
        }
        manual = manualRequest;
        running = true;
        stage = Stage.LAUNCH;
        visited.clear(); listPages.clear(); detailText.clear(); ocrPending = false;
        actions = details = listSwipes = detailSwipes = captured = 0;
        startedAt = android.os.SystemClock.elapsedRealtime();
        getSharedPreferences("settings", MODE_PRIVATE).edit()
                .putBoolean("run_requested", false).apply();
        DailyScheduler.status(this, "아이돌챔프 실행 및 안전한 투표 목록 탐색 시작");
        Intent launch = getPackageManager().getLaunchIntentForPackage(PACKAGE);
        if (launch == null) { finish("아이돌챔프 미설치", false); return; }
        try {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            startActivity(launch);
            queueTick(3000);
        } catch (Exception ex) {
            finish("Android가 백그라운드에서 아이돌챔프 실행을 차단했습니다.", false);
        }
    }

    private void queueTick(long millis) {
        if (!running || pendingTick != null) return;
        pendingTick = () -> {
            pendingTick = null;
            process();
        };
        handler.postDelayed(pendingTick, millis);
    }

    private void process() {
        if (!running) return;
        if (!ready()) { finish("화면 또는 Wi-Fi 상태로 자동 탐색 중지", false); return; }
        if (actions >= MAX_ACTIONS || details >= MAX_DETAILS ||
                android.os.SystemClock.elapsedRealtime() - startedAt > MAX_MINUTES * 60_000L) {
            finish("안전한 탐색 한도 도달", true);
            return;
        }
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!correctPackage(root)) {
            finish("아이돌챔프 화면을 읽지 못했습니다. 직접 열려 있는지 확인해 주세요.", false);
            return;
        }
        if (stage == Stage.LAUNCH) {
            AccessibilityNodeInfo tab = findVoteTab(root);
            if (tab != null && safeClick(tab)) {
                stage = Stage.LIST;
                actions++;
                queueTick(1700);
            } else {
                stage = Stage.LIST;
                queueTick(1000);
            }
            return;
        }
        if (stage == Stage.DETAIL) {
            detailText.addAll(allText(root));
            if (detailText.size() > 480) {
                finish("예상하지 못한 상세 화면 데이터", false);
                return;
            }
            // Each visible page is read before scrolling, including text rendered as images.
            // Only public poll fields are parsed; screenshots are never written or uploaded.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && recognizer != null)
                scanVisibleScreenshot();
            else continueDetail();
            return;
        }
        // LIST: only tap explicitly verified, dated public poll cards.
        String page = String.join("|", allText(root));
        String signature = Integer.toHexString(page.hashCode());
        if (listPages.size() > MAX_LIST_SWIPES + MAX_DETAILS + 5) {
            finish("목록 중복 탐색 한도", true); return;
        }
        List<AccessibilityNodeInfo> cards = new ArrayList<>();
        findCards(root, cards, 0);
        for (AccessibilityNodeInfo card : cards) {
            String label = subtree(card, 0, new ArrayList<>());
            if (!CrawlPolicy.safeForCard(label)) continue;
            String id = Integer.toHexString(label.hashCode());
            if (visited.contains(id)) continue;
            visited.add(id);
            if (safeClick(card)) {
                details++; actions++; stage = Stage.DETAIL;
                detailSwipes = 0;
                queueTick(1800);
                return;
            }
        }
        if (listSwipes >= MAX_LIST_SWIPES || !listPages.add(signature)) {
            finish("목록 탐색 종료", true); return;
        }
        if (scroll(root)) {
            listSwipes++; actions++; queueTick(1700);
        } else {
            finish("목록을 더 스크롤할 수 없음", true);
        }
    }

    private void finish(String reason, boolean scanned) {
        running = false;
        ocrPending = false;
        stage = Stage.IDLE;
        if (pendingTick != null) { handler.removeCallbacks(pendingTick); pendingTick = null; }
        String message = reason + " · 상세 " + details + "건 방문 · 투표 " + captured + "건 기록";
        DailyScheduler.status(this, message);
        if (DailyScheduler.onWifi(this)) UploadClient.upload(this, true, null);
        if (!manual) {
            // A zero-record day is *not* a successful collection.
            if (scanned && captured > 0) {
                getSharedPreferences("settings", MODE_PRIVATE).edit()
                    .putString("last_complete_day", DailyPlan.today(System.currentTimeMillis())).apply();
            } else {
                int retry = getSharedPreferences("settings", MODE_PRIVATE).getInt("daily_retries", 0);
                String day = DailyPlan.today(System.currentTimeMillis());
                String last = getSharedPreferences("settings", MODE_PRIVATE).getString("retry_day", "");
                if (!day.equals(last)) retry = 0;
                getSharedPreferences("settings", MODE_PRIVATE).edit()
                    .putString("retry_day", day).putInt("daily_retries", retry + 1).apply();
                if (retry < 2) DailyScheduler.retry(this, 60);
            }
        }
    }

    private void continueDetail() {
        if (!running || stage != Stage.DETAIL) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (!correctPackage(root)) {
            finish("아이돌챔프 화면에서 벗어나 탐색 중지", false);
            return;
        }
        if (detailSwipes < MAX_DETAIL_SWIPES && scroll(root)) {
            detailSwipes++; actions++; queueTick(1350);
            return;
        }
        JSONObject event = PollParser.parse(new ArrayList<>(detailText));
        if (event != null) {
            ObservationStore.add(this, event);
            captured++;
            DailyScheduler.status(this, "수집 중: 상세 " + details + "개 확인, 투표 " + captured + "건 기록");
        }
        detailText.clear(); detailSwipes = 0; stage = Stage.LIST;
        performGlobalAction(GLOBAL_ACTION_BACK);
        actions++; queueTick(1650);
    }

    private void scanVisibleScreenshot() {
        if (ocrPending) return;
        ocrPending = true;
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, command -> handler.post(command),
                    new TakeScreenshotCallback() {
                @Override public void onSuccess(ScreenshotResult screenshot) {
                    Bitmap bitmap = null;
                    try {
                        android.hardware.HardwareBuffer buffer = screenshot.getHardwareBuffer();
                        Bitmap wrapped = Bitmap.wrapHardwareBuffer(buffer,
                                ColorSpace.get(ColorSpace.Named.SRGB));
                        if (wrapped != null) bitmap = wrapped.copy(Bitmap.Config.ARGB_8888, false);
                        if (buffer != null) buffer.close();
                    } catch (Exception ignored) { }
                    if (bitmap == null) {
                        ocrPending = false; continueDetail(); return;
                    }
                    Bitmap copy = bitmap;
                    recognizer.process(InputImage.fromBitmap(copy, 0))
                        .addOnSuccessListener(result -> {
                            if (!running || stage != Stage.DETAIL) return;
                            for (Text.TextBlock block : result.getTextBlocks())
                                for (Text.Line line : block.getLines()) {
                                    String value = line.getText().trim();
                                    if (value.length() >= 2 && value.length() < 201)
                                        detailText.add(value);
                                }
                        })
                        .addOnCompleteListener(task -> {
                            copy.recycle();
                            ocrPending = false;
                            continueDetail();
                        });
                }
                @Override public void onFailure(int errorCode) {
                    ocrPending = false; continueDetail();
                }
            });
        } catch (Exception ignored) {
            ocrPending = false; continueDetail();
        }
    }

    private boolean correctPackage(AccessibilityNodeInfo root) {
        return root != null && root.getPackageName() != null && PACKAGE.contentEquals(root.getPackageName());
    }

    private AccessibilityNodeInfo findVoteTab(AccessibilityNodeInfo root) {
        ArrayList<AccessibilityNodeInfo> found = new ArrayList<>();
        findVoteTabs(root, found, 0);
        AccessibilityNodeInfo choice = null;
        int maxY = -1;
        for (AccessibilityNodeInfo n : found) {
            android.graphics.Rect b = new android.graphics.Rect();
            n.getBoundsInScreen(b);
            if (b.centerY() > maxY) { maxY = b.centerY(); choice = n; }
        }
        return choice;
    }

    private void findVoteTabs(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> found, int depth) {
        if (node == null || depth > 25) return;
        CharSequence t = node.getText();
        if (t == null) t = node.getContentDescription();
        if (t != null && CrawlPolicy.safeTab(t.toString())) found.add(node);
        for (int i = 0; i < node.getChildCount(); i++) findVoteTabs(node.getChild(i), found, depth + 1);
    }

    private void findCards(AccessibilityNodeInfo node, List<AccessibilityNodeInfo> out, int depth) {
        if (node == null || depth > 25 || out.size() >= 100) return;
        if (node.isClickable()) {
            List<String> texts = new ArrayList<>();
            String label = subtree(node, 0, texts);
            if (CrawlPolicy.safeForCard(label)) out.add(node);
        }
        for (int i = 0; i < node.getChildCount(); i++) findCards(node.getChild(i), out, depth + 1);
    }

    private String subtree(AccessibilityNodeInfo node, int depth, List<String> out) {
        if (node == null || depth > 12 || out.size() > 75) return String.join(" ", out);
        CharSequence t = node.getText();
        if (t == null) t = node.getContentDescription();
        if (t != null) {
            String s = t.toString().trim();
            if (s.length() > 0 && s.length() < 201) out.add(s);
        }
        for (int i = 0; i < node.getChildCount(); i++) subtree(node.getChild(i), depth + 1, out);
        return String.join(" ", out);
    }

    private boolean safeClick(AccessibilityNodeInfo node) {
        if (node == null) return false;
        AccessibilityNodeInfo clickTarget = node;
        for (int depth = 0; depth < 5 && clickTarget != null; depth++) {
            if (clickTarget.isClickable() && clickTarget.isEnabled()) {
                String label = subtree(clickTarget, 0, new ArrayList<>());
                // Parent containers with unsafe action labels cannot be clicked.
                if (CrawlPolicy.DENY.matcher(label).find()) return false;
                return clickTarget.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            }
            clickTarget = clickTarget.getParent();
        }
        return false;
    }

    private boolean scroll(AccessibilityNodeInfo root) {
        AccessibilityNodeInfo scrollable = findScrollable(root, 0);
        if (scrollable != null && scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) return true;
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return false;
        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(metrics);
        if (metrics.heightPixels < 400) return false;
        float x = metrics.widthPixels * 0.53f;
        Path swipe = new Path();
        swipe.moveTo(x, metrics.heightPixels * 0.75f);
        swipe.lineTo(x, metrics.heightPixels * 0.30f);
        GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(swipe, 0, 460);
        return dispatchGesture(new GestureDescription.Builder().addStroke(stroke).build(), null, null);
    }

    private AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo node, int depth) {
        if (node == null || depth > 25) return null;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = findScrollable(node.getChild(i), depth + 1);
            if (found != null) return found;
        }
        return node.isScrollable() ? node : null;
    }

    private List<String> allText(AccessibilityNodeInfo root) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        read(root, out, 0);
        return new ArrayList<>(out);
    }

    private void read(AccessibilityNodeInfo node, LinkedHashSet<String> out, int depth) {
        if (node == null || depth > 25 || out.size() >= 250) return;
        if (node.isPassword() || node.isEditable()) return;
        CharSequence t = node.getText();
        if (t != null) add(out, t.toString());
        CharSequence desc = node.getContentDescription();
        if (desc != null) add(out, desc.toString());
        for (int i = 0; i < node.getChildCount(); i++) read(node.getChild(i), out, depth + 1);
    }

    private void add(LinkedHashSet<String> out, String s) {
        String v = s.trim().replaceAll("\\s+", " ");
        if (v.length() >= 2 && v.length() <= 200) out.add(v);
    }

    @Override public void onInterrupt() { finish("서비스 중단", false); }
    @Override public void onDestroy() {
        super.onDestroy();
        if (running) finish("서비스 종료", false);
        if (recognizer != null) recognizer.close();
        instance = new WeakReference<>(null);
    }
}
