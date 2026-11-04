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
        headline.setText("Vote Atlas  |  아이돌챔프 수집기");
        headline.setTextSize(22);
        layout.addView(headline);
        TextView intro = new TextView(this);
        intro.setText("\n실제 아이돌챔프 앱에서 표시되는 공개 투표 정보를 수집합니다. 최초 버전은 투표 목록과 상세 화면을 직접 열어야 하며, 투표·로그인·결제 버튼을 자동으로 누르지 않습니다.\n");
        layout.addView(intro);

        tokenBox = new EditText(this);
        tokenBox.setSingleLine(true);
        tokenBox.setHint("GitHub fine-grained 토큰 입력 (Contents: Read and write)");
        tokenBox.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        layout.addView(tokenBox);
        button(layout, "1. GitHub 토큰 암호화 저장", v -> {
            String token = tokenBox.getText().toString().trim();
            if (token.isEmpty()) { show("토큰을 입력해 주세요."); return; }
            try { TokenVault.save(this, token); tokenBox.setText(""); show("휴대전화 보안 저장소에 토큰을 저장했습니다."); }
            catch (Exception ex) { show("토큰 저장 실패"); }
        });
        button(layout, "2. 접근성 권한 설정 열기", v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        button(layout, "3. 수집 시작 + 아이돌챔프 열기", v -> {
            getSharedPreferences("settings", MODE_PRIVATE).edit().putBoolean("active", true).apply();
            Intent launch = getPackageManager().getLaunchIntentForPackage("com.nwz.ichampclient");
            if (launch == null) show("아이돌챔프가 설치되어 있는지 확인해 주세요.");
            else { show("투표 탭과 각 투표의 상세 화면을 순서대로 열어 주세요."); startActivity(launch); }
        });
        button(layout, "수집된 데이터 지금 GitHub에 올리기", v -> {
            show("전송 시도 중…");
            UploadClient.upload(this, true, result -> runOnUiThread(() -> { show(result); refresh(); }));
        });
        button(layout, "수집 중지", v -> {
            getSharedPreferences("settings", MODE_PRIVATE).edit().putBoolean("active", false).apply();
            refresh();
        });
        button(layout, "저장된 GitHub 토큰 삭제", v -> {
            TokenVault.clear(this); show("저장된 토큰을 삭제했습니다.");
        });
        status = new TextView(this);
        status.setTextSize(15);
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
        boolean active = getSharedPreferences("settings", MODE_PRIVATE).getBoolean("active", false);
        status.setText("\n수집: " + (active ? "사용 중" : "중지") +
                "\n업로드 대기: " + ObservationStore.pending(this).length() + "건" +
                "\n토큰: " + (TokenVault.read(this).isEmpty() ? "미등록" : "등록됨"));
    }

    private void show(String message) {
        android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_LONG).show();
    }

    @Override protected void onResume() {
        super.onResume();
        if (status != null) refresh();
    }
}
