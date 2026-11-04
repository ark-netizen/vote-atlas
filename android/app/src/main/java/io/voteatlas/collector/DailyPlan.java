package io.voteatlas.collector;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

final class DailyPlan {
    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private DailyPlan() {}

    static long nextRun(long nowMs, int hour, int minute) {
        ZonedDateTime now = Instant.ofEpochMilli(nowMs).atZone(SEOUL);
        ZonedDateTime next = now.toLocalDate().atTime(LocalTime.of(hour, minute)).atZone(SEOUL);
        if (!next.isAfter(now)) next = next.plusDays(1);
        return next.toInstant().toEpochMilli();
    }

    static String today(long nowMs) {
        return Instant.ofEpochMilli(nowMs).atZone(SEOUL).toLocalDate().toString();
    }
}
