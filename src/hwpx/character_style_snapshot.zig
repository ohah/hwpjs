//! Detached current style projection; never installs values or serializes XML.
const std = @import("std");
const editor = @import("editor_session.zig");
const display = @import("character_style_display_ranges.zig");
const Span = display.Range;

fn displayPositions(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, locations: []const @import("section_text.zig").Location, paragraph: usize) ![]@import("paragraph_text_positions.zig").Segment {
    @import("plain_paragraph_policy.zig").validateForCharacterFormat(tree, sites, locations, paragraph) catch |err| switch (err) {
        error.UnsupportedParagraphControl, error.UnsupportedInlineControl => return @import("anchor_paragraph_edit.zig").segments(a, tree, sites, locations, paragraph),
        else => return err,
    };
    return @import("paragraph_text_positions.zig").buildForFieldText(a, tree, sites, locations, paragraph);
}

fn copyStyles(a: std.mem.Allocator, styles: []const @import("character_style_paint.zig").Span) ![]Span {
    const output = try a.alloc(Span, styles.len);
    for (styles, output) |style, *row| row.* = .{ .start_unit = style.start_unit, .end_unit = style.end_unit, .char_shape_id = style.char_shape_id, .inline_element = style.tab_element };
    return output;
}

pub fn read(session: *const editor.Session, section_index: usize, paragraph_index: usize) ![]Span {
    return readScoped(session, section_index, paragraph_index, null);
}
pub const SourceIndex = struct {
    allocator: std.mem.Allocator,
    sections: std.AutoHashMapUnmanaged(usize, std.AutoHashMapUnmanaged(usize, std.ArrayList(usize))) = .empty,
    source_visits: usize = 0,
    builds: usize = 0,
    pub fn deinit(self: *SourceIndex) void {
        var sections = self.sections.valueIterator();
        while (sections.next()) |map| {
            var rows = map.valueIterator();
            while (rows.next()) |indices| indices.deinit(self.allocator);
            map.deinit(self.allocator);
        }
        self.sections.deinit(self.allocator);
    }
    fn selectedIndices(self: *SourceIndex, section: *const editor.Section, section_index: usize, paragraph: usize) ![]const usize {
        if (!self.sections.contains(section_index)) {
            var map: std.AutoHashMapUnmanaged(usize, std.ArrayList(usize)) = .empty;
            errdefer {
                var rows = map.valueIterator();
                while (rows.next()) |list| list.deinit(self.allocator);
                map.deinit(self.allocator);
            }
            for (section.locations, 0..) |location, i| {
                const row = try map.getOrPut(self.allocator, location.paragraph_ordinal);
                if (!row.found_existing) row.value_ptr.* = .empty;
                try row.value_ptr.append(self.allocator, i);
                self.source_visits += 1;
            }
            try self.sections.put(self.allocator, section_index, map);
            self.builds += 1;
        }
        const map = self.sections.getPtr(section_index).?;
        return if (map.get(paragraph)) |row| row.items else &.{};
    }
};
pub fn readScoped(session: *const editor.Session, section_index: usize, paragraph_index: usize, context: ?*SourceIndex) ![]Span {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph_index < section.first_paragraph or paragraph_index > section.last_paragraph) return error.InvalidParagraphIndex;
    if (section.structure_values != null and section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    const a = session.allocator;
    const values = if (section.structure_values) |*current| current else return readOriginal(session, section, section_index, paragraph_index, context);
    const ordinal = paragraph_index - section.first_paragraph;
    if (ordinal >= values.paragraphs.len) return error.InvalidParagraphIndex;
    const paragraph = &values.paragraphs[ordinal];
    if (paragraph.synthesized_run_character_id) |id| {
        try @import("runless_paragraph_current.zig").validate(&section.tree, paragraph);
        if (paragraph.character_styles) |styles| return copyStyles(a, styles);
        const units = try @import("text_site_edit.zig").utf16Length(paragraph.sites.items[0].text);
        return a.dupe(Span, &.{.{ .start_unit = 0, .end_unit = units, .char_shape_id = id }});
    }
    if (paragraph.sites.items.len == 0 and try @import("runless_paragraph_session.zig").eligible(session, section_index, paragraph_index)) {
        const id = try @import("runless_paragraph_session.zig").characterShapeId(session, section_index, paragraph_index);
        return a.dupe(Span, &.{.{ .start_unit = 0, .end_unit = 0, .char_shape_id = id }});
    }
    if (try @import("character_style_formula_snapshot.zig").read(session, section_index, paragraph_index)) |ranges| return ranges;
    if (paragraph.title_output_projection) |*plan| {
        try plan.validate(paragraph);
        return a.dupe(Span, plan.ranges);
    }
    if (paragraph.character_styles) |styles| return copyStyles(a, styles);
    const positions = if (paragraph.field_positions != null)
        try @import("field_owned_positions.zig").build(a, &section.tree, paragraph)
    else if (paragraph.protected_positions != null)
        try @import("paragraph_protected_positions.zig").build(a, &section.tree, paragraph)
    else if (paragraph.joined()) |view|
        try @import("paragraph_joined_positions.zig").build(a, &section.tree, &view)
    else block: {
        const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, paragraph);
        defer a.free(locations);
        break :block try displayPositions(a, &section.tree, &paragraph.sites, locations, 1);
    };
    defer a.free(positions);
    return display.build(a, &section.tree, &paragraph.sites, positions, session.options.max_sites);
}

fn readOriginal(session: *const editor.Session, section: *const editor.Section, section_index: usize, paragraph: usize, context: ?*SourceIndex) ![]Span {
    const a = session.allocator;
    if (section.locations.len != section.sites.items.len) return error.InvalidTextSites;
    const selected = if (context) |index| try index.selectedIndices(section, section_index, paragraph) else null;
    var count: usize = if (selected) |indices| indices.len else 0;
    if (selected == null) for (section.locations) |location| {
        if (location.paragraph_ordinal == paragraph) count += 1;
    };
    if (count == 0) {
        const id = try @import("runless_paragraph_session.zig").characterShapeId(session, section.tree.section_ordinal orelse return error.InvalidSectionIndex, paragraph);
        return a.dupe(Span, &.{.{ .start_unit = 0, .end_unit = 0, .char_shape_id = id }});
    }
    if (context == null) {
        if (try @import("character_style_formula_snapshot.zig").read(session, section.tree.section_ordinal orelse return error.InvalidSectionIndex, paragraph)) |ranges| return ranges;
    }
    // Only descriptors are copied. Strings remain borrowed from Session until
    // the detached numeric projection has been built.
    const rows = try a.alloc(@import("text_sites.zig").Site, count);
    defer a.free(rows);
    const locations = try a.alloc(@import("section_text.zig").Location, count);
    defer a.free(locations);
    var next: usize = 0;
    if (selected) |indices| {
        for (indices) |i| {
            rows[next] = section.sites.items[i];
            locations[next] = section.locations[i];
            next += 1;
        }
    } else for (section.sites.items, section.locations) |site, location| {
        if (location.paragraph_ordinal != paragraph) continue;
        rows[next] = site;
        locations[next] = location;
        next += 1;
    }
    const sites: @import("text_sites.zig").Sites = .{ .items = rows };
    if (context != null) {
        const template = try @import("paragraph_site_owner.zig").resolve(&section.tree, &sites, locations, paragraph);
        if (try @import("character_style_formula_snapshot.zig").readForTemplate(session, section.tree.section_ordinal orelse return error.InvalidSectionIndex, paragraph, template)) |ranges| return ranges;
    }
    const positions = try displayPositions(a, &section.tree, &sites, locations, paragraph);
    defer a.free(positions);
    return display.build(a, &section.tree, &sites, positions, session.options.max_sites);
}

test "HWPX current protected character snapshot excludes moved objects on every allocation failure" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    _ = try session.splitParagraphAnchored(0, 1, 1, 0);
    _ = try session.spliceAnchored(0, 2, 0, 0, "앞😀");
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session) !void {
            var view = original.*;
            view.allocator = allocator;
            const left = try read(&view, 0, 1);
            defer allocator.free(left);
            const right = try read(&view, 0, 2);
            defer allocator.free(right);
            try std.testing.expectEqual(@as(usize, 1), left[left.len - 1].end_unit);
            try std.testing.expectEqual(@as(usize, 4), right[right.len - 1].end_unit);
        }
    }.run, .{&session});
}

test "HWPX current character snapshot follows owned formatting and checkpoint without mutation" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const before = try read(&session, 0, 2);
    defer a.free(before);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            // Borrow owners; only the query's detached allocations use the
            // failing allocator. Never deinit this borrowed Session view.
            var view = source.*;
            view.allocator = allocator;
            const spans = try read(&view, 0, 2);
            defer allocator.free(spans);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&session});
    try std.testing.expect(session.sections[0].structure_values == null);
    const ids = try @import("character_style_resources.zig").ids(&session);
    defer a.free(ids);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .format, .paragraph = 2, .start = 1, .deleted = 2, .inserted = "", .char_shape_id = ids[ids.len - 1] }));
    const current = try read(&session, 0, 2);
    defer a.free(current);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&session});
    try std.testing.expect(!std.meta.eql(before[0], current[0]));
    current[0].char_shape_id = 999;
    const detached = try read(&session, 0, 2);
    defer a.free(detached);
    try std.testing.expect(detached[0].char_shape_id != 999);
    try std.testing.expect(try history.undo(&session));
    const undone = try read(&session, 0, 2);
    defer a.free(undone);
    try std.testing.expectEqualDeep(before, undone);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    try std.testing.expectError(error.InvalidSectionIndex, read(&session, session.sections.len, 2));
    try std.testing.expectError(error.InvalidParagraphIndex, read(&session, 0, 0));
}
