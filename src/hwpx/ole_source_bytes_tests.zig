const std = @import("std");
const source = @import("ole_source_bytes.zig");

test "HWPX numeric OLE source preserves external declaration and reads only opted-in packaged copy" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const sites = try @import("ole_display_sites.zig").read(a, &session, 0);
    defer a.free(sites);
    try std.testing.expectEqual(@as(usize, 1), sites.len);
    const node = sites[0].ole_node;
    try std.testing.expectError(error.ExternalOleSource, source.read(a, &session, 0, node, .{}));
    try std.testing.expectError(error.InvalidSectionIndex, source.read(a, &session, session.sections.len, node, .{}));
    try std.testing.expectError(error.InvalidOleDisplayNode, source.read(a, &session, 0, 0, .{}));
    try std.testing.expectError(error.LimitExceeded, source.read(a, &session, 0, node, .{ .allow_external_packaged_copy = true, .max_bytes = 11779 }));
    var result = try source.read(a, &session, 0, node, .{ .allow_external_packaged_copy = true, .max_bytes = 11780 });
    defer result.deinit(a);
    try std.testing.expect(result.declared_external);
    var archive = try @import("../zip/archive.zig").open(a, input, .{});
    defer archive.deinit();
    const expected = try archive.decode(archive.find("BinData/ole3.ole").?, 11780);
    defer a.free(expected);
    try std.testing.expectEqualSlices(u8, expected, result.bytes);
    _ = try session.spliceAnchored(0, 11, 0, 0, "앞😀");
    var after = try source.read(a, &session, 0, node, .{ .allow_external_packaged_copy = true });
    defer after.deinit(a);
    try std.testing.expectEqualSlices(u8, result.bytes, after.bytes);
    const saved = try session.save();
    defer a.free(saved);
    var again = block: {
        var reopened = try @import("editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        const current_sites = try @import("ole_display_sites.zig").read(a, &reopened, 0);
        defer a.free(current_sites);
        try std.testing.expectEqual(@as(usize, 1), current_sites.len);
        break :block try source.read(a, &reopened, 0, current_sites[0].ole_node, .{ .allow_external_packaged_copy = true });
    };
    defer again.deinit(a);
    try std.testing.expect(again.declared_external);
    try std.testing.expectEqualSlices(u8, expected, again.bytes);
}
