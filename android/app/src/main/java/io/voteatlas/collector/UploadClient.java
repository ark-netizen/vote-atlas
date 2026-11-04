package io.voteatlas.collector;

import android.content.Context;
import android.util.Base64;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

final class UploadClient {
    interface Callback { void complete(String message); }
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);
    private static volatile long lastAttempt = 0;
    private UploadClient() {}

    static void upload(Context ctx, boolean immediate, Callback callback) {
        Context app = ctx.getApplicationContext();
        if (!immediate && System.currentTimeMillis() - lastAttempt < 10 * 60 * 1000) return;
        if (!BUSY.compareAndSet(false, true)) return;
        lastAttempt = System.currentTimeMillis();
        EXECUTOR.execute(() -> {
            String result;
            try {
                String token = TokenVault.read(app);
                if (token.isEmpty()) throw new IllegalStateException("GitHub 토큰 미등록");
                JSONArray items = ObservationStore.pending(app);
                if (items.length() == 0) throw new IllegalStateException("전송할 투표 데이터 없음");
                JSONObject body = new JSONObject();
                String at = OffsetDateTime.now(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
                body.put("schema_version", 1);
                body.put("app", "idolchamp");
                body.put("collected_at", at);
                body.put("events", items);
                String date = at.substring(0, 10);
                String suffix = String.valueOf(System.currentTimeMillis());
                String path = "incoming/idolchamp/" + date + "/" + suffix + ".json";
                JSONObject request = new JSONObject();
                request.put("message", "Import on-device IdolChamp public vote observations");
                request.put("content", Base64.encodeToString(body.toString(2).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
                URL url = new URL("https://api.github.com/repos/ark-netizen/vote-atlas/contents/" + path);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                try {
                    connection.setRequestMethod("PUT");
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(12000);
                    connection.setReadTimeout(20000);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Authorization", "Bearer " + token);
                    connection.setRequestProperty("Accept", "application/vnd.github+json");
                    connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    try (OutputStream out = connection.getOutputStream()) {
                        out.write(request.toString().getBytes(StandardCharsets.UTF_8));
                    }
                    int code = connection.getResponseCode();
                    if (code != 201) throw new IllegalStateException("GitHub 응답 " + code + " (권한/인터넷 확인)");
                    ObservationStore.removeUploaded(app, items);
                    result = items.length() + "건 업로드 완료";
                } finally { connection.disconnect(); }
            } catch (Exception ex) {
                result = ex.getMessage() == null ? "업로드 실패" : ex.getMessage();
            } finally { BUSY.set(false); }
            DailyScheduler.status(app, "GitHub 업로드: " + result);
            if (callback != null) callback.complete(result);
        });
    }
}
