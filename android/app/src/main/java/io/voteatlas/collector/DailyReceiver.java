package io.voteatlas.collector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class DailyReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        String action = intent == null ? "" : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            if (ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)
                    .getBoolean("daily_enabled", false)) DailyScheduler.scheduleDaily(ctx);
            return;
        }
        if (!DailyScheduler.ACTION_DAILY.equals(action) && !DailyScheduler.ACTION_RETRY.equals(action)) return;
        if (!ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)
                .getBoolean("daily_enabled", false)) return;
        if (DailyScheduler.ACTION_DAILY.equals(action)) DailyScheduler.scheduleDaily(ctx);
        if (DailyPlan.today(System.currentTimeMillis()).equals(
                ctx.getSharedPreferences("settings", Context.MODE_PRIVATE).getString("last_complete_day", ""))) {
            return;
        }
        IdolChampService.requestScheduledRun(ctx);
    }
}
