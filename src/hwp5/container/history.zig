const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const item = @import("../history/item.zig");
pub const Encoding = @import("selected_encoding.zig").Encoding;
pub const Options = struct {
    last_document: @import("../history/last_document.zig").Layout = .uninspected,
    encoding: Encoding,
    item: item.Options,
    max_items: usize = 4096,
    max_decoded_bytes: usize = 64 * 1024 * 1024,
};
pub const Entry = struct {
    index: u32,
    flags: u16,
    option: u32,
    decoded_bytes: usize,
    report: item.Report,
};
pub const Report = struct {
    last_document: ?@import("../history/last_document.zig").Report = null,
    present: bool = false,
    declared: bool = false,
    last_doc_present: bool = false,
    last_doc_encoded_bytes: usize = 0,
    decoded_bytes: usize = 0,
    records: usize = 0,
    entries: []Entry = &.{},
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.entries);
        self.* = undefined;
    }
};
const Source = struct { index: u32, node: usize };
fn less(_: void, lhs: Source, rhs: Source) bool {
    return lhs.index < rhs.index;
}
/// Selected storage model only. No decryption, flag-based codec inference, or
/// fallback after a decode failure. Consumes successful direct VersionLogs and,
/// only when explicitly selected, the observed HistoryLastDoc record.
pub fn inspect(a: std.mem.Allocator, file: *const File, declared: bool, used: []bool, remaining_bytes: *usize, remaining_records: usize, options: Options) !Report {
    var result: Report = .{ .declared = declared };
    const root = try file.findExact("/DocHistory") orelse return result;
    if (file.entries[root].kind != 1) return error.InvalidHwpEntryKind;
    result.present = true;
    const last_node = try file.findExact("/DocHistory/HistoryLastDoc");
    if (last_node) |node| {
        if (file.entries[node].kind != 2) return error.InvalidHwpEntryKind;
        result.last_doc_present = true;
        result.last_doc_encoded_bytes = file.entries[node].content.len;
        // Metadata alone does not consume the stream. Explicit parsing is below.
    }
    var sources: std.ArrayList(Source) = .empty;
    defer sources.deinit(a);
    for (file.entries, 0..) |entry, node| {
        if (entry.kind == 0 or entry.parent != root) continue;
        const index = (@import("numbered_stream.zig").index(u32, "VersionLog", entry.name) catch return error.InvalidHistoryStreamName) orelse continue;
        if (entry.kind != 2) return error.InvalidHwpEntryKind;
        if (sources.items.len >= options.max_items) return error.LimitExceeded;
        try sources.append(a, .{ .index = index, .node = node });
    }
    std.mem.sort(Source, sources.items, {}, less);
    result.entries = try a.alloc(Entry, sources.items.len);
    errdefer result.deinit(a);
    const record_budget = @min(remaining_records, options.item.framing.max_records);
    for (sources.items, 0..) |source, i| {
        const limit = @min(remaining_bytes.*, options.max_decoded_bytes - result.decoded_bytes);
        const encoded = file.entries[source.node].content;
        const bytes = try @import("selected_encoding.zig").decode(a, encoded, limit, options.encoding);
        defer a.free(bytes);
        var local = options.item;
        local.framing.max_records = record_budget - result.records;
        const parsed = try item.Item.parse(bytes, local);
        result.entries[i] = .{ .index = source.index, .flags = parsed.start.flags, .option = parsed.start.option, .decoded_bytes = bytes.len, .report = parsed.report };
        result.decoded_bytes += bytes.len;
        result.records += parsed.report.records;
        remaining_bytes.* -= bytes.len;
        used[source.node] = true;
    }
    if (options.last_document == .observed_record) {
        if (last_node) |node| {
            const limit = @min(remaining_bytes.*, options.max_decoded_bytes - result.decoded_bytes);
            const bytes = try @import("selected_encoding.zig").decode(a, file.entries[node].content, limit, options.encoding);
            defer a.free(bytes);
            var local = options.item.framing;
            local.max_records = record_budget - result.records;
            const parsed = try @import("../history/last_document.zig").View.parseObserved(bytes, local);
            result.last_document = parsed.report;
            result.decoded_bytes += bytes.len;
            result.records += parsed.report.records;
            remaining_bytes.* -= bytes.len;
            used[node] = true;
        }
    }
    return result;
}
