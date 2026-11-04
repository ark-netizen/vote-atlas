package io.voteatlas.collector;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.content.SharedPreferences;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public final class MainActivity extends Activity {
    private TextView status;
    private EditText tokenBox;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        layout.setPadding(pad, pad, pad, pad);
        scroll.addView(layout);
        TextView headline = new TextView(this);
        headline.setText("Vote Atlas  |  아이돌챔프");
        headline.setTextSize(23);
        layout.addView(headline);
        TextView intro = new TextView(this);
        intro.setText("\n목표: 매일 오전 9시 30분 아이돌챔프의 공개 투표 화면을 탐색한 뒤 GitHub에 자동 업로드합니다. 처음 한 번만 아래 설정을 완료해 주세요.\n\n※ 화면이 켜지고 잠금이 해제된 상태에서만 자동 탐색을 시도할 수 있습니다. 실제 앱 화면에 따라 수집에 실패할 수 있습니다.\n");
        layout.addView(intro);

        tokenBox = new EditText(this);
        tokenBox.setSingleLine(true);
        tokenBox.setHint("GitHub 저장소 전용 토큰");
        tokenBox.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        layout.addView(tokenBox);
        button(layout, "① GitHub 토큰 저장", v -> {
            String token = tokenBox.getText().toString().trim();
            if (token.isEmpty()) { show("토큰을 입력해 주세요."); return; }
            try { TokenVault.save(this, token); tokenBox.setText(""); show("토큰 암호화 저장 완료"); refresh(); }
            catch (Exception ex) { show("토큰 저장 실패"); }
        });
        button(layout, "② 접근성 권한 켜기", v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        button(layout, "③ 매일 자동 수집 켜기", v -> {
            getSharedPreferences("settings", MODE_PRIVATE).edit().putBoolean("daily_enabled", true).apply();
            DailyScheduler.scheduleDaily(this);
            show("매일 오전 9시 30분 자동 수집 예약 완료. 휴대전화 화면을 켜고 잠금 해제 상태를 유지하세요.");
            refresh();
        });
        button(layout, "바로 자동 탐색 테스트", v -> {
            if (!IdolChampService.requestManualRun(this)) {
                show("접근성 권한의 '아이돌챔프 화면 읽기'를 먼저 켜 주세요.");
            } else { show("아이돌챔프 투표 화면 자동 탐색을 시작합니다."); }
        });
        button(layout, "직접 화면을 열며 수집", v -> {
            getSharedPreferences("settings", MODE_PRIVATE).edit().putBoolean("active", true).apply();
            Intent launch = getPackageManager().getLaunchIntentForPackage("com.nwz.ichampclient");
            if (launch == null) show("아이돌챔프 설치 여부를 확인해 주세요.");
            else { startActivity(launch); show("아이돌챔프 투표 상세 화면을 직접 열어 주세요."); }
            refresh();
        });
        button(layout, "수집된 데이터 GitHub에 지금 전송", v -> {
            show("전송 시도 중");
            UploadClient.upload(this, true, result -> runOnUiThread(() -> { show(result); refresh(); }));
        });
        button(layout, "매일 자동 수집 끄기", v -> {
            getSharedPreferences("settings", MODE_PRIVATE).edit()
                    .putBoolean("daily_enabled", false).putBoolean("run_requested", false).apply();
            show("자동 수집 중지. 이미 예약된 작업도 실행되지 않습니다.");
            refresh();
        });
        button(layout, "직접 화면 읽기 중지", v -> {
            getSharedPreferences("settings", MODE_PRIVATE).edit().putBoolean("active", false).apply();
            refresh();
        });
        button(layout, "저장한 GitHub 토큰 삭제", v -> {
            TokenVault.clear(this); show("토큰 삭제 완료"); refresh();
        });
        status = new TextView(this);
        status.setTextSize(14);
        layout.addView(status);
        setContentView(scroll);
        refresh();
    }

    private void button(LinearLayout box, String title, View.OnClickListener click) {
        Button b = new Button(this);
        b.setText(title);
        b.setAllCaps(false);
        box.addView(b);
        b.setOnClickListener(click);
    }

    private void refresh() {
        if (status == null) return;
        SharedPreferences pref = getSharedPreferences("settings", MODE_PRIVATE);
        boolean daily = pref.getBoolean("daily_enabled", false);
        long next = pref.getLong("next_daily_at", 0);
        String date = next > 0
                ? Instant.ofEpochMilli(next).atZone(ZoneId.of("Asia/Seoul"))
                  .format(DateTimeFormatter.ofPattern("MM월 dd일 HH:mm"))
                : "미정";
        status.setText("\n──────────── 상태 ────────────" +
                "\n매일 자동 수집: " + (daily ? "사용" : "중지") +
                "\n다음 예약: " + (daily ? date : "없음") +
                "\nWi-Fi: " + (DailyScheduler.onWifi(this) ? "연결됨" : "연결되지 않음") +
                "\n업로드 대기: " + ObservationStore.pending(this).length() + "건" +
                "\nGitHub 토큰: " + (TokenVault.read(this).isEmpty() ? "미등록" : "등록됨") +
                "\n최근 결과: " + pref.getString("last_status", "아직 실행되지 않음") +
                "\n\n주의: 아이돌챔프의 모든 투표가 자동 수집되는 것은 실제 휴대전화 실행 검증 전까지 보장되지 않습니다.");
    }

    private void show(String message) {
        android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_LONG).show();
    }

    @Override protected void onResume() {
        super.onResume();
        if (status != null) refresh();
    }
}
