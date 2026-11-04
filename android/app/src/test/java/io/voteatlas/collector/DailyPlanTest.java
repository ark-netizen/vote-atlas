package io.voteatlas.collector;

import org.junit.Test;
import java.time.ZonedDateTime;
import static org.junit.Assert.*;

public class DailyPlanTest {
    @Test public void schedulesTodayBeforeTime() {
        long before = ZonedDateTime.of(2026, 11, 4, 8, 40, 0, 0, DailyPlan.SEOUL).toInstant().toEpochMilli();
        long expected = ZonedDateTime.of(2026, 11, 4, 9, 30, 0, 0, DailyPlan.SEOUL).toInstant().toEpochMilli();
        assertEquals(expected, DailyPlan.nextRun(before, 9, 30));
    }
    @Test public void schedulesTomorrowAfterTime() {
        long before = ZonedDateTime.of(2026, 11, 4, 9, 31, 0, 0, DailyPlan.SEOUL).toInstant().toEpochMilli();
        long expected = ZonedDateTime.of(2026, 11, 5, 9, 30, 0, 0, DailyPlan.SEOUL).toInstant().toEpochMilli();
        assertEquals(expected, DailyPlan.nextRun(before, 9, 30));
    }
    @Test public void koreaTimezoneDate() {
        long utc = ZonedDateTime.of(2026, 11, 3, 16, 0, 0, 0, java.time.ZoneOffset.UTC).toInstant().toEpochMilli();
        assertEquals("2026-11-04", DailyPlan.today(utc));
    }
}
