const std = @import("std");
const editor = @import("editor_session.zig");

test "HWPX editor session field command allocation failures preserve text and dirty state" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A😀</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, xml: []const u8) !void {
            var tree = try @import("xml_part_tree.zig").parse(allocator, xml, .section, 0, 0, .{});
            var tree_transferred = false;
            defer if (!tree_transferred) tree.deinit(allocator);
            const options: @import("text_sites.zig").Options = .{ .materialize_tab_boundaries = true, .branch_policy = .{ .mode = .selected } };
            var sites = try @import("text_sites.zig").collect(allocator, &tree, options);
            var sites_transferred = false;
            defer if (!sites_transferred) sites.deinit(allocator);
            const locations = try @import("text_site_locations.zig").build(allocator, &tree, &sites, options);
            var locations_transferred = false;
            defer if (!locations_transferred) allocator.free(locations);
            const sections = try allocator.alloc(editor.Section, 1);
            defer allocator.free(sections);
            const original = try allocator.dupe(u8, "");
            sections[0] = .{ .tree = tree, .sites = sites, .locations = locations, .entry_index = 0, .first_paragraph = 1, .last_paragraph = 1 };
            var session: editor.Session = .{ .allocator = allocator, .source = original, .sections = sections, .options = .{} };
            tree_transferred = true;
            sites_transferred = true;
            locations_transferred = true;
            // The array cleanup now belongs exclusively to Session.
            defer {
                session.sections[0].field_dirty.deinit(allocator);
                allocator.free(session.sections[0].locations);
                session.sections[0].sites.deinit(allocator);
                session.sections[0].tree.deinit(allocator);
                allocator.free(session.source);
            }
            const begin = find_begin: {
                for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break :find_begin index;
                return error.InvalidFieldElement;
            };
            const descriptors = try session.fieldLabels(0, 1);
            defer allocator.free(descriptors);
            try std.testing.expectEqual(@as(usize, 1), descriptors.len);
            try std.testing.expectEqual(@as(u32, @intCast(begin)), descriptors[0].begin_element);
            try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
            _ = session.spliceFieldLabel(0, 1, begin, 0, 0, "한") catch |err| {
                try std.testing.expectEqualStrings("A😀", session.sections[0].sites.items[0].text);
                try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
                try std.testing.expectEqualSlices(u8, xml, session.sections[0].tree.source);
                return err;
            };
            try std.testing.expectEqualStrings("한A😀", session.sections[0].sites.items[0].text);
            try std.testing.expectEqual(@as(usize, 1), session.sections[0].field_dirty.items.len);
        }
    }.run, .{source});
}

test "HWPX editor session field label saves owned dirty state and survives rejected command" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const trees = [_]@import("xml_part_tree.zig").Tree{section.tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &report);
    defer a.free(ranges);
    var exercised = false;
    for (ranges) |field| {
        for (section.sites.items, section.locations) |site, location| {
            if (site.start < field.content_start or site.start >= field.content_end) continue;
            const segments = try @import("paragraph_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, location.paragraph_ordinal);
            defer a.free(segments);
            const span = @import("field_text_positions.zig").project(field, 0, segments).?;
            const begin = report.markers[field.begin_marker].element_index;
            const start: u32 = @intCast(span.start_unit);
            const targets = try session.fieldLabels(0, location.paragraph_ordinal);
            defer a.free(targets);
            try std.testing.expect(targets.len > 0);
            try std.testing.expectEqual(@as(u32, @intCast(begin)), targets[0].begin_element);
            try std.testing.expectEqual(start, targets[0].start);
            try std.testing.expect(!try session.spliceFieldLabel(0, location.paragraph_ordinal, begin, start, 0, ""));
            try std.testing.expectEqual(@as(usize, 0), section.field_dirty.items.len);
            try std.testing.expect(try session.spliceFieldLabel(0, location.paragraph_ordinal, begin, start, 0, "검증😀<&"));
            try std.testing.expectEqual(@as(usize, 1), section.field_dirty.items.len);
            const changed_targets = try session.fieldLabels(0, location.paragraph_ordinal);
            defer a.free(changed_targets);
            try std.testing.expectEqual(targets[0].end + 6, changed_targets[0].end);
            const saved = try session.save();
            defer a.free(saved);
            var reopened = try editor.open(a, saved, .{});
            defer reopened.deinit();
            for (section.sites.items, reopened.sections[0].sites.items) |expected, actual| try std.testing.expectEqualStrings(expected.text, actual.text);
            const dirty = try @import("xml_part_attributes.zig").find(a, &reopened.sections[0].tree, begin, "", "dirty");
            const decoded = try dirty.?.toUtf8(a, 100);
            defer a.free(decoded);
            try std.testing.expect(try @import("xml_values.zig").boolean(decoded));
            try std.testing.expectError(error.SplitSurrogatePair, session.spliceFieldLabel(0, location.paragraph_ordinal, begin, start + 3, 0, "x"));
            const after_failure = try session.save();
            defer a.free(after_failure);
            try std.testing.expectEqualSlices(u8, saved, after_failure);
            try std.testing.expectEqualSlices(u8, input, session.source);
            exercised = true;
            break;
        }
        if (exercised) break;
    }
    try std.testing.expect(exercised);
}

test "HWPX editor session rejects encrypted fixture before exposing editable state" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.expectError(error.EncryptedDocument, editor.open(a, input, .{}));
}

test "HWPX editor session releases partial allocations through open edit save reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var session = try editor.open(allocator, source, .{});
            defer session.deinit();
            _ = try session.splice(0, 2, 0, 0, "검증😀<&\r");
            const output = try session.save();
            defer allocator.free(output);
            var reopened = try editor.open(allocator, output, .{});
            defer reopened.deinit();
            for (session.sections[0].sites.items, reopened.sections[0].sites.items) |expected, actual| {
                try std.testing.expectEqualStrings(expected.text, actual.text);
            }
        }
    }.run, .{input});
}

test "HWPX editor session rejects bounded input and preserves edits after failed operations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.expectError(error.LimitExceeded, editor.open(a, input, .{ .max_input_bytes = input.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, editor.open(a, input, .{ .max_text_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, editor.open(a, input, .{ .max_xml_bytes = 0 }));
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splice(0, 2, 0, 0, "😀");
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.SplitSurrogatePair, session.splice(0, 2, 1, 0, "x"));
    try std.testing.expectError(error.InvalidTextPosition, session.splice(0, 2, std.math.maxInt(u32), 0, "x"));
    var total: usize = 0;
    for (session.sections) |section| for (section.sites.items) |site| {
        total += site.text.len;
    };
    session.options.max_text_bytes = total;
    try std.testing.expectError(error.LimitExceeded, session.splice(0, 2, 0, 0, "x"));
    session.options.max_output_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, session.save());
    session.options.max_output_bytes = 128 * 1024 * 1024;
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "HWPX editor session owns input and applies saves reopens restores actual document" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(session.source.ptr != input.ptr);
    const noop = try session.save();
    defer a.free(noop);
    try std.testing.expectEqualSlices(u8, input, noop);
    try std.testing.expectError(error.InvalidSectionIndex, session.splice(1, 2, 0, 0, "x"));
    try std.testing.expectError(error.InvalidParagraphIndex, session.splice(0, 0, 0, 0, "x"));
    try std.testing.expect(try session.splice(0, 2, 0, 0, "검증"));
    const output = try session.save();
    defer a.free(output);
    var reopened = try editor.open(a, output, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(session.sections[0].sites.items.len, reopened.sections[0].sites.items.len);
    for (session.sections[0].sites.items, reopened.sections[0].sites.items) |current, actual| try std.testing.expectEqualStrings(current.text, actual.text);
    _ = try session.splice(0, 2, 0, 2, "");
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
}
