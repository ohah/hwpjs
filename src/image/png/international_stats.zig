const Value = @import("international_text.zig").Value;
pub const Stats = struct {
    chunks: usize = 0,
    keyword_bytes: usize = 0,
    language_bytes: usize = 0,
    translated_bytes: usize = 0,
    text_bytes: usize = 0,
    extension_semantics_deferred: usize = 0,
    discouraged_controls: usize = 0,
    translated_linefeeds: usize = 0,
    ignored_methods: usize = 0,
    pub fn add(self: *Stats, v: Value) void {
        self.chunks += 1;
        self.keyword_bytes += v.keyword.len;
        self.language_bytes += v.language.len;
        self.translated_bytes += v.translated.len;
        self.text_bytes += v.text.len;
        if (v.language_report) |r| self.extension_semantics_deferred += r.extension_semantics_deferred;
        self.discouraged_controls += v.translated_report.discouraged_controls + v.text_report.discouraged_controls;
        self.translated_linefeeds += v.translated_report.linefeeds;
        if (!v.compressed and v.method != 0) self.ignored_methods += 1;
    }
};
