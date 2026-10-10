const std = @import("std");
test "HWPX protected style command and input remain atomic on allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var baseline = try @import("editor_session.zig").open(a, input, .{});
    defer baseline.deinit();
    const ids = try @import("character_style_resources.zig").ids(&baseline);
    defer a.free(ids);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, id: u32) !void {
            var session = try @import("editor_session.zig").open(allocator, bytes, .{});
            defer session.deinit();
            _ = session.setCharacterFormat(0, 1, 0, 2, id) catch |err| {
                try std.testing.expect(session.sections[0].structure_values == null);
                return err;
            };
            const paragraph = &session.sections[0].structure_values.?.paragraphs[0];
            const length = paragraph.character_styles.?[paragraph.character_styles.?.len - 1].end_unit;
            const count = paragraph.character_styles.?.len;
            _ = session.spliceAnchored(0, 1, 0, 0, "입😀<&") catch |err| {
                try std.testing.expectEqual(count, paragraph.character_styles.?.len);
                try std.testing.expectEqual(length, paragraph.character_styles.?[count - 1].end_unit);
                for (paragraph.sites.items) |site| try std.testing.expectEqual(@as(usize, 0), site.text.len);
                return err;
            };
            const output = try session.save();
            defer allocator.free(output);
        }
    };
    try Probe.run(a, input, ids[ids.len - 1]);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ input, ids[ids.len - 1] });
}
test "HWPX character style public command validates real IDs and preserves redo on refusal" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    const ids = resources.table(.char_shape).ids.items;
    const id = ids[ids.len - 1];
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .format, .paragraph = 2, .start = 1, .deleted = 1, .inserted = "", .char_shape_id = id };
    try std.testing.expect(try history.apply(&session, command));
    const edited = try session.save();
    defer a.free(edited);
    try std.testing.expect(!try history.apply(&session, command));
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    var invalid = command;
    invalid.char_shape_id = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidResourceReference, history.apply(&session, invalid));
    invalid = command;
    invalid.start = 3;
    invalid.deleted = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidTextPosition, history.apply(&session, invalid));
    try std.testing.expect(try history.redo(&session));
    const redo = try session.save();
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, edited, redo);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, resource_id: u32) !void {
            var current = try @import("editor_session.zig").open(allocator, bytes, .{});
            defer current.deinit();
            _ = current.setCharacterFormat(0, 2, 1, 2, resource_id) catch |err| {
                try std.testing.expect(current.sections[0].structure_values == null);
                return err;
            };
        }
    }.run, .{ input, id });
}
test "HWPX character style owned paragraph saves real fixture and checkpoint restores original ZIP" {
    const a = std.testing.allocator;
    const editor = @import("editor_session.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var before = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer before.deinit();
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    const ids = resources.table(.char_shape).ids.items;
    try std.testing.expect(ids.len > 1);
    const section = &session.sections[0];
    var counters: @import("section_text.zig").Report = .{ .paragraphs = section.first_paragraph - 1 };
    var owned = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
    errdefer owned.deinit(a);
    const paragraph = &owned.paragraphs[1];
    const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, paragraph);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, &section.tree, &paragraph.sites, locations, 1);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &section.tree, &paragraph.sites, positions, 1000);
    defer a.free(projection);
    const original = try @import("character_style_paint.zig").fromProjection(a, projection, 1000);
    defer a.free(original);
    const end = std.math.cast(u32, original[original.len - 1].end_unit) orelse return error.LimitExceeded;
    paragraph.character_styles = try @import("character_style_paint.zig").prepare(a, &paragraph.sites, original, 0, end, ids[ids.len - 1], ids, 1000);
    const empty = try a.alloc(@import("text_sites.zig").Site, 0);
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = owned;
    // Ownership transferred to Session, including the current style partition.
    owned.paragraphs = &.{};
    section.sites.items = paragraph.sites.items[0..1];
    const duplicate = session.setCharacterFormat(0, section.first_paragraph + 1, 0, 1, ids[0]);
    section.sites.items = empty;
    try std.testing.expectError(error.DuplicateCurrentTextOwner, duplicate);
    const edited = try session.save();
    defer a.free(edited);
    var reopened = try editor.open(a, edited, .{});
    defer reopened.deinit();
    const text = try session.anchorText(0, section.first_paragraph + 1);
    defer a.free(text);
    const reopened_text = try reopened.anchorText(0, reopened.sections[0].first_paragraph + 1);
    defer a.free(reopened_text);
    try std.testing.expectEqualStrings(text, reopened_text);
    var inspected: usize = 0;
    for (reopened.sections[0].sites.items, reopened.sections[0].locations) |site, location| {
        if (location.paragraph_ordinal != reopened.sections[0].first_paragraph + 1) continue;
        const element = reopened.sections[0].tree.elements[site.element_index];
        const raw = (try reopened.sections[0].tree.attributeValue(a, element.parent.?, "", "charPrIDRef")).?;
        const value = try raw.toUtf8(a, 100);
        defer a.free(value);
        try std.testing.expectEqual(ids[ids.len - 1], try @import("xml_values.zig").unsigned32(value));
        inspected += 1;
    }
    try std.testing.expect(inspected > 0);
    var after = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer after.deinit();
    try before.exchange(&session);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try after.exchange(&session);
    const redo = try session.save();
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, edited, redo);
    try std.testing.expect(try session.splice(0, section.first_paragraph + 1, 0, 0, "서식입력😀<&"));
    const typed = try session.save();
    defer a.free(typed);
    var typed_session = try editor.open(a, typed, .{});
    defer typed_session.deinit();
    const typed_text = try typed_session.anchorText(0, typed_session.sections[0].first_paragraph + 1);
    defer a.free(typed_text);
    try std.testing.expect(std.mem.startsWith(u8, typed_text, "서식입력😀<&"));
    try std.testing.expect(try session.splitParagraph(0, section.first_paragraph + 1, 1, 0));
    const split_zip = try session.save();
    defer a.free(split_zip);
    var split_session = try editor.open(a, split_zip, .{});
    defer split_session.deinit();
    const first = try split_session.anchorText(0, split_session.sections[0].first_paragraph + 1);
    defer a.free(first);
    const second = try split_session.anchorText(0, split_session.sections[0].first_paragraph + 2);
    defer a.free(second);
    try std.testing.expectEqualStrings("서", first);
    try std.testing.expect(std.mem.startsWith(u8, second, "식입력😀<&"));
    try std.testing.expect(try session.splice(0, section.first_paragraph + 2, 0, 0, "생성문단"));
    try std.testing.expect(try session.mergeParagraph(0, section.first_paragraph + 1));
    const merged_zip = try session.save();
    defer a.free(merged_zip);
    var merged = try editor.open(a, merged_zip, .{});
    defer merged.deinit();
    const merged_text = try merged.anchorText(0, merged.sections[0].first_paragraph + 1);
    defer a.free(merged_text);
    try std.testing.expect(std.mem.startsWith(u8, merged_text, "서생성문단식입력😀<&"));
}
