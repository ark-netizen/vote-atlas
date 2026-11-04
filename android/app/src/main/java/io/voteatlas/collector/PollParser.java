package io.voteatlas.collector;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PollParser {
    // An explicit start year is required. Never invent a year from a partial screen.
    private static final String DATE = "(20\\d{2})[./-]\\s*(\\d{1,2})[./-]\\s*(\\d{1,2})";
    private static final Pattern PERIOD = Pattern.compile(DATE + "\\s*(?:\\d{1,2}:\\d{2})?\\s*[~～–—-]\\s*" +
            "(?:(20\\d{2})[./-]\\s*)?(\\d{1,2})[./-]\\s*(\\d{1,2})");
    private static final Pattern VOTE = Pattern.compile("투표|VOTE|vote|랭킹|rank", Pattern.CASE_INSENSITIVE);
    private static final Pattern EXCLUDE = Pattern.compile("로그인|비밀번호|내 정보|마이페이지|충전|결제|구매|개인정보|회원가입|광고보기|설정|알림|투표하기|투표권", Pattern.CASE_INSENSITIVE);
    private static final Pattern CANDIDATE = Pattern.compile("^(\\d{1,3})\\s*(?:위|등|[.)])\\s*(.{1,65}?)\\s+([\\d,]+)\\s*(?:표|votes?)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern REWARD = Pattern.compile("리워드|전광판|트로피|광고 송출|광고 게재|포토카드|혜택|reward", Pattern.CASE_INSENSITIVE);
    private static final DateTimeFormatter DATE_OUT = DateTimeFormatter.ISO_LOCAL_DATE;

    private PollParser() {}

    static JSONObject parse(List<String> lines) {
        try {
            if (lines.isEmpty() || lines.size() > 300) return null;
            for (String line : lines) if (EXCLUDE.matcher(line).find() && (line.contains("비밀번호") || line.contains("결제하기"))) return null;
            String joined = String.join("\n", lines);
            if (!VOTE.matcher(joined).find()) return null;
            Matcher period = PERIOD.matcher(joined);
            if (!period.find()) return null;
            int year = Integer.parseInt(period.group(1));
            LocalDate start = LocalDate.of(year, Integer.parseInt(period.group(2)), Integer.parseInt(period.group(3)));
            int endYear = period.group(4) == null ? year : Integer.parseInt(period.group(4));
            int monthEnd = Integer.parseInt(period.group(5));
            if (period.group(4) == null && monthEnd < start.getMonthValue()) endYear++;
            LocalDate end = LocalDate.of(endYear, monthEnd, Integer.parseInt(period.group(6)));
            if (end.isBefore(start) || end.isAfter(start.plusDays(370))) return null;

            List<String> titles = new ArrayList<>();
            for (String line : lines) {
                String s = line.trim();
                if (s.length() >= 7 && s.length() <= 120
                        && !PERIOD.matcher(s).find() && !EXCLUDE.matcher(s).find()
                        && !s.matches(".*[0-9]{2,4}[./-][0-9]{1,2}[./-][0-9]{1,2}.*")
                        && !s.matches("(?i)^(vote|투표|진행중|진행 중|종료|랭킹|home|홈|event|이벤트)$")) {
                    titles.add(s);
                }
            }
            if (titles.isEmpty()) return null;
            String title = titles.get(0);
            // Do not upload a screen if the candidate title looks like user-specific content.
            if (title.matches(".*(내 계정|아이디|닉네임|프로필|이메일).*")) return null;
            String stamp = OffsetDateTime.now(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
            JSONObject record = new JSONObject();
            String id = hash("idolchamp|" + title + "|" + start + "|" + end);
            record.put("id", "idolchamp-" + id.substring(0, 20));
            record.put("app", "idolchamp");
            record.put("title", title);
            record.put("start", start.format(DATE_OUT));
            record.put("end", end.format(DATE_OUT));
            record.put("date_precision", "date");
            record.put("year_inferred", false);
            record.put("collected_at", stamp);
            record.put("source", "실제 Android 기기 공개 투표 화면");
            record.put("source_url", "https://www.idolchamp.co.kr/");
            record.put("lineup_complete", false);
            record.put("verification", "접근성 텍스트 추출 · 전체 후보 및 최종 결과 미검증");
            JSONArray candidates = new JSONArray();
            String leader = "";
            for (String line : lines) {
                Matcher m = CANDIDATE.matcher(line);
                if (!m.matches()) continue;
                int rank = Integer.parseInt(m.group(1));
                if (rank < 1 || rank > 100) continue;
                JSONObject c = new JSONObject();
                c.put("rank", rank);
                c.put("name", m.group(2).trim());
                c.put("votes", Long.parseLong(m.group(3).replace(",", "")));
                candidates.put(c);
                if (rank == 1) leader = m.group(2).trim();
            }
            record.put("candidates", candidates);
            record.put("leader", leader);
            record.put("winner", JSONObject.NULL);
            JSONArray rewardLines = new JSONArray();
            for (String line : lines) {
                String clean = line.trim();
                if (clean.length() >= 8 && clean.length() < 200 && REWARD.matcher(clean).find() && !EXCLUDE.matcher(clean).find()) {
                    rewardLines.put(clean);
                    if (rewardLines.length() >= 8) break;
                }
            }
            record.put("reward_lines", rewardLines);
            record.put("reward", rewardLines.length() == 0 ? JSONObject.NULL : rewardLines.join(" / "));
            return record;
        } catch (Exception ex) { return null; }
    }

    private static String hash(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return sb.toString();
    }
}
