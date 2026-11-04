package com.voteatlas.idolcapture;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.zip.*;
import org.json.JSONObject;

public class MainActivity extends Activity {
  private static final int EXPORT_REQUEST=901;
  private static final String IDOLCHAMP="com.nwz.ichampclient";
  private SharedPreferences prefs;
  private TextView status;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    prefs=getSharedPreferences("capture",MODE_PRIVATE);
    ScrollView scroll=new ScrollView(this);
    LinearLayout root=new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    int pad=(int)(20*getResources().getDisplayMetrics().density);
    root.setPadding(pad,pad,pad,pad);scroll.addView(root);
    label(root,"아이돌챔프 앱 실제 화면 수집",22);
    label(root,"아이돌챔프 내 모든 투표 유형을 직접 탐색하며 화면 텍스트를 로컬 기록합니다. 다른 앱은 수집하지 않습니다.",15);
    status=label(root,"",15);
    button(root,"1. 접근성 수집 서비스 활성화",v->
      startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
    button(root,"2. 아이돌챔프 앱 열기",v->{
      Intent launch=getPackageManager().getLaunchIntentForPackage(IDOLCHAMP);
      if(launch!=null) startActivity(launch);
      else {
        Toast.makeText(this,"아이돌챔프를 먼저 설치하세요.",Toast.LENGTH_LONG).show();
        try {startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("market://details?id="+IDOLCHAMP)));}
        catch(Exception e){startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/apps/details?id="+IDOLCHAMP)));}
      }
    });
    label(root,"3. 아이돌챔프 투표 탭 → 각 투표 분류 → 목록 → 투표 상세·리워드 화면을 탐색하세요. 전환 시 화면 내용이 기록됩니다.",15);
    Switch auto=new Switch(this);auto.setText("자동 스크롤 (최대 18번, 클릭하지 않음)");
    auto.setChecked(prefs.getBoolean("auto_scroll",false));
    auto.setOnCheckedChangeListener((b,on)->{
      prefs.edit().putBoolean("auto_scroll",on).putInt("scroll_steps",0).apply();refresh();
    });root.addView(auto);
    Switch screenshot=new Switch(this);
    screenshot.setText("스크린샷도 저장 (계정 정보 포함 가능)");
    screenshot.setChecked(prefs.getBoolean("screenshots",false));
    screenshot.setOnCheckedChangeListener((b,on)->prefs.edit().putBoolean("screenshots",on).apply());
    root.addView(screenshot);
    button(root,"다른 투표 탭 탐색: 스크롤 횟수 초기화",v->{
      prefs.edit().putInt("scroll_steps",0).apply();refresh();
    });
    button(root,"4. 수집 결과 ZIP 내보내기",v->{
      Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("application/zip");
      intent.putExtra(Intent.EXTRA_TITLE,"idolchamp-capture-"+System.currentTimeMillis()+".zip");
      startActivityForResult(intent,EXPORT_REQUEST);
    });
    button(root,"상태 새로고침",v->refresh());
    button(root,"이 기기의 수집 기록 전부 삭제",v->
      new AlertDialog.Builder(this).setTitle("수집 기록 삭제")
      .setMessage("저장된 화면 텍스트와 스크린샷을 모두 삭제합니다.")
      .setNegativeButton("취소",null)
      .setPositiveButton("삭제",(d,w)->{
        new File(getFilesDir(),"records.jsonl").delete();
        File[] shots=new File(getFilesDir(),"screenshots").listFiles();
        if(shots!=null) for(File f:shots) f.delete();
        prefs.edit().putInt("count",0).putInt("screenshots_count",0).putInt("scroll_steps",0).apply();
        refresh();
      }).show());
    label(root,"인터넷 권한이 없으므로 자동 업로드하지 않습니다. 투표·결제·광고·로그인 조작 없이 공개 화면만 기록합니다. 사용 후 접근성 권한을 해제하세요.",14);
    setContentView(scroll);refresh();
  }
  private TextView label(LinearLayout root,String text,int size){
    TextView v=new TextView(this);v.setText(text);v.setTextSize(size);v.setPadding(0,8,0,16);
    root.addView(v);return v;
  }
  private void button(LinearLayout root,String text,View.OnClickListener listener){
    Button v=new Button(this);v.setText(text);v.setAllCaps(false);v.setOnClickListener(listener);root.addView(v);
  }
  private void refresh(){
    if(status!=null) status.setText("기록: "+prefs.getInt("count",0)+"개 · 스크린샷: "
      +prefs.getInt("screenshots_count",0)+"장 · 스크롤: "+prefs.getInt("scroll_steps",0)
      +"/18\n최근 수집: "+prefs.getString("last_seen","없음"));
  }
  @Override protected void onResume(){super.onResume();refresh();}
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request!=EXPORT_REQUEST||result!=RESULT_OK||data==null||data.getData()==null) return;
    try(OutputStream stream=getContentResolver().openOutputStream(data.getData());
        ZipOutputStream zip=new ZipOutputStream(stream)){
      JSONObject manifest=new JSONObject();
      manifest.put("schema_version",1);
      manifest.put("source","idolchamp_physical_android_accessibility");
      manifest.put("package",IDOLCHAMP);
      manifest.put("snapshot_count",prefs.getInt("count",0));
      manifest.put("lineup_complete",false);
      writeBytes(zip,"manifest.json",manifest.toString(2).getBytes(StandardCharsets.UTF_8));
      File records=new File(getFilesDir(),"records.jsonl");
      if(records.exists()) addFile(zip,records,"records.jsonl");
      File[] shots=new File(getFilesDir(),"screenshots").listFiles();
      if(shots!=null)for(File f:shots)if(f.isFile()&&f.getName().endsWith(".png"))
        addFile(zip,f,"screenshots/"+f.getName());
      Toast.makeText(this,"파일 저장 완료. 이 ZIP 파일을 채팅에 올려주세요.",Toast.LENGTH_LONG).show();
    }catch(Exception e){
      Toast.makeText(this,"내보내기 오류: "+e.getClass().getSimpleName(),Toast.LENGTH_LONG).show();
    }
  }
  private static void writeBytes(ZipOutputStream zip,String name,byte[] bytes)throws Exception{
    zip.putNextEntry(new ZipEntry(name));zip.write(bytes);zip.closeEntry();
  }
  private static void addFile(ZipOutputStream zip,File file,String name)throws Exception{
    zip.putNextEntry(new ZipEntry(name));
    try(InputStream in=new FileInputStream(file)){
      byte[] buffer=new byte[8192];int length;
      while((length=in.read(buffer))!=-1) zip.write(buffer,0,length);
    }
    zip.closeEntry();
  }
}
