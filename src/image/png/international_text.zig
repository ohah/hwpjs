const std = @import("std");
const header = @import("international_header.zig");
pub const utf8 = @import("international_utf8.zig");
pub const registry = @import("../../text/bcp47/registry.zig");
pub const Options = struct { max_text_bytes: usize = 64 * 1024 * 1024, language: registry.Options = .{} };
pub const Value = struct {
    keyword: []const u8,
    language: []const u8,
    translated: []const u8,
    text: []const u8,
    compressed: bool,
    method: u8,
    language_report: ?registry.Report,
    translated_report: utf8.Report,
    text_report: utf8.Report,
    /// Only compressed text is owned. All other fields borrow the chunk.
    owned_text: ?[]u8,
    pub fn deinit(self: *Value, a: std.mem.Allocator) void {
        if (self.owned_text) |bytes| a.free(bytes);
        self.* = undefined;
    }
};
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Value {
    const h = try header.parse(bytes, options.language.max_bytes);
    const language = if (h.language.len == 0) null else try registry.inspect(a, h.language, options.language);
    const translated = try utf8.inspect(h.translated);
    const owned = if (h.compressed) try @import("../../compression/zlib.zig").decode(a, h.body, options.max_text_bytes) else null;
    errdefer if (owned) |buf| a.free(buf);
    const body = owned orelse h.body;
    if (body.len > options.max_text_bytes) return error.LimitExceeded;
    const report = try utf8.inspect(body);
    return .{ .keyword = h.keyword, .language = h.language, .translated = h.translated, .text = body, .compressed = h.compressed, .method = h.method, .language_report = language, .translated_report = translated, .text_report = report, .owned_text = owned };
}
