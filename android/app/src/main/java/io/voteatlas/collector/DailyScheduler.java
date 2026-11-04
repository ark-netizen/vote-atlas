package io.voteatlas.collector;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;

final class DailyScheduler {
    static final String ACTION_DAILY = "io.voteatlas.collector.DAILY";
    static final String ACTION_RETRY = "io.voteatlas.collector.RETRY";
    static final int HOUR = 9;
    static final int MINUTE = 30;

    private DailyScheduler() {}

    static void scheduleDaily(Context ctx) {
        long trigger = DailyPlan.nextRun(System.currentTimeMillis(), HOUR, MINUTE);
        schedule(ctx, ACTION_DAILY, 1701, trigger);
        ctx.getSharedPreferences("settings", Context.MODE_PRIVATE).edit()
                .putLong("next_daily_at", trigger).apply();
    }

    static void retry(Context ctx, int minutes) {
        schedule(ctx, ACTION_RETRY, 1702, System.currentTimeMillis() + minutes * 60_000L);
    }

    private static void schedule(Context ctx, String action, int requestCode, long time) {
        AlarmManager alarm = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        Intent intent = new Intent(ctx, DailyReceiver.class).setAction(action);
        PendingIntent pending = PendingIntent.getBroadcast(ctx, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pending);
    }

    static boolean onWifi(Context ctx) {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null || cm.getActiveNetwork() == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
    }

    static void status(Context ctx, String value) {
        ctx.getSharedPreferences("settings", Context.MODE_PRIVATE).edit()
                .putString("last_status", value)
                .putLong("last_status_at", System.currentTimeMillis()).apply();
    }
}
