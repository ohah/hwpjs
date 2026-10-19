//! Resolve the supported first-section page-number source without inventing defaults.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("section_direct_settings.zig");
pub const Values = struct { start_page: ?u32 = null, hide_first_header: ?bool = null, hide_first_footer: ?bool = null, supported: bool = false };

pub fn read(a: std.mem.Allocator, source: []const u8, trees: []const Tree, section: usize) !Values {
    if (section != 0 or trees.len == 0) return .{};
    var document = try @import("package.zig").inspectDocument(a, source, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    var begin = try @import("header_begin_numbers.zig").inspect(a, &header, .{});
    defer begin.deinit(a);
    const raw = begin.value(.page) orelse return .{};
    const number = @import("xml_values.zig").unsigned32(raw) catch return .{};
    if (number == 0) return .{};
    var result = Values{ .start_page = number, .supported = true };
    var settings = try fields.inspect(a, trees, .{});
    defer settings.deinit(a);
    var starts: usize = 0;
    var visibility: usize = 0;
    for (settings.items) |item| {
        if (item.section_ordinal != section) continue;
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
    var controls = try @import("number_controls.zig").inspect(a, trees[0..1], .{});
    defer controls.deinit();
    const uri = @import("document_xml.zig").paragraph_uri;
    const tree = &trees[0];
    var first_body: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (element.is(uri, "p") and element.parent == 0) {
            first_body = index;
            break;
        }
    }
    var restarts: usize = 0;
    for (controls.controls) |control| {
        if (control.kind != .new_num) continue;
        const values = control.auto orelse {
            result.supported = false;
            continue;
        };
        const kind = values.get(.num_type) orelse {
            result.supported = false;
            continue;
        };
        if (!std.mem.eql(u8, std.mem.trim(u8, kind, " \t\r\n"), "PAGE")) {
            if (values.type_known != true) result.supported = false;
            continue;
        }
        restarts += 1;
        const ctrl = tree.elements[control.element_index].parent orelse {
            result.supported = false;
            continue;
        };
        const run = tree.elements[ctrl].parent orelse {
            result.supported = false;
            continue;
        };
        const paragraph = tree.elements[run].parent orelse {
            result.supported = false;
            continue;
        };
        if (restarts != 1 or first_body == null or paragraph != first_body.? or !tree.elements[ctrl].is(uri, "ctrl") or !tree.elements[run].is(uri, "run")) {
            result.supported = false;
            continue;
        }
        // Reuse the zero-position metadata policy; opaque/visible siblings need page scheduling.
        if (!@import("page_number_leading_restart.zig").isLeading(tree, first_body.?, ctrl, run)) result.supported = false;
        const restart = values.num orelse {
            result.supported = false;
            continue;
        };
        if (restart < 1) {
            result.supported = false;
            continue;
        }
        result.start_page = @intCast(restart);
    }
    if (result.hide_first_header == null or result.hide_first_footer == null) result.supported = false;
    return result;
}

test "HWPX page number source actual multisection leading restart" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/exam_social.hwpx", a, .limited(16_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expectEqual(@as(usize, 2), session.sections.len);
    const trees = [_]Tree{ session.sections[0].tree, session.sections[1].tree };
    const result = try read(a, input, &trees, 0);
    try std.testing.expect(result.supported);
    try std.testing.expectEqual(@as(?u32, 1), result.start_page);
    try std.testing.expectEqual(@as(?bool, false), result.hide_first_header);
    try std.testing.expect(!(try read(a, input, &trees, 1)).supported);
}

test "HWPX page number source leading restart rejects later duplicate and unknown controls" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    const Case = struct { prefix: []const u8 = "", control: []const u8, tail: []const u8 = "", supported: bool, start: u32 = 1 };
    for ([_]Case{
        .{ .control = "<p:ctrl><p:newNum num='7' numType='PAGE'/></p:ctrl>", .supported = true, .start = 7 },
        .{ .control = "<p:ctrl><p:newNum num='2' numType='FOOTNOTE'/></p:ctrl>", .supported = true },
        .{ .prefix = "<p:t>visible</p:t>", .control = "<p:ctrl><p:newNum num='7' numType='PAGE'/></p:ctrl>", .supported = false },
        .{ .prefix = "<p:ellipse/>", .control = "<p:ctrl><p:newNum num='7' numType='PAGE'/></p:ctrl>", .supported = false },
        .{ .prefix = "<p:line/>", .control = "<p:ctrl><p:newNum num='7' numType='PAGE'/></p:ctrl>", .supported = false },
        .{ .prefix = "<p:future/>", .control = "<p:ctrl><p:newNum num='7' numType='PAGE'/></p:ctrl>", .supported = false },
        .{ .prefix = "hidden", .control = "<p:ctrl><p:newNum num='7' numType='PAGE'/></p:ctrl>", .supported = false },
        .{ .control = "<p:ctrl><p:newNum num='7' numType='PAGE'/><p:newNum num='8' numType='PAGE'/></p:ctrl>", .supported = false },
        .{ .control = "<p:ctrl><p:newNum num='0' numType='PAGE'/></p:ctrl>", .supported = false },
        .{ .control = "<p:ctrl><p:newNum num='7' numType='FUTURE'/></p:ctrl>", .supported = false },
        .{ .control = "", .tail = "<p:p><p:run><p:ctrl><p:newNum num='7' numType='PAGE'/></p:ctrl></p:run></p:p>", .supported = false },
    }) |case| {
        const bytes = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:secPr><p:startNum page='0' pageStartsOn='BOTH'/><p:visibility hideFirstHeader='0' hideFirstFooter='0'/></p:secPr>{s}{s}</p:run></p:p>{s}</s:sec>", .{ case.prefix, case.control, case.tail });
        defer a.free(bytes);
        var tree = try @import("section_tree.zig").parse(a, bytes, 0, 0, .{});
        defer tree.deinit(a);
        const result = try read(a, input, &.{tree}, 0);
        try std.testing.expectEqual(case.supported, result.supported);
        if (case.supported) try std.testing.expectEqual(@as(?u32, case.start), result.start_page);
    }
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
