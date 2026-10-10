const std = @import("std");
const editor = @import("editor_session.zig");
const staging = @import("created_table_session.zig");
const model = @import("../model/created_table.zig");
const marker = "\xef\xbf\xbc";

fn load(a: std.mem.Allocator, name: []const u8) ![]u8 {
    const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
    defer a.free(path);
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4000000));
}
fn make(a: std.mem.Allocator, index: u32) !model.Table {
    var table = try model.create(a, index + 1, index + 33, try @import("../model/table_creation_plan.zig").create(1, 1, 101, 17, 1), &.{index + 1000000}, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 }, 1);
    errdefer table.deinit(a);
    const text = try std.fmt.allocPrint(a, "셀{d}😀", .{index});
    defer a.free(text);
    _ = try table.replaceText(a, 0, 0, text, 100);
    return table;
}

fn derived(a: std.mem.Allocator, source: *const editor.Session, replacement: []const u8, all: bool) ![]u8 {
    const section = &source.sections[0];
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer changes.deinit(a);
    var seen: std.AutoHashMap(usize, void) = .init(a);
    defer seen.deinit();
    for (section.sites.items, section.locations) |site, location| {
        if (location.paragraph_ordinal != 2 or !section.tree.elements[site.element_index].is(@import("document_xml.zig").paragraph_uri, "t")) continue;
        if ((try seen.getOrPut(site.element_index)).found_existing) continue;
        const element = section.tree.elements[site.element_index];
        try changes.append(a, .{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = replacement });
        if (!all) break;
    }
    if (changes.items.len == 0) return error.MissingDerivedTextElement;
    const xml = try @import("xml_source_writer.zig").write(a, section.tree.source, changes.items, 4000000);
    defer a.free(xml);
    return @import("../zip/replace_writer.zig").write(a, source.source, &.{.{ .entry_index = section.entry_index, .bytes = xml }}, .{ .max_output_bytes = 4000000 });
}

test "created table save edges preserve host text at start middle and end" {
    const a = std.testing.allocator;
    const bytes = try load(a, "charshape");
    defer a.free(bytes);
    for ([_]u32{ 0, 3, std.math.maxInt(u32) }) |requested| {
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        _ = try session.splice(0, 2, 0, 0, "A😀B");
        const before = try session.anchorText(0, 2);
        defer a.free(before);
        const unit: u32 = if (requested == std.math.maxInt(u32)) @intCast(try @import("text_site_edit.zig").utf16Length(before)) else requested;
        const byte = try @import("text_site_edit.zig").bytePosition(before, unit);
        var table = try make(a, 0);
        defer table.deinit(a);
        try std.testing.expect(try staging.stage(&session, 0, 2, unit, &table));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const host = try reopened.anchorText(0, 2);
        defer a.free(host);
        const expected = try std.mem.concat(a, u8, &.{ before[0..byte], marker, before[byte..] });
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, host);
        const cell = try reopened.anchorText(0, 3);
        defer a.free(cell);
        try std.testing.expectEqualStrings("셀0😀", cell);
        try std.testing.expectEqualSlices(u8, bytes, session.source);
    }
}

test "created table save edges retain same point creation order and generated paragraph host" {
    const a = std.testing.allocator;
    const bytes = try load(a, "charshape");
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const before = try session.anchorText(0, 3);
    defer a.free(before);
    for (0..2) |index| {
        var table = try make(a, @intCast(index));
        defer table.deinit(a);
        try std.testing.expect(try staging.stage(&session, 0, 3, 0, &table));
    }
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const host = try reopened.anchorText(0, 3);
    defer a.free(host);
    const expected = try std.mem.concat(a, u8, &.{ marker, marker, before });
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, host);
    for (0..2) |index| {
        const cell = try reopened.anchorText(0, 4 + index);
        defer a.free(cell);
        const text = try std.fmt.allocPrint(a, "셀{d}😀", .{index});
        defer a.free(text);
        try std.testing.expectEqualStrings(text, cell);
    }
}

test "created table save edges expand missing text run inside an actual empty table cell" {
    const a = std.testing.allocator;
    const bytes = try load(a, "table");
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const before = try session.anchorText(0, 2);
    defer a.free(before);
    try std.testing.expectEqualStrings("", before);
    var table = try make(a, 0);
    defer table.deinit(a);
    try std.testing.expect(try staging.stage(&session, 0, 2, 0, &table));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const host = try reopened.anchorText(0, 2);
    defer a.free(host);
    try std.testing.expectEqualStrings(marker, host);
    const text = try reopened.anchorText(0, 3);
    defer a.free(text);
    try std.testing.expectEqualStrings("셀0😀", text);
    const bindings = try @import("table_display_bindings.zig").read(a, &reopened, 0);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(usize, 5), bindings.len);
}

test "created table save edges preserve empty t CDATA comments and PI in derived actual sources" {
    const a = std.testing.allocator;
    const bytes = try load(a, "charshape");
    defer a.free(bytes);
    var original = try editor.open(a, bytes, .{});
    defer original.deinit();
    for ([_][]const u8{ "<hp:t/>", "<hp:t><![CDATA[A😀]]><!--keep--><?hint retained?>B&amp;C</hp:t>" }, 0..) |replacement, index| {
        const input = try derived(a, &original, replacement, index == 0);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        const before = try session.anchorText(0, 2);
        defer a.free(before);
        const unit: u32 = if (index == 0) 0 else 3;
        const byte = try @import("text_site_edit.zig").bytePosition(before, unit);
        var table = try make(a, 0);
        defer table.deinit(a);
        try std.testing.expect(try staging.stage(&session, 0, 2, unit, &table));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const host = try reopened.anchorText(0, 2);
        defer a.free(host);
        const expected = try std.mem.concat(a, u8, &.{ before[0..byte], marker, before[byte..] });
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, host);
        if (index != 0) {
            try std.testing.expect(std.mem.indexOf(u8, reopened.sections[0].tree.source, "<!--keep-->") != null);
            try std.testing.expect(std.mem.indexOf(u8, reopened.sections[0].tree.source, "<?hint retained?>") != null);
        }
    }
}

test "created table save edges reject unsafe cloned identity attributes without committing registry" {
    const a = std.testing.allocator;
    const bytes = try load(a, "charshape");
    defer a.free(bytes);
    var original = try editor.open(a, bytes, .{});
    defer original.deinit();
    const input = try derived(a, &original, "<hp:t id='opaque-identity'>AB</hp:t>", false);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var table = try make(a, 0);
    defer table.deinit(a);
    try std.testing.expectError(error.UnsupportedCreatedTableHostAttributes, staging.stage(&session, 0, 2, 1, &table));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
