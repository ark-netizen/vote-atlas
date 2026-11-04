package io.voteatlas.collector;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.Text;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int PICK_IMAGE = 2409;
    private EditText tokenBox;
    private EditText titleBox;
    private EditText periodBox;
    private EditText extractedBox;
    private TextView status;
    private TextView recognitionStatus;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int p = (int) (18 * getResources().getDisplayMetrics().density);
        content.setPadding(p, p, p, p);
        scroll.addView(content);

        TextView header = label("Vote Atlas · 아이돌챔프", 24);
        content.addView(header);
        content.addView(label("\n보안 강화판 · 버전 0.4\n\n아이돌챔프 투표 화면을 캡처한 다음, 여기서 사진을 선택하면 휴대전화에서 한글을 인식합니다. 내용을 확인하고 저장하면 GitHub에 전송합니다.\n\n접근성 권한은 요청하지 않습니다. 매일 자동으로 아이돌챔프를 탐색하는 기능은 지원하지 않으며, 예약된 작업은 저장한 자료의 재전송만 합니다.\n", 14));

        content.addView(label("1. GitHub 연결 (최초 한 번)", 17));
        tokenBox = new EditText(this);
        tokenBox.setHint("vote-atlas 저장소 전용 GitHub 토큰");
        tokenBox.setSingleLine(true);
        tokenBox.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        content.addView(tokenBox);
        button(content, "GitHub 토큰 암호화 저장", v -> {
            String token = tokenBox.getText().toString().trim();
            if (token.isEmpty()) { toast("토큰을 입력해 주세요."); return; }
            try {
                TokenVault.save(this, token);
                tokenBox.setText("");
                toast("저장했습니다.");
                refresh();
            } catch (Exception ex) { toast("토큰 저장 실패"); }
        });

        content.addView(label("\n2. 아이돌챔프 투표 화면 가져오기", 17));
        button(content, "아이돌챔프 앱 열기", v -> {
            Intent launch = getPackageManager().getLaunchIntentForPackage("com.nwz.ichampclient");
            if (launch != null) startActivity(launch);
            else new AlertDialog.Builder(this)
                    .setTitle("아이돌챔프 앱이 없습니다")
                    .setMessage("아이돌챔프를 먼저 Google Play에서 설치해 주세요.")
                    .setPositiveButton("확인", null).show();
        });
        button(content, "스크린샷 선택 · 한글 자동 인식", v -> chooseScreenshot());
        recognitionStatus = label("선택된 사진 없음", 13);
        content.addView(recognitionStatus);

        content.addView(label("\n투표명 (자동 인식이 틀리면 입력)", 13));
        titleBox = new EditText(this);
        titleBox.setSingleLine(true);
        titleBox.setHint("선택 사항: 11월 최고의 아이돌");
        content.addView(titleBox);

        content.addView(label("투표 기간 (인식이 잘 안 되면 입력)", 13));
        periodBox = new EditText(this);
        periodBox.setSingleLine(true);
        periodBox.setHint("예: 2026.11.04 ~ 2026.11.11");
        content.addView(periodBox);

        content.addView(label("인식된 글자 (수정할 수 있음)", 13));
        extractedBox = new EditText(this);
        extractedBox.setMinLines(5);
        extractedBox.setMaxLines(12);
        extractedBox.setGravity(android.view.Gravity.TOP);
        extractedBox.setHint("스크린샷을 선택하면 자동으로 내용이 채워집니다.");
        content.addView(extractedBox);

        button(content, "3. 추출 결과 확인 후 저장·전송", v -> confirmAndSave());
        button(content, "GitHub에 지금 재전송", v -> syncNow());
        button(content, "매일 오전 9:30 대기 데이터 재전송 켜기", v -> {
            getSharedPreferences("settings", MODE_PRIVATE).edit().putBoolean("daily_enabled", true).apply();
            DailyScheduler.scheduleDaily(this);
            refresh();
            toast("매일 오전 9:30 동기화 예약 완료 (새 투표 자동 탐색 아님)");
        });
        button(content, "자동 재전송 끄기", v -> {
            getSharedPreferences("settings", MODE_PRIVATE).edit().putBoolean("daily_enabled", false).apply();
            refresh();
        });
        button(content, "GitHub 토큰 삭제", v -> {
            TokenVault.clear(this); refresh();
            toast("토큰을 삭제했습니다.");
        });

        status = label("", 14);
        content.addView(status);
        setContentView(scroll);
        refresh();
        Intent incoming = getIntent();
        if (incoming != null && Intent.ACTION_SEND.equals(incoming.getAction())
                && incoming.getType() != null && incoming.getType().startsWith("image/")) {
            Uri sharedImage = incoming.getParcelableExtra(Intent.EXTRA_STREAM);
            if (sharedImage != null) readScreenshot(sharedImage);
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction())
                && intent.getType() != null && intent.getType().startsWith("image/")) {
            Uri sharedImage = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (sharedImage != null) readScreenshot(sharedImage);
        }
    }

    private TextView label(String text, int size) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        return view;
    }

    private void button(LinearLayout box, String name, View.OnClickListener cb) {
        Button button = new Button(this);
        button.setText(name);
        button.setAllCaps(false);
        box.addView(button);
        button.setOnClickListener(cb);
    }

    private void chooseScreenshot() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("image/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(intent, PICK_IMAGE);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_IMAGE || result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        readScreenshot(uri);
    }

    private void readScreenshot(Uri uri) {
        recognitionStatus.setText("선택한 이미지를 휴대전화 내부에서 분석하고 있습니다.");
        try {
            InputImage image = InputImage.fromFilePath(this, uri);
            TextRecognizer recognizer = TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build());
            recognizer.process(image)
                    .addOnSuccessListener(resultText -> {
                        List<String> lines = new ArrayList<>();
                        for (Text.TextBlock block : resultText.getTextBlocks()) {
                            for (Text.Line line : block.getLines()) {
                                String value = line.getText().trim();
                                if (!value.isEmpty()) lines.add(value);
                            }
                        }
                        String output = String.join("\n", lines);
                        extractedBox.setText(output);
                        recognitionStatus.setText(lines.isEmpty()
                                ? "인식된 글자가 없습니다. 다른 캡처 화면을 선택해 주세요."
                                : "한글 인식 완료 · " + lines.size() + "줄. 내용과 날짜를 확인해 주세요.");
                        recognizer.close();
                    })
                    .addOnFailureListener(error -> {
                        recognizer.close();
                        recognitionStatus.setText("글자 인식 실패. 다른 이미지로 다시 시도해 주세요.");
                    });
        } catch (Exception error) {
            recognitionStatus.setText("이미지를 열지 못했습니다. 다운로드 폴더의 캡처 파일을 선택해 주세요.");
        }
    }

    private void confirmAndSave() {
        String raw = extractedBox.getText().toString().trim();
        if (raw.length() < 12) {
            toast("투표 화면을 캡처하거나 인식된 텍스트를 입력해 주세요.");
            return;
        }
        String period = periodBox.getText().toString().trim();
        List<String> lines = new ArrayList<>();
        for (String s : raw.split("\\r?\\n")) {
            String clean = s.trim();
            if (!clean.isEmpty()) lines.add(clean);
        }
        if (!period.isEmpty()) lines.add("투표 기간 " + period);
        JSONObject item = PollParser.parse(lines, titleBox.getText().toString().trim());
        if (item == null) {
            new AlertDialog.Builder(this)
                    .setTitle("추출 정보가 부족합니다")
                    .setMessage("투표명과 시작·종료 날짜(연도 포함)가 필요합니다. 예: 2026.11.04 ~ 2026.11.11\n\n인식된 글자를 수정하거나 투표 기간을 입력한 후 다시 눌러 주세요.")
                    .setPositiveButton("확인", null).show();
            return;
        }
        String details = "투표명: " + item.optString("title") +
                "\n기간: " + item.optString("start") + " ~ " + item.optString("end") +
                "\n후보: " + item.optJSONArray("candidates").length() + "건" +
                "\n리워드 문구: " + item.optJSONArray("reward_lines").length() + "건" +
                "\n\n이 항목만 공개 GitHub 저장소에 업로드합니다. 원본 스크린샷과 인식한 전체 글자는 업로드하지 않습니다.";
        new AlertDialog.Builder(this)
                .setTitle("내용을 확인해 주세요")
                .setMessage(details)
                .setNegativeButton("수정하기", null)
                .setPositiveButton("저장 및 전송", (dialog, which) -> {
                    ObservationStore.add(this, item);
                    refresh();
                    if (TokenVault.read(this).isEmpty()) {
                        toast("대기열에 저장했습니다. GitHub 토큰을 등록하면 전송할 수 있습니다.");
                    } else {
                        syncNow();
                    }
                }).show();
    }

    private void syncNow() {
        if (!DailyScheduler.onWifi(this)) {
            toast("Wi-Fi를 연결하면 전송할 수 있습니다. 데이터는 휴대전화에 저장되어 있습니다.");
            return;
        }
        UploadClient.upload(this, true, result -> runOnUiThread(() -> {
            toast(result);
            refresh();
        }));
    }

    private void refresh() {
        if (status == null) return;
        SharedPreferences settings = getSharedPreferences("settings", MODE_PRIVATE);
        long next = settings.getLong("next_daily_at", 0);
        String when = next > 0
                ? Instant.ofEpochMilli(next).atZone(ZoneId.of("Asia/Seoul"))
                    .format(DateTimeFormatter.ofPattern("MM월 dd일 HH:mm"))
                : "미설정";
        status.setText("\n──────── 현재 상태 ────────" +
                "\nGitHub 토큰: " + (TokenVault.read(this).isEmpty() ? "미등록" : "등록됨") +
                "\nWi-Fi: " + (DailyScheduler.onWifi(this) ? "연결됨" : "연결되지 않음") +
                "\n업로드 대기: " + ObservationStore.pending(this).length() + "건" +
                "\n재전송 예약: " + (settings.getBoolean("daily_enabled", false) ? when : "꺼짐") +
                "\n최근 상태: " + settings.getString("last_status", "없음") +
                "\n\n※ 보안 강화판은 사용자가 선택한 스크린샷만 분석합니다. 아이돌챔프 앱을 자동으로 실행하거나 투표하지 않습니다.");
    }

    private void toast(String message) {
        android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_LONG).show();
    }

    @Override protected void onResume() {
        super.onResume();
        if (status != null) refresh();
    }
}
