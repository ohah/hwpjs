const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const locations_mod = @import("text_site_locations.zig");
const edit = @import("plain_paragraph_edit.zig");

test "HWPX header footer owner split preserves edited nested bodies" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리😀");
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const trees.Tree, values: *const @import("paragraph_structure_values.zig").Values) !void {
            const borrowed = (try @import("paragraph_page_area_order.zig").saveView(allocator, tree, values)) orelse return error.MissingPageAreaGroup;
            defer allocator.free(borrowed);
            try std.testing.expectEqual(values.paragraphs.len, borrowed.len);
            try std.testing.expectEqual(@as(?u32, null), values.paragraphs[2].generated_id);
            try std.testing.expect(borrowed[2].generated_id != null);
        }
    }.run, .{ &session.sections[0].tree, &session.sections[0].structure_values.? });
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 5), reopened.sections[0].last_paragraph);
    for (1..6) |paragraph| {
        const current = try session.anchorText(0, paragraph);
        defer a.free(current);
        const restored = try reopened.anchorText(0, paragraph);
        defer a.free(restored);
        try std.testing.expectEqualStrings(current, restored);
    }
    try std.testing.expect(try session.splice(0, 5, 0, 0, "본문😀"));
    try std.testing.expect(try session.splitParagraph(0, 5, 2, 0));
    const repeated = try session.save();
    defer a.free(repeated);
    var repeated_session = try @import("editor_session.zig").open(a, repeated, .{});
    defer repeated_session.deinit();
    for (1..7) |paragraph| {
        const current = try session.anchorText(0, paragraph);
        defer a.free(current);
        const restored = try repeated_session.anchorText(0, paragraph);
        defer a.free(restored);
        try std.testing.expectEqualStrings(current, restored);
    }
}

test "HWPX header footer public split allocation failures preserve prior edits" {
    try @import("../testing/checked_allocator.zig").run(publicSplitAllocationFailures, .{});
}

fn publicSplitAllocationFailures(a: std.mem.Allocator) !void {
    const editor = @import("editor_session.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.spliceAnchored(0, 3, 0, 0, "기존머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "기존꼬리😀");
    const baseline = try session.save();
    defer a.free(baseline);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].structure_values = null;
            defer if (proxy.sections[0].structure_values) |*values| values.deinit(allocator);
            _ = proxy.splitParagraph(0, 2, 0, 0) catch |err| {
                try std.testing.expect(proxy.sections[0].structure_values == null);
                try std.testing.expectEqual(source.sections[0].last_paragraph, proxy.sections[0].last_paragraph);
                try std.testing.expectEqual(source.sections[0].sites.items.len, proxy.sections[0].sites.items.len);
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| {
                    try std.testing.expectEqualStrings(before.text, after.text);
                    try std.testing.expectEqual(before.element_index, after.element_index);
                    try std.testing.expectEqual(before.start, after.start);
                    try std.testing.expectEqual(before.end, after.end);
                }
                return err;
            };
            try std.testing.expectEqual(source.sections[0].last_paragraph + 1, proxy.sections[0].last_paragraph);
        }
    }.run, .{&session});
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, baseline, after);
}

test "HWPX header footer edit keeps three paragraph owners through allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:ctrl><p:header id='1'><p:subList><p:p><p:run><p:t>HEAD</p:t></p:run></p:p></p:subList></p:header></p:ctrl><p:ctrl><p:footer id='2'><p:subList><p:p><p:run><p:t>FOOT</p:t></p:run></p:p></p:subList></p:footer></p:ctrl><p:t>BC</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree) !void {
            var sites = try sites_mod.collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const locations = try locations_mod.build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            _ = edit.splice(allocator, parsed, &sites, locations, 1, 4, 1, "뒤😀", 10000) catch |err| {
                try std.testing.expectEqualStrings("A😀", sites.items[0].text);
                try std.testing.expectEqualStrings("HEAD", sites.items[1].text);
                try std.testing.expectEqualStrings("FOOT", sites.items[2].text);
                try std.testing.expectEqualStrings("BC", sites.items[3].text);
                return err;
            };
            try std.testing.expectEqualStrings("HEAD", sites.items[1].text);
            try std.testing.expectEqualStrings("FOOT", sites.items[2].text);
            try std.testing.expectEqualStrings("B뒤😀", sites.items[3].text);
            _ = try edit.splice(allocator, parsed, &sites, locations, 2, 0, 1, "h", 10000);
            _ = try edit.splice(allocator, parsed, &sites, locations, 3, 0, 1, "f", 10000);
            try std.testing.expectEqualStrings("hEAD", sites.items[1].text);
            try std.testing.expectEqualStrings("fOOT", sites.items[2].text);
            const saved = try @import("text_sites_save.zig").write(allocator, parsed, &sites, .{}, 10000);
            defer allocator.free(saved);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:header id='1'><p:subList><p:p><p:run><p:t>hEAD</p:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:footer id='2'><p:subList><p:p><p:run><p:t>fOOT</p:t>") != null);
        }
    }.run, .{&tree});
}

test "HWPX header footer edit refuses hidden gaps and ambiguous ownership" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<p:header/>",
        "<p:header>hidden<p:subList/></p:header>",
        "<p:header><p:subList/><p:subList/></p:header>",
        "<p:header><p:subList>hidden</p:subList></p:header>",
        "<p:header><p:subList><p:t>hidden</p:t></p:subList></p:header>",
        "<p:footer><subList xmlns='urn:foreign'/></p:footer>",
        "<p:footer><p:subList><p:unknown/></p:subList></p:footer>",
    }) |area| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl>", area, "</p:ctrl><p:t>BODY</p:t></p:run></p:p></s:sec>" });
        defer a.free(source);
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_mod.collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try locations_mod.build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectError(error.UnsupportedParagraphControl, edit.splice(a, &tree, &sites, locations, 1, 0, 0, "X", 10000));
    }
}
