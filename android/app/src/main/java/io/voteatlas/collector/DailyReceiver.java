package io.voteatlas.collector;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class DailyReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        String action = intent == null ? "" : intent.getAction();
        boolean enabled = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)
                .getBoolean("daily_enabled", false);
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            if (enabled) DailyScheduler.scheduleDaily(ctx);
            return;
        }
        if (!enabled || (!DailyScheduler.ACTION_DAILY.equals(action)
                && !DailyScheduler.ACTION_RETRY.equals(action))) return;
        if (DailyScheduler.ACTION_DAILY.equals(action)) DailyScheduler.scheduleDaily(ctx);
        if (ObservationStore.pending(ctx).length() == 0) {
            DailyScheduler.status(ctx, "전송할 새 캡처 자료 없음");
            return;
        }
        if (!DailyScheduler.onWifi(ctx)) {
            DailyScheduler.status(ctx, "Wi-Fi 미연결. 대기 자료는 보관 중");
            DailyScheduler.retry(ctx, 60);
            return;
        }
        // goAsync keeps broadcast active while the small HTTPS upload completes.
        final PendingResult pending = goAsync();
        UploadClient.upload(ctx, true, result -> {
            DailyScheduler.status(ctx, result);
            pending.finish();
        });
    }
}
