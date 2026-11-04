package com.voteatlas.idolcapture;

import android.accessibilityservice.AccessibilityService;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.hardware.HardwareBuffer;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

public class IdolCaptureService extends AccessibilityService {
    private static final String TARGET="com.nwz.ichampclient";
    private static final int MAX_NODES=700;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private boolean scheduled=false;
    private long lastCapture=0, lastScroll=0, lastScreenshot=0;
    private String lastSignature="";

    @Override protected void onServiceConnected(){
        prefs=getSharedPreferences("capture",MODE_PRIVATE);
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event){
        if(event==null || event.getPackageName()==null ||
           !TARGET.contentEquals(event.getPackageName())) return;
        int type=event.getEventType();
        if(type!=AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
           type!=AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
           type!=AccessibilityEvent.TYPE_VIEW_SCROLLED) return;
        if(scheduled) return;
        scheduled=true;
        String activity=event.getClassName()==null?"":event.getClassName().toString();
        handler.postDelayed(()->{
            scheduled=false;
            capture(activity);
        },1000);
    }
    @Override public void onInterrupt(){
        handler.removeCallbacksAndMessages(null);
        scheduled=false;
    }
    @Override public void onDestroy(){
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
    private static String timestamp(){
        SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX",Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Seoul"));
        return format.format(new Date());
    }
    private static String text(CharSequence value){
        if(value==null) return "";
        String s=value.toString().trim();
        return s.length()>500?s.substring(0,500):s;
    }
    private static void collect(AccessibilityNodeInfo node,JSONArray rows,int level,int[] visited)throws Exception{
        if(node==null||level>30||visited[0]++>=MAX_NODES) return;
        String label=text(node.getText()),description=text(node.getContentDescription());
        if(!label.isEmpty()||!description.isEmpty()){
            JSONObject row=new JSONObject();
            row.put("text",label);
            row.put("description",description);
            row.put("class",text(node.getClassName()));
            row.put("resource_id",node.getViewIdResourceName());
            row.put("clickable",node.isClickable());
            row.put("scrollable",node.isScrollable());
            Rect bounds=new Rect();
            node.getBoundsInScreen(bounds);
            row.put("bounds",new JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom));
            rows.put(row);
        }
        for(int i=0;i<node.getChildCount()&&visited[0]<MAX_NODES;i++){
            AccessibilityNodeInfo child=node.getChild(i);
            if(child!=null) collect(child,rows,level+1,visited);
        }
    }
    private static String sha(String input)throws Exception{
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder result=new StringBuilder();
        for(byte b:hash)result.append(String.format(Locale.ROOT,"%02x",b&255));
        return result.toString();
    }
    private void capture(String activity){
        if(prefs==null)prefs=getSharedPreferences("capture",MODE_PRIVATE);
        if(prefs.getInt("count",0)>=600) return;
        AccessibilityNodeInfo root=getRootInActiveWindow();
        if(root==null||root.getPackageName()==null||
           !TARGET.contentEquals(root.getPackageName()))return;
        try{
            JSONArray nodes=new JSONArray();
            collect(root,nodes,0,new int[]{0});
            long now=SystemClock.uptimeMillis();
            String fingerprint=sha(nodes.toString());
            boolean changed=!fingerprint.equals(lastSignature)||now-lastCapture>30000;
            if(changed&&now-lastCapture>=1000){
                JSONObject report=new JSONObject();
                String seen=timestamp();
                report.put("observed_at",seen);
                report.put("app","idolchamp");
                report.put("package",TARGET);
                report.put("activity",activity);
                report.put("node_count",nodes.length());
                report.put("nodes",nodes);
                report.put("screen_signature",fingerprint);
                report.put("source_compared",false);
                report.put("lineup_complete",false);
                File file=new File(getFilesDir(),"records.jsonl");
                try(FileOutputStream output=new FileOutputStream(file,true)){
                    output.write((report.toString()+"\n").getBytes(StandardCharsets.UTF_8));
                }
                prefs.edit().putInt("count",prefs.getInt("count",0)+1)
                    .putString("last_seen",seen).apply();
                lastSignature=fingerprint;lastCapture=now;
                if(prefs.getBoolean("screenshots",false)&&now-lastScreenshot>6500&&
                   prefs.getInt("screenshots_count",0)<150){
                    lastScreenshot=now;
                    screenshot();
                }
            }
            autoScroll(root);
        }catch(Exception e){
            android.util.Log.w("VoteAtlasIdol","No visible screen capture",e);
        }
    }
    private static AccessibilityNodeInfo scrollContainer(AccessibilityNodeInfo node,int depth){
        if(node==null||depth>18)return null;
        Rect bounds=new Rect();
        node.getBoundsInScreen(bounds);
        if(node.isScrollable()&&bounds.height()>240)return node;
        for(int i=0;i<node.getChildCount();i++){
            AccessibilityNodeInfo found=scrollContainer(node.getChild(i),depth+1);
            if(found!=null)return found;
        }
        return null;
    }
    private void autoScroll(AccessibilityNodeInfo root){
        if(!prefs.getBoolean("auto_scroll",false))return;
        int count=prefs.getInt("scroll_steps",0);
        long now=SystemClock.uptimeMillis();
        if(count>=18||now-lastScroll<2300)return;
        AccessibilityNodeInfo container=scrollContainer(root,0);
        if(container!=null&&container.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)){
            lastScroll=now;
            prefs.edit().putInt("scroll_steps",count+1).apply();
        }
    }
    private void screenshot(){
        try{
            takeScreenshot(Display.DEFAULT_DISPLAY,getMainExecutor(),new TakeScreenshotCallback(){
                @Override public void onSuccess(ScreenshotResult result){
                    AccessibilityNodeInfo active=getRootInActiveWindow();
                    if(active==null||active.getPackageName()==null||
                       !TARGET.contentEquals(active.getPackageName()))return;
                    HardwareBuffer buffer=result.getHardwareBuffer();
                    try{
                        Bitmap hardware=Bitmap.wrapHardwareBuffer(buffer,result.getColorSpace());
                        if(hardware==null)return;
                        Bitmap bitmap=hardware.copy(Bitmap.Config.ARGB_8888,false);
                        if(bitmap==null)return;
                        File folder=new File(getFilesDir(),"screenshots");
                        if(!folder.exists()&&!folder.mkdirs())return;
                        File file=new File(folder,"idolchamp-"+System.currentTimeMillis()+".png");
                        try(FileOutputStream out=new FileOutputStream(file)){
                            bitmap.compress(Bitmap.CompressFormat.PNG,90,out);
                        }
                        bitmap.recycle();
                        prefs.edit().putInt("screenshots_count",prefs.getInt("screenshots_count",0)+1).apply();
                    }catch(Exception e){
                        android.util.Log.w("VoteAtlasIdol","Screenshot unavailable",e);
                    }finally{buffer.close();}
                }
                @Override public void onFailure(int errorCode){
                    android.util.Log.w("VoteAtlasIdol","Screenshot rejected: "+errorCode);
                }
            });
        }catch(Exception e){android.util.Log.w("VoteAtlasIdol","Screenshot API unavailable",e);}
    }
}
