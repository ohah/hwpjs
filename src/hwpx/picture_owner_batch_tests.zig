const std = @import("std");
test "picture owner batch agrees with scalar queries and preserves original saved bytes" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const module = @import("picture_owner.zig");
    var count: usize = 0;
    for (session.sections, 0..) |section, section_index| {
        var pictures: std.ArrayList(usize) = .empty;
        defer pictures.deinit(a);
        for (section.tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "pic")) {
            try pictures.append(a, index);
        };
        if (pictures.items.len == 0) continue;
        count += pictures.items.len;
        const results = try module.readMany(a, &session, section_index, pictures.items);
        defer a.free(results);
        for (pictures.items, results) |picture, result| {
            const owner = module.read(a, &session, section_index, picture) catch |err| {
                try std.testing.expectEqualDeep(module.Result{ .failure = err }, result);
                continue;
            };
            try std.testing.expectEqualDeep(module.Result{ .owner = owner }, result);
        }
    }
    try std.testing.expect(count > 0);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
    try std.testing.expectError(error.InvalidSectionIndex, module.readMany(a, &session, session.sections.len, &.{}));
}

test "picture owner batch isolates invalid requests and remains atomic under allocation failures" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:pic/></p:run></p:p></s:sec>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const module = @import("picture_owner.zig");
    const picture = for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "pic")) break index;
    } else return error.MissingPicture;
    const expected = try module.read(a, &session, 0, picture);
    const empty = try module.readMany(a, &session, 0, &.{});
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    const empty_without_allocations = try module.readMany(failing.allocator(), &session, 0, &.{});
    defer failing.allocator().free(empty_without_allocations);
    try std.testing.expectEqual(@as(usize, 0), empty_without_allocations.len);
    const report = try @import("picture_owner_batch_report.zig").read(a, &session, 0);
    defer a.free(report);
    try std.testing.expectEqual(@as(usize, 1), report.len);
    try std.testing.expectEqual(picture, report[0].picture_node);
    try std.testing.expectEqualDeep(expected, report[0].owner.?);
    try std.testing.expect(report[0].failure == null);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, node: usize, owner: module.Owner) !void {
            const results = try module.readMany(allocator, source, 0, &.{ source.sections[0].tree.elements.len, node, node });
            defer allocator.free(results);
            try std.testing.expectEqualDeep(module.Result{ .failure = error.InvalidPictureDisplayNode }, results[0]);
            try std.testing.expectEqualDeep(module.Result{ .owner = owner }, results[1]);
            try std.testing.expectEqualDeep(results[1], results[2]);
        }
    }.run, .{ &session, picture, expected });
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, node: usize, owner: module.Owner) !void {
            const rows = try @import("picture_owner_batch_report.zig").read(allocator, source, 0);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 1), rows.len);
            try std.testing.expectEqual(node, rows[0].picture_node);
            try std.testing.expectEqualDeep(owner, rows[0].owner.?);
            try std.testing.expect(rows[0].failure == null);
            const bytes = try std.json.Stringify.valueAlloc(allocator, rows, .{});
            defer allocator.free(bytes);
            try std.testing.expect(std.mem.indexOf(u8, bytes, "\"failure\":null") != null);
        }
    }.run, .{ &session, picture, expected });
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
