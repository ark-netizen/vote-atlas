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
    private static final String DATE = "(?:(20\\d{2})[./-]\\s*)?(\\d{1,2})[./-]\\s*(\\d{1,2})";
    private static final Pattern PERIOD = Pattern.compile(DATE + "\\s*(?:\\d{1,2}:\\d{2})?\\s*[~～–—-]\\s*" +
            "(?:(20\\d{2})[./-]\\s*)?(\\d{1,2})[./-]\\s*(\\d{1,2})");
    private static final Pattern VOTE = Pattern.compile("투표|VOTE|vote|랭킹|rank", Pattern.CASE_INSENSITIVE);
    private static final Pattern EXCLUDE = Pattern.compile("로그인|비밀번호|내 정보|마이페이지|충전|결제|구매|개인정보|회원가입|광고보기|설정|알림|투표하기|투표권", Pattern.CASE_INSENSITIVE);
    private static final Pattern CANDIDATE = Pattern.compile("^(\\d{1,3})\\s*(?:위|등|[.)])\\s*(.{1,65}?)\\s+([\\d,]+)\\s*(?:표|votes?)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern RANK_ONLY = Pattern.compile("^(\\d{1,3})\\s*(?:위|등|[.)])?$");
    private static final Pattern VOTES_ONLY = Pattern.compile("^([\\d,]+)\\s*(?:표|votes?)(?:\\s*[(]?[\\d.]+%[)]?)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern RANK_NAME = Pattern.compile("^(\\d{1,3})\\s*(?:위|등|[.)])\\s*(.{1,65})$");
    private static final Pattern REWARD = Pattern.compile("리워드|전광판|트로피|광고 송출|광고 게재|포토카드|혜택|reward", Pattern.CASE_INSENSITIVE);
    private static final DateTimeFormatter DATE_OUT = DateTimeFormatter.ISO_LOCAL_DATE;

    private PollParser() {}

    static JSONObject parse(List<String> lines) {
        return parse(lines, "");
    }

    static JSONObject parse(List<String> lines, String explicitTitle) {
        try {
            if (lines.isEmpty() || lines.size() > 300) return null;
            for (String line : lines) if (EXCLUDE.matcher(line).find() && (line.contains("비밀번호") || line.contains("결제하기"))) return null;
            String joined = String.join("\n", lines);
            if (!VOTE.matcher(joined).find()) return null;
            Matcher period = PERIOD.matcher(joined);
            if (!period.find()) return null;
            boolean inferred = period.group(1) == null || period.group(4) == null;
            int month = Integer.parseInt(period.group(2));
            int day = Integer.parseInt(period.group(3));
            int year;
            if (period.group(1) != null) {
                year = Integer.parseInt(period.group(1));
            } else if (period.group(4) != null) {
                year = Integer.parseInt(period.group(4)) -
                        (Integer.parseInt(period.group(5)) < month ? 1 : 0);
            } else {
                LocalDate now = LocalDate.now(ZoneId.of("Asia/Seoul"));
                LocalDate closest = null;
                for (int option = now.getYear() - 1; option <= now.getYear() + 1; option++) {
                    try {
                        LocalDate candidate = LocalDate.of(option, month, day);
                        if (closest == null || Math.abs(candidate.toEpochDay() - now.toEpochDay()) <
                                Math.abs(closest.toEpochDay() - now.toEpochDay())) closest = candidate;
                    } catch (Exception ignored) {}
                }
                if (closest == null || Math.abs(closest.toEpochDay() - now.toEpochDay()) > 120) return null;
                year = closest.getYear();
            }
            LocalDate start = LocalDate.of(year, month, day);
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
            String chosenTitle = explicitTitle == null ? "" : explicitTitle.trim();
            if (chosenTitle.isEmpty() && titles.isEmpty()) return null;
            String title = chosenTitle.isEmpty() ? titles.get(0) : chosenTitle;
            if (title.length() < 5 || title.length() > 160) return null;
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
            record.put("year_inferred", inferred);
            record.put("collected_at", stamp);
            record.put("source", "실제 Android 기기 아이돌챔프 공개 투표 화면");
            record.put("source_url", "https://www.idolchamp.co.kr/");
            record.put("lineup_complete", false);
            record.put("verification", "접근성+기기 내 OCR 수집" + (inferred ? " · 투표 시작 연도 추정" : "") + " · 후보 전체 및 최종 결과 미검증");
            JSONArray candidates = new JSONArray();
            String leader = "";
            java.util.Set<String> unique = new java.util.HashSet<>();
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i).trim();
                Matcher direct = CANDIDATE.matcher(line);
                int rank = -1;
                String name = null;
                String count = null;
                if (direct.matches()) {
                    rank = Integer.parseInt(direct.group(1));
                    name = direct.group(2).trim();
                    count = direct.group(3);
                } else if (i + 1 < lines.size()) {
                    Matcher rankedName = RANK_NAME.matcher(line);
                    Matcher nextVotes = VOTES_ONLY.matcher(lines.get(i + 1).trim());
                    if (rankedName.matches() && nextVotes.matches()) {
                        rank = Integer.parseInt(rankedName.group(1));
                        name = rankedName.group(2).trim();
                        count = nextVotes.group(1);
                    } else if (i + 2 < lines.size()) {
                        Matcher rankLine = RANK_ONLY.matcher(line);
                        Matcher votesLine = VOTES_ONLY.matcher(lines.get(i + 2).trim());
                        if (rankLine.matches() && votesLine.matches()) {
                            rank = Integer.parseInt(rankLine.group(1));
                            name = lines.get(i + 1).trim();
                            count = votesLine.group(1);
                        }
                    }
                }
                if (rank < 1 || rank > 100 || name == null || name.isEmpty() || name.length() > 65 ||
                        EXCLUDE.matcher(name).find() || !unique.add(rank + "|" + name)) continue;
                long votes;
                try { votes = Long.parseLong(count.replace(",", "")); }
                catch (NumberFormatException ex) { continue; }
                if (votes < 0 || votes > 100_000_000_000_000L) continue;
                JSONObject candidate = new JSONObject();
                candidate.put("rank", rank);
                candidate.put("name", name);
                candidate.put("votes", votes);
                candidates.put(candidate);
                if (rank == 1) leader = name;
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
