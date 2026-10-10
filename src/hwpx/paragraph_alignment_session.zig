//! Alignment edits clone resources and commit only after validated saving.
const std = @import("std");
const editor = @import("editor_session.zig");
pub fn apply(session: *editor.Session, section: usize, paragraph: usize, alignment: @import("paragraph_resource_clone.zig").Alignment) !bool {
    return applyWithMargins(session, section, paragraph, alignment, .{});
}
pub fn applyWithMargins(session: *editor.Session, section: usize, paragraph: usize, requested_alignment: ?@import("paragraph_resource_clone.zig").Alignment, patch: @import("paragraph_margin_patch.zig").Patch) !bool {
    return applyWithProperties(session, section, paragraph, requested_alignment, patch, null);
}
pub fn applyWithProperties(session: *editor.Session, section: usize, paragraph: usize, requested_alignment: ?@import("paragraph_resource_clone.zig").Alignment, patch: @import("paragraph_margin_patch.zig").Patch, requested_spacing: ?@import("paragraph_spacing_patch.zig").Spacing) !bool {
    if (requested_spacing) |value| try @import("paragraph_spacing_patch.zig").validate(value);
    const a = session.allocator;
    const current = try session.paragraphShapeId(section, paragraph);
    const shapes = try session.paragraphShapes();
    defer @import("paragraph_display_resources.zig").deinit(a, shapes);
    var alignment = requested_alignment;
    var unchanged = true;
    var found = false;
    for (shapes) |shape| if (shape.id == current) {
        found = true;
        const horizontal = shape.horizontal orelse return error.MissingParagraphAlignment;
        if (alignment == null) alignment = std.meta.stringToEnum(@import("paragraph_resource_clone.zig").Alignment, horizontal) orelse return error.InvalidParagraphAlignment;
        unchanged = std.mem.eql(u8, horizontal, @tagName(alignment.?));
        if (requested_spacing) |value| {
            const current_spacing = shape.spacing orelse return error.MissingParagraphSpacing;
            if (value.kind != 0) {
                if (current_spacing.unit) |unit| if (!std.mem.eql(u8, unit, "HWPUNIT")) return error.UnsupportedParagraphSpacingUnit;
            }
            const kind = shape.spacing_type orelse return error.MissingParagraphSpacing;
            const names = @import("paragraph_spacing_patch.zig").names;
            unchanged = unchanged and std.mem.eql(u8, kind, names[value.kind]) and current_spacing.value == value.value;
        }
        const values = [_]?i32{ patch.indent, patch.left, patch.right, patch.before, patch.after };
        for (values, 0..) |maybe, index| if (maybe) |value| {
            const margin = shape.margins[index] orelse return error.MissingParagraphMargin;
            if (margin.unit) |unit| if (!std.mem.eql(u8, unit, "HWPUNIT")) return error.UnsupportedParagraphMarginUnit;
            if (margin.value != value) unchanged = false;
        };
    };
    if (!found) return error.InvalidParagraphShapeReference;
    if (unchanged) return false;
    var source_id = current;
    var margins: @import("paragraph_margin_patch.zig").Patch = .{};
    var spacing: ?@import("paragraph_spacing_patch.zig").Spacing = null;
    for (session.paragraph_resources.entries.items) |entry| if (entry.id == current) {
        source_id = entry.source_id;
        margins = entry.margins;
        spacing = entry.spacing;
        break;
    };
    var original = session.*;
    original.paragraph_resources = .{};
    const ids = try original.paragraphShapeIds();
    defer a.free(ids);
    var pending = try session.paragraph_resources.clone(a);
    errdefer pending.deinit(a);
    inline for (std.meta.fields(@import("paragraph_margin_patch.zig").Patch)) |field| {
        if (@field(patch, field.name)) |value| @field(margins, field.name) = value;
    }
    if (requested_spacing) |value| spacing = value;
    const id = try pending.addWithProperties(a, ids, source_id, alignment.?, margins, spacing);
    std.mem.swap(@import("paragraph_resource_values.zig").Values, &pending, &session.paragraph_resources);
    const changed = session.setParagraphFormat(section, paragraph, id) catch |err| {
        std.mem.swap(@import("paragraph_resource_values.zig").Values, &pending, &session.paragraph_resources);
        return err;
    };
    pending.deinit(a);
    return changed;
}

test "HWPX paragraph margins history preserves alignment and saved values" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const paragraph = session.sections[0].first_paragraph + 5;
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .paragraph_margins, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_margins = .{ .indent = -720, .before = 0 } };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expect(!try history.apply(&session, command));
    var alignment_command = command;
    alignment_command.kind = .paragraph_alignment;
    alignment_command.paragraph_alignment = .CENTER;
    try std.testing.expect(try history.apply(&session, alignment_command));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const id = try reopened.paragraphShapeId(0, paragraph);
    const shapes = try reopened.paragraphShapes();
    defer @import("paragraph_display_resources.zig").deinit(a, shapes);
    var found = false;
    for (shapes) |shape| if (shape.id == id) {
        found = true;
        try std.testing.expectEqualStrings("CENTER", shape.horizontal.?);
        try std.testing.expectEqual(@as(?i64, -720), shape.margins[0].?.value);
        try std.testing.expectEqual(@as(?i64, 0), shape.margins[3].?.value);
    };
    try std.testing.expect(found);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, bytes, original);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "HWPX paragraph alignment session saves current resources and reuses edits" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const paragraph = session.sections[0].first_paragraph;
    try std.testing.expect(try apply(&session, 0, paragraph, .RIGHT));
    const right = try session.paragraphShapeId(0, paragraph);
    try std.testing.expect(!try apply(&session, 0, paragraph, .RIGHT));
    try std.testing.expect(try apply(&session, 0, paragraph, .CENTER));
    try std.testing.expect(try apply(&session, 0, paragraph, .RIGHT));
    try std.testing.expectEqual(right, try session.paragraphShapeId(0, paragraph));
    try std.testing.expectEqual(@as(usize, 2), session.paragraph_resources.entries.items.len);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(right, try reopened.paragraphShapeId(0, paragraph));
    const previous_limit = session.options.max_xml_bytes;
    session.options.max_xml_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, apply(&session, 0, paragraph, .LEFT));
    session.options.max_xml_bytes = previous_limit;
    try std.testing.expectEqual(right, try session.paragraphShapeId(0, paragraph));
    try std.testing.expectEqual(@as(usize, 2), session.paragraph_resources.entries.items.len);
}

test "HWPX paragraph alignment history restores resources and rolls back growth" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const paragraph = session.sections[0].first_paragraph;
    const original_id = try session.paragraphShapeId(0, paragraph);
    const initial_size = try @import("editor_checkpoint.zig").size(&session, 4_000_000);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .paragraph_alignment, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_alignment = .RIGHT };
    try std.testing.expect(try history.apply(&session, command));
    const changed_id = try session.paragraphShapeId(0, paragraph);
    const changed = try session.save();
    defer a.free(changed);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expectEqual(original_id, try session.paragraphShapeId(0, paragraph));
    try std.testing.expectEqual(@as(usize, 0), session.paragraph_resources.entries.items.len);
    var invalid = command;
    invalid.inserted = "x";
    try std.testing.expectError(error.InvalidParagraphFormatCommand, history.apply(&session, invalid));
    history.max_checkpoint_bytes = initial_size;
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, command));
    try std.testing.expectEqual(@as(usize, 0), session.paragraph_resources.entries.items.len);
    try std.testing.expectEqual(original_id, try session.paragraphShapeId(0, paragraph));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    history.max_checkpoint_bytes = 4_000_000;
    try std.testing.expect(try history.redo(&session));
    try std.testing.expectEqual(changed_id, try session.paragraphShapeId(0, paragraph));
    try std.testing.expect(!try history.apply(&session, command));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
}
