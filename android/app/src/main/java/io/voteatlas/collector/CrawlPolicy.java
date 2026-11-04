package io.voteatlas.collector;

import java.util.Locale;
import java.util.regex.Pattern;

final class CrawlPolicy {
    static final Pattern DATE = Pattern.compile("(?:20\\d{2}[./-])?\\s*\\d{1,2}[./-]\\d{1,2}");
    static final Pattern PERIOD = Pattern.compile("(?:20\\d{2}[./-])?\\s*\\d{1,2}[./-]\\d{1,2}\\s*(?:[0-9: ]+)?[~～–—-]\\s*(?:20\\d{2}[./-])?\\s*\\d{1,2}[./-]\\d{1,2}");
    static final Pattern DENY = Pattern.compile("투표하기|투표권|내 투표|결제|구매|충전|광고보기|광고 보기|로그인|비밀번호|내정보|내 정보|계정|프로필|응모하기|참여하기|구독|purchase|checkout|sign in|buy now", Pattern.CASE_INSENSITIVE);
    static final Pattern POLL = Pattern.compile("투표|vote|투표 기간|진행중|진행 중|ranking", Pattern.CASE_INSENSITIVE);
    private CrawlPolicy() {}

    static boolean safeForCard(String text) {
        if (text == null || text.length() < 7 || text.length() > 1000) return false;
        if (DENY.matcher(text).find()) return false;
        return PERIOD.matcher(text).find() || (POLL.matcher(text).find() && DATE.matcher(text).find());
    }

    static boolean safeTab(String text) {
        String t = text == null ? "" : text.trim().toLowerCase(Locale.ROOT);
        return t.equals("투표") || t.equals("vote") || t.equals("voting");
    }
}
