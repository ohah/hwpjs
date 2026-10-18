const std = @import("std");

test "HWPX memo label actual aift retains both complete annotation subtrees" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/aift.hwpx", a, .limited(64 * 1024 * 1024));
            defer a.free(input);
            var session = try @import("editor_session.zig").open(a, input, .{});
            defer session.deinit();
            for ([_]usize{ 3008, 3011 }) |paragraph| {
                const labels = try session.fieldLabels(2, paragraph);
                defer a.free(labels);
                try std.testing.expectEqual(@as(usize, 1), labels.len);
                const original = session.sections[2].tree.sourceOf(labels[0].begin_element);
                try std.testing.expect(try session.spliceFieldLabel(2, paragraph, labels[0].begin_element, labels[0].start, 0, "memo😀"));
                const saved = try session.save();
                defer a.free(saved);
                var reopened = try @import("editor_session.zig").open(a, saved, .{});
                defer reopened.deinit();
                const current = try reopened.fieldLabels(2, paragraph);
                defer a.free(current);
                try std.testing.expectEqual(@as(usize, 1), current.len);
                try std.testing.expectEqual(labels[0].end + 6, current[0].end);
                try std.testing.expectEqualSlices(u8, original, reopened.sections[2].tree.sourceOf(current[0].begin_element));
                const resaved = try reopened.save();
                defer a.free(resaved);
                try std.testing.expectEqualSlices(u8, saved, resaved);
            }
        }
    }.run, .{});
}

test "HWPX memo label preserves the distinct annotation subtree" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:ctrl><p:fieldBegin id='8' type='MEMO' editable='1' dirty='0'>" ++
        "<p:parameters cnt='1'><p:stringParam name='Author'>owner</p:stringParam></p:parameters>" ++
        "<p:subList id='note'><p:p><p:run><p:t>annotation😀</p:t></p:run></p:p></p:subList>" ++
        "</p:fieldBegin></p:ctrl><p:t>marked</p:t><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const labels = try session.fieldLabels(0, 1);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    try std.testing.expectEqual(@as(u32, 0), labels[0].start);
    try std.testing.expectEqual(@as(u32, 6), labels[0].end);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *@import("editor_session.zig").Session, begin: usize) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(@TypeOf(source.sections[0]), source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].field_dirty = .empty;
            defer proxy.sections[0].field_dirty.deinit(allocator);
            const changed = proxy.spliceFieldLabel(0, 1, begin, 0, 0, "X") catch |err| {
                try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].field_dirty.items.len);
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| {
                    try std.testing.expectEqualSlices(u8, before.text, after.text);
                    try std.testing.expectEqual(before.start, after.start);
                    try std.testing.expectEqual(before.end, after.end);
                }
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 1), proxy.sections[0].field_dirty.items.len);
            for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| {
                if (std.mem.eql(u8, before.text, "marked")) try std.testing.expectEqualStrings("Xmarked", after.text) else try std.testing.expectEqualSlices(u8, before.text, after.text);
            }
        }
    }.run, .{ &session, labels[0].begin_element });
    try std.testing.expect(try session.spliceFieldLabel(0, 1, labels[0].begin_element, 0, 0, "label😀"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const again = try reopened.fieldLabels(0, 1);
    defer a.free(again);
    try std.testing.expectEqual(@as(usize, 1), again.len);
    try std.testing.expectEqual(@as(u32, 13), again[0].end);
    const xml = reopened.sections[0].tree.source;
    try std.testing.expect(std.mem.indexOf(u8, xml, "annotation😀") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<p:stringParam name='Author'>owner</p:stringParam>") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "label😀marked") != null);
}
