//! Failure atomicity for the first source-to-current runless input transaction.
const std = @import("std");
const editor = @import("editor_session.zig");

test "runless first input transaction retains source and sole text owner on every failed allocation" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p styleIDRef='0'><p:linesegarray/></p:p></s:sec>";
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='1'><h:charPr id='2' height='1000'/></h:charProperties><h:styles itemCnt='1'><h:style id='0' charPrIDRef='2'/></h:styles></h:refList></h:head>";
    const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(input);
    var original = try editor.open(a, input, .{});
    defer original.deinit();
    try std.testing.expect(try original.canEdit(0, 1));
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, bytes: []const u8) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            defer if (proxy.sections[0].structure_values) |*values| values.deinit(allocator);
            const changed = proxy.splice(0, 1, 0, 0, "본문😀<&") catch |err| {
                try std.testing.expect(proxy.sections[0].structure_values == null);
                try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].sites.items.len);
                proxy.allocator = std.testing.allocator;
                defer proxy.allocator = allocator;
                const saved = try proxy.save();
                defer std.testing.allocator.free(saved);
                try std.testing.expectEqualSlices(u8, bytes, saved);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].sites.items.len);
            const current = &proxy.sections[0].structure_values.?.paragraphs[0];
            try std.testing.expectEqual(@as(?u32, 2), current.synthesized_run_character_id);
            try std.testing.expectEqual(@as(usize, 1), current.sites.items.len);
            try std.testing.expectEqualStrings("본문😀<&", current.sites.items[0].text);
            try std.testing.expectEqualSlices(u8, bytes, proxy.source);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &original, input });
    try std.testing.expect(original.sections[0].structure_values == null);
    const saved = try original.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
