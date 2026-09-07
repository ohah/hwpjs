const record = @import("record.zig");
const value = @import("value.zig");
pub const Layout = enum { uninspected, observed_record };
pub const Report = struct { records: usize, text_units: usize };
pub const View = struct {
    raw: []const u8,
    text: []const u8,
    report: Report,
    /// Observed HistoryLastDoc: one LASTDOCDATA record, not a STAG/ETAG item.
    /// Borrows raw UTF-16 units; does not validate XML or resolve external data.
    pub fn parseObserved(bytes: []const u8, options: record.Options) !View {
        var it = record.Iterator.init(bytes, options);
        const first = try it.next() orelse return error.MissingHistoryLastDocument;
        if (first.tag != @intFromEnum(value.Tag.last_doc_data)) return error.InvalidHistoryLastDocumentTag;
        // The start layout argument is unused for LASTDOCDATA.
        const text = (try value.parse(first.tag, first.payload, .spec_flag_first)).text;
        if (try it.next() != null) return error.ExtraHistoryLastDocumentRecord;
        return .{ .raw = bytes, .text = text, .report = .{ .records = 1, .text_units = text.len / 2 } };
    }
};
