pub const record = @import("record.zig");
pub const value = @import("value.zig");
pub const Options = struct { start_layout: value.StartLayout, framing: record.Options = .{} };
pub const Report = struct {
    records: usize = 0,
    unknown_records: usize = 0,
    date_records_deferred: usize = 0,
    text_records: usize = 0,
    text_units: usize = 0,
    extra_bytes: usize = 0,
    duplicate_presence_records: usize = 0,
    last_doc_records: usize = 0,
};
pub const Item = struct {
    raw: []const u8,
    start: value.Start,
    report: Report,
    /// One decoded VersionLog item. Never decrypts or guesses encrypted envelopes.
    /// DiffML/HWPML, SYSTEMDATE and HistoryLastDoc linkage remain unvalidated.
    pub fn parse(bytes: []const u8, options: Options) !Item {
        var it = record.Iterator.init(bytes, options.framing);
        const first = try it.next() orelse return error.MissingHistoryStart;
        const start_tag = @intFromEnum(value.Tag.start);
        if (first.tag != start_tag) return error.MissingHistoryStart;
        const start = (try value.parse(first.tag, first.payload, options.start_layout)).start;
        var report: Report = .{ .records = 1, .extra_bytes = start.extra.len };
        var presence: u16 = 0;
        var ended = false;
        while (try it.next()) |r| {
            if (ended) return error.RecordAfterHistoryEnd;
            if (r.tag == start_tag) return error.NestedHistoryStart;
            const parsed = try value.parse(r.tag, r.payload, options.start_layout);
            report.records += 1;
            const bit = value.presenceBit(r.tag);
            if (bit != 0 and presence & bit != 0) report.duplicate_presence_records += 1;
            presence |= bit;
            if (r.tag == @intFromEnum(value.Tag.last_doc_data)) report.last_doc_records += 1;
            switch (parsed) {
                .start => unreachable,
                .end => ended = true,
                .version => |v| report.extra_bytes += v.extra.len,
                .date_deferred => report.date_records_deferred += 1,
                .text => |text| {
                    report.text_records += 1;
                    report.text_units += text.len / 2;
                },
                .unknown => report.unknown_records += 1,
            }
        }
        if (!ended) return error.MissingHistoryEnd;
        if (start.flags & 0x1f != presence) return error.HistoryPresenceMismatch;
        return .{ .raw = bytes, .start = start, .report = report };
    }
};
