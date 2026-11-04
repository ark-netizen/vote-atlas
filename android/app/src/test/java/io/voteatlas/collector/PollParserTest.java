package io.voteatlas.collector;

import org.junit.Test;
import org.json.JSONObject;
import java.util.Arrays;
import static org.junit.Assert.*;

public class PollParserTest {
    @Test public void extractsObservedVoteWithPeriod() {
        JSONObject p=PollParser.parse(Arrays.asList(
            "오늘의 아이돌 투표", "2026.11.04 ~ 2026.11.17",
            "1위 테스트그룹 1234표", "2위 테스트솔로 432표",
            "1위 서울 전광판 리워드"));
        assertNotNull(p);
        assertEquals("2026-11-04",p.optString("start"));
        assertEquals("2026-11-17",p.optString("end"));
        assertEquals(2,p.optJSONArray("candidates").length());
        assertEquals("테스트그룹",p.optString("leader"));
        assertNull(p.opt("winner")==JSONObject.NULL?null:p.opt("winner"));
    }
    @Test public void explicitTitleOverridesOCRAndMissingYearIsRejected() {
        assertNull(PollParser.parse(Arrays.asList("투표 테스트", "11.04 ~ 11.17")));
        JSONObject p=PollParser.parse(Arrays.asList("투표", "2026.11.04 ~ 11.17"),
                "11월 아이돌챔프 테스트");
        assertNotNull(p);
        assertEquals("11월 아이돌챔프 테스트",p.optString("title"));
    }
    @Test public void rejectsNonVoteAndPaymentScreen() {
        assertNull(PollParser.parse(Arrays.asList("2026.11.04 ~ 11.17","홈 공지")));
        assertNull(PollParser.parse(Arrays.asList("투표 2026.11.04 ~ 11.17", "비밀번호 변경")));
    }

    @Test public void readsRankNameVotesSplitAcrossOCRLines() {
        JSONObject p = PollParser.parse(Arrays.asList(
            "아이돌챔프 주간 투표", "2026.11.04 ~ 2026.11.17",
            "1위", "테스트그룹", "1,234표",
            "2위 테스트솔로", "997표"));
        assertNotNull(p);
        assertEquals(2, p.optJSONArray("candidates").length());
        assertEquals(1234L, p.optJSONArray("candidates").optJSONObject(0).optLong("votes"));
        assertEquals("테스트그룹", p.optString("leader"));
    }
    @Test public void rejectsPotentialPrivateContactDetails() {
        assertNull(PollParser.parse(Arrays.asList(
            "아이돌챔프 투표 contact@example.com", "2026.11.04 ~ 2026.11.17")));
    }
    @Test public void explicitlyFlagsBoundedYearInference() {
        java.time.LocalDate now = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul"));
        String from = now.format(java.time.format.DateTimeFormatter.ofPattern("MM.dd"));
        String to = now.plusDays(7).format(java.time.format.DateTimeFormatter.ofPattern("MM.dd"));
        JSONObject p = PollParser.parse(Arrays.asList(
            "아이돌챔프 인기 투표", from + " ~ " + to));
        assertNotNull(p);
        assertTrue(p.optBoolean("year_inferred"));
    }
}
