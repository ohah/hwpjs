//! Resolve the supported first-section page-number source without inventing defaults.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("section_direct_settings.zig");
pub const Values = struct { start_page: ?u32 = null, hide_first_header: ?bool = null, hide_first_footer: ?bool = null, supported: bool = false };

pub fn read(a: std.mem.Allocator, source: []const u8, trees: []const Tree, section: usize) !Values {
    if (section != 0 or trees.len != 1) return .{};
    var document = try @import("package.zig").inspectDocument(a, source, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    var begin = try @import("header_begin_numbers.zig").inspect(a, &header, .{});
    defer begin.deinit(a);
    const raw = begin.value(.page) orelse return .{};
    const number = @import("xml_values.zig").unsigned32(raw) catch return .{};
    var result = Values{ .start_page = number, .supported = true };
    var settings = try fields.inspect(a, trees, .{});
    defer settings.deinit(a);
    var starts: usize = 0;
    var visibility: usize = 0;
    for (settings.items) |item| {
        if (item.kind == .start_num) {
            starts += 1;
            if (starts > 1) result.supported = false;
            if (item.get(.page_starts_on)) |value| {
                if (!std.mem.eql(u8, std.mem.trim(u8, value, " \t\r\n"), "BOTH")) result.supported = false;
            }
            if (item.get(.page)) |value| {
                const start = try @import("xml_values.zig").unsigned32(value);
                if (start != 0) result.start_page = start;
            }
        }
        if (item.kind == .visibility) {
            visibility += 1;
            if (visibility > 1) result.supported = false;
            if (item.get(.hide_first_header)) |value| result.hide_first_header = try @import("xml_values.zig").boolean(value);
            if (item.get(.hide_first_footer)) |value| result.hide_first_footer = try @import("xml_values.zig").boolean(value);
        }
    }
    for (trees[0].elements) |element| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "newNum")) result.supported = false;
    }
    if (result.hide_first_header == null or result.hide_first_footer == null) result.supported = false;
    return result;
}

test "HWPX page number source actual header and section inheritance" {
    try @import("../testing/checked_allocator.zig").run(verifyActualPageNumberInheritance, .{});
}

fn verifyActualPageNumberInheritance(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const trees = [_]Tree{session.sections[0].tree};
    const result = try read(a, input, &trees, 0);
    try std.testing.expect(result.supported);
    try std.testing.expectEqual(@as(?u32, 1), result.start_page);
    try std.testing.expectEqual(@as(?bool, false), result.hide_first_header);
    try std.testing.expectEqual(@as(?bool, false), result.hide_first_footer);
    try std.testing.expect(!(try read(a, input, &trees, 1)).supported);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, sections: []const Tree) !void {
            const values = try read(allocator, bytes, sections, 0);
            try std.testing.expect(values.supported);
            try std.testing.expectEqual(@as(?u32, 1), values.start_page);
            try std.testing.expectEqual(@as(?bool, false), values.hide_first_header);
            try std.testing.expectEqual(@as(?bool, false), values.hide_first_footer);
        }
    }.run, .{ input, @as([]const Tree, &trees) });
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
