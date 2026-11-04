package io.voteatlas.collector;

import android.app.Activity;
import android.app.AlertDialog;
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
    private EditText token;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int dp = (int)(18 * getResources().getDisplayMetrics().density);
        layout.setPadding(dp, dp, dp, dp);
        scroll.addView(layout);

        TextView title = label("Vote Atlas  ·  자동 수집", 24);
        layout.addView(title);
        layout.addView(label("\n버전 0.5 · 갤럭시 S10e\n\n앱을 한 번 실행하고 '자동 수집 시작'을 누르면 아이돌챔프의 공개 투표 목록과 상세 화면을 자동으로 이동해 투표 데이터 수집을 시도합니다.\n\n화면이 켜지고 잠금 해제되어 있어야 합니다. 자동 투표, 구매, 광고 시청은 하지 않습니다. 화면 구성에 따라 일부 데이터는 수집되지 않을 수 있습니다.\n", 14));

        button(layout, "① 접근성 권한 설정 (처음 한 번)", v ->
                startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        layout.addView(label("\n② GitHub 연결 (처음 한 번)", 16));
        token = new EditText(this);
        token.setHint("vote-atlas 저장소 전용 토큰");
        token.setSingleLine(true);
        token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        layout.addView(token);
        button(layout, "GitHub 토큰 암호화 저장", v -> {
            String value = token.getText().toString().trim();
            if (value.isEmpty()) { toast("토큰을 입력해 주세요."); return; }
            try {
                TokenVault.save(this, value);
                token.setText("");
                toast("GitHub 토큰을 저장했습니다.");
                refresh();
            } catch (Exception ignored) { toast("토큰 저장 실패"); }
        });
        layout.addView(label("\n③ 자동 수집 실행", 16));
        button(layout, "자동 수집 시작 · 아이돌챔프 열기", v -> {
            if (!DailyScheduler.onWifi(this)) { toast("Wi-Fi를 먼저 연결해 주세요."); return; }
            if (!IdolChampService.requestManualRun(this)) {
                new AlertDialog.Builder(this).setTitle("접근성 서비스 설정이 필요합니다")
                    .setMessage("설정 → 접근성 → 설치된 앱 → '아이돌챔프 자동 수집'을 켜 주세요. 이 권한은 아이돌챔프 화면 이동과 텍스트 읽기에 사용합니다.")
                    .setNegativeButton("닫기", null)
                    .setPositiveButton("설정 열기", (d, w) ->
                        startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))).show();
            } else toast("아이돌챔프를 열고 투표 화면 자동 탐색을 시작합니다.");
        });
        button(layout, "자동 수집 중지", v -> {
            if (IdolChampService.requestStop(this)) toast("수집 중지 요청 완료");
            else toast("활성화된 자동 탐색 서비스가 없습니다.");
        });
        button(layout, "수집 결과 GitHub에 지금 전송", v -> {
            UploadClient.upload(this, true, result -> runOnUiThread(() -> {
                toast(result); refresh();
            }));
        });
        button(layout, "저장한 GitHub 토큰 삭제", v -> {
            TokenVault.clear(this); toast("토큰 삭제 완료"); refresh();
        });
        status = label("", 14);
        layout.addView(status);
        setContentView(scroll);
        refresh();
    }

    private TextView label(String text, int size) {
        TextView t = new TextView(this);
        t.setText(text); t.setTextSize(size);
        return t;
    }
    private void button(LinearLayout layout, String text, View.OnClickListener handler) {
        Button b = new Button(this);
        b.setText(text); b.setAllCaps(false);
        b.setOnClickListener(handler); layout.addView(b);
    }
    private void toast(String value) {
        android.widget.Toast.makeText(this,value,android.widget.Toast.LENGTH_LONG).show();
    }
    private void refresh() {
        if (status == null) return;
        status.setText("\n────── 수집 상태 ──────" +
                "\nWi-Fi: " + (DailyScheduler.onWifi(this) ? "연결됨" : "연결되지 않음") +
                "\nGitHub: " + (TokenVault.read(this).isEmpty() ? "미연결" : "토큰 등록됨") +
                "\n업로드 대기: " + ObservationStore.pending(this).length() + "건" +
                "\n최근 결과: " + getSharedPreferences("settings", MODE_PRIVATE)
                    .getString("last_status","아직 실행한 기록이 없습니다.") +
                "\n\n중요: 실제 아이돌챔프 화면에서 수집 정확도는 아직 검증되지 않았습니다. 최신 결과는 이 화면으로 돌아와 확인하세요.");
    }
    @Override protected void onResume() {super.onResume();refresh();}
}
