const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const Document = @import("parser.zig").Document;

test "tracked HWP summary fixture retains missing-codepage placeholder diagnosis" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hwpSummaryInformation.hwp", a, .limited(2_000_000));
    defer a.free(bytes);
    var file = try File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const index = try file.findExact("/\x05HwpSummaryInformation") orelse return error.MissingSummaryStream;
    var doc = try Document.parse(a, file.entries[index].content, 1024);
    defer doc.deinit(a);
    try std.testing.expect(doc.code_page == null);
    try std.testing.expect(doc.dictionary_structure == null);
    try std.testing.expect(doc.observed_dictionary_placeholder);
    try std.testing.expectEqual(@as(usize, 1), doc.stats.dictionaries_deferred);
    try std.testing.expect(doc.stats.strings > 0);
}
