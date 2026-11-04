package io.voteatlas.collector;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

final class ObservationStore {
    private ObservationStore() {}

    static synchronized JSONArray pending(Context ctx) {
        String data = ctx.getSharedPreferences("observations", Context.MODE_PRIVATE).getString("items", "[]");
        try { return new JSONArray(data); } catch (Exception ex) { return new JSONArray(); }
    }

    static synchronized void add(Context ctx, JSONObject record) {
        JSONArray before = pending(ctx);
        JSONArray after = new JSONArray();
        for (int i = 0; i < before.length(); i++) {
            JSONObject old = before.optJSONObject(i);
            if (old == null || record.optString("id").equals(old.optString("id"))) continue;
            after.put(old);
        }
        after.put(record);
        if (after.length() > 150) {
            JSONArray trimmed = new JSONArray();
            for (int i = after.length() - 150; i < after.length(); i++) trimmed.put(after.optJSONObject(i));
            after = trimmed;
        }
        save(ctx, after);
    }

    static synchronized void removeUploaded(Context ctx, JSONArray uploaded) {
        JSONArray current = pending(ctx), remaining = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item == null) continue;
            boolean matched = false;
            for (int j = 0; j < uploaded.length(); j++) {
                JSONObject old = uploaded.optJSONObject(j);
                if (old != null && item.optString("id").equals(old.optString("id"))
                        && item.optString("collected_at").equals(old.optString("collected_at"))) {
                    matched = true; break;
                }
            }
            if (!matched) remaining.put(item);
        }
        save(ctx, remaining);
    }

    private static void save(Context ctx, JSONArray items) {
        ctx.getSharedPreferences("observations", Context.MODE_PRIVATE).edit()
                .putString("items", items.toString()).apply();
    }
}
