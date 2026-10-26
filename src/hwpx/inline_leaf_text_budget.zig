//! One total text budget for body text plus owned inline leaf overrides.
pub fn validate(session: *const @import("editor_session.zig").Session) !void {
    const has_overrides = for (session.sections) |section| {
        if (section.dutmal_texts.entries.items.len != 0 or section.equation_scripts.entries.items.len != 0) break true;
    } else false;
    if (!has_overrides) return;
    const limit = session.options.max_text_bytes;
    var total: usize = 0;
    for (session.sections) |section| {
        total += try section.textBytes(limit -| total);
        for (section.dutmal_texts.entries.items) |entry| {
            if (entry.text.len > limit -| total) return error.LimitExceeded;
            total += entry.text.len;
        }
        for (section.equation_scripts.entries.items) |entry| {
            if (entry.text.len > limit -| total) return error.LimitExceeded;
            total += entry.text.len;
        }
    }
}
