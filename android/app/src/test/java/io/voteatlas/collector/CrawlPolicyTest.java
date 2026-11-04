package io.voteatlas.collector;

import org.junit.Test;
import static org.junit.Assert.*;

public class CrawlPolicyTest {
    @Test public void allowsPublicPollCard() {
        assertTrue(CrawlPolicy.safeForCard("오늘의 인기투표 2026.11.04 ~ 2026.11.12"));
    }
    @Test public void forbidsVotingAndPayments() {
        assertFalse(CrawlPolicy.safeForCard("투표하기 2026.11.04 ~ 2026.11.12"));
        assertFalse(CrawlPolicy.safeForCard("광고보기 2026.11.04 ~ 2026.11.12"));
        assertFalse(CrawlPolicy.safeForCard("결제 2026.11.04 ~ 2026.11.12"));
    }
    @Test public void onlyExplicitVoteNavigation() {
        assertTrue(CrawlPolicy.safeTab("투표"));
        assertFalse(CrawlPolicy.safeTab("투표하기"));
        assertFalse(CrawlPolicy.safeTab("투표권"));
    }
    @Test public void rejectsUnknownCard() {
        assertFalse(CrawlPolicy.safeForCard("후보 이름만 표시"));
    }
}
