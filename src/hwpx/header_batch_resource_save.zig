//! Atomic-formatting-only bulk assembly. Raw header writers remain the fallback.
//! Original XML is copied once; generated fragments keep resource creation order.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const head = @import("document_xml.zig").head_uri;
const chars = @import("character_resource_values.zig");
const paras = @import("paragraph_resource_values.zig");
const writer = @import("xml_source_writer.zig");
pub const Stats = struct { fragments: @import("character_resource_clone.zig").BatchStats = .{}, fonts: @import("font_resource_header.zig").BatchStats = .{}, source_elements: usize = 0, original_characters: usize = 0, original_paragraphs: usize = 0, generated_characters: usize = 0, generated_paragraphs: usize = 0, header_patches: usize = 0, final_parses: usize = 0 };
const Group = struct {
    parent: ?usize = null,
    templates: std.AutoHashMapUnmanaged(u32, usize) = .empty,
    occupied: std.AutoHashMapUnmanaged(u32, void) = .empty,
    additions: std.ArrayList(u8) = .empty,
    count: u32 = 0,
    added: u32 = 0,
    count_raw: ?@import("../xml/attribute_value.zig").Value = null,
    fn deinit(self: *Group, a: std.mem.Allocator) void {
        self.templates.deinit(a);
        self.occupied.deinit(a);
        self.additions.deinit(a);
    }
};
fn basicCharacter(patch: @import("../model/document.zig").CharacterPropertyPatch) bool {
    const empty: @TypeOf(patch) = .{};
    inline for (@import("../reflection.zig").fields(@TypeOf(patch))) |field| {
        if (comptime !std.mem.eql(u8, field.name, "size") and !std.mem.eql(u8, field.name, "bold") and !std.mem.eql(u8, field.name, "italic") and !std.mem.eql(u8, field.name, "text_color") and !std.mem.eql(u8, field.name, "font_ids")) {
            if (!std.meta.eql(@field(patch, field.name), @field(empty, field.name))) return false;
        }
    }
    return true;
}
fn basicParagraph(value: paras.Entry) bool {
    return value.bullet == null and value.keep_lines == null and std.meta.eql(value.margins, @as(@TypeOf(value.margins), .{})) and value.spacing == null and !@import("../model/paragraph_flags.zig").has(value.flags) and !@import("../model/border_fill_patch.zig").has(value.border_fill);
}
fn append(a: std.mem.Allocator, output: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, bytes);
}
fn indexGroup(a: std.mem.Allocator, tree: *const Tree, group: *Group, character: bool, stats: *Stats) !bool {
    const parent = group.parent orelse return false;
    const count_raw = (try tree.attributeValue(a, parent, "", "itemCnt")) orelse return false;
    group.count = try @import("table_xml_fields.zig").unsigned(a, count_raw, 4096);
    group.count_raw = count_raw;
    if (tree.elements[parent].end_tag == null) return false;
    var actual: usize = 0;
    var child = tree.elements[parent].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(head, if (character) "charPr" else "paraPr")) continue;
        const id = if (character) block: {
            const shape = try @import("character_shape_display.zig").read(a, tree, index, 4096);
            stats.original_characters += 1;
            break :block shape.id orelse return false;
        } else block: {
            const raw = (try tree.attributeValue(a, index, "", "id")) orelse return false;
            stats.original_paragraphs += 1;
            break :block try @import("table_xml_fields.zig").unsigned(a, raw, 4096);
        };
        const slot = try group.templates.getOrPut(a, id);
        if (slot.found_existing) return false;
        slot.value_ptr.* = index;
        try group.occupied.put(a, id, {});
        actual += 1;
    }
    if (actual != group.count) return if (character) error.CharacterResourceCountMismatch else error.ParagraphResourceCountMismatch;
    return true;
}
// Canonical raw writers enforce the XML limit at every append. Only use the
// bulk planner when rewriting existing counts cannot shorten the input header.
// Inspect raw quoted bytes: decoded numeric equality is not enough for this.
fn canonicalCount(raw: []const u8) bool {
    if (raw.len < 3) return false;
    const quote = raw[0];
    if ((quote != '\'' and quote != '"') or raw[raw.len - 1] != quote) return false;
    const digits = raw[1 .. raw.len - 1];
    if (digits.len > 1 and digits[0] == '0') return false;
    for (digits) |byte| if (byte < '0' or byte > '9') return false;
    return true;
}
fn canonicalCounts(a: std.mem.Allocator, tree: *const Tree) !bool {
    // Conservatively decline even untouched noncanonical counts. Missing counts
    // in font groups are inserted by the original writer and only add bytes.
    for (tree.elements, 0..) |_, node| {
        for ([_][]const u8{ "itemCnt", "fontCnt" }) |name| {
            if (try tree.attributeValue(a, node, "", name)) |value| {
                if (!canonicalCount(value.raw)) return false;
            }
        }
    }
    return true;
}

pub fn replacement(a: std.mem.Allocator, source: []const u8, paragraphs: *const paras.Values, characters: *const chars.Values, fonts: *const @import("../model/font_resource_values.zig").Values, limit: usize, stats: *Stats) !?@import("../zip/replace_writer.zig").Replacement {
    return replacementImpl(a, source, paragraphs, characters, fonts, limit, stats, false);
}
pub fn replacementCanonical(a: std.mem.Allocator, source: []const u8, paragraphs: *const paras.Values, characters: *const chars.Values, fonts: *const @import("../model/font_resource_values.zig").Values, limit: usize, stats: *Stats) !?@import("../zip/replace_writer.zig").Replacement {
    return replacementImpl(a, source, paragraphs, characters, fonts, limit, stats, true);
}
fn replacementImpl(a: std.mem.Allocator, source: []const u8, paragraphs: *const paras.Values, characters: *const chars.Values, fonts: *const @import("../model/font_resource_values.zig").Values, limit: usize, stats: *Stats, canonical: bool) !?@import("../zip/replace_writer.zig").Replacement {
    for (paragraphs.entries.items) |intent| if (!basicParagraph(intent)) return null;
    for (characters.entries.items) |intent| if (!basicCharacter(intent.properties)) return null;
    for (fonts.entries.items) |font| if (font.name == null) return null;
    var document = try @import("package.zig").inspectDocument(a, source, .{});
    defer document.deinit(a);
    // Keep the same original inventory validation as the canonical header path.
    var inventory = try document.inspectHeaderResources(a, .{});
    defer inventory.deinit(a);
    var tree = try document.readHeaderTree(a, .{ .tree = .{ .max_xml_bytes = limit } });
    defer tree.deinit(a);
    const entry_index = document.manifest.items[tree.item_index].entry_index orelse return error.ExternalHeaderXml;
    if (canonical and !try canonicalCounts(a, &tree)) return null;
    var pg: Group = .{};
    defer pg.deinit(a);
    var cg: Group = .{};
    defer cg.deinit(a);
    for (tree.elements, 0..) |element, index| {
        stats.source_elements += 1;
        if (element.is(head, "paraProperties")) {
            if (pg.parent != null) return null;
            pg.parent = index;
        } else if (element.is(head, "charProperties")) {
            if (cg.parent != null) return null;
            cg.parent = index;
        }
    }
    if (paragraphs.entries.items.len != 0 and !try indexGroup(a, &tree, &pg, false, stats)) return null;
    if (characters.entries.items.len != 0 and !try indexGroup(a, &tree, &cg, true, stats)) return null;
    for (paragraphs.entries.items) |intent| {
        const template = pg.templates.get(intent.source_id) orelse return error.InvalidParagraphShapeReference;
        if (pg.occupied.contains(intent.id)) return error.DuplicateParagraphResourceId;
        const fragment = try @import("paragraph_resource_clone.zig").write(a, &tree, template, intent.id, intent.alignment, limit);
        defer a.free(fragment);
        try append(a, &pg.additions, fragment, limit);
        try pg.occupied.put(a, intent.id, {});
        pg.added = std.math.add(u32, pg.added, 1) catch return error.LimitExceeded;
        stats.generated_paragraphs += 1;
    }
    var profile: ?@import("source_color_profile.zig").Profile = null;
    for (characters.entries.items) |intent| {
        const template = cg.templates.get(intent.source_id) orelse return error.InvalidCharacterShapeReference;
        if (cg.occupied.contains(intent.id)) return error.DuplicateCharacterResourceId;
        if (@import("border_fill_profile.zig").needs(intent.properties) and profile == null) {
            var metadata = try @import("source_version_metadata.zig").readDocument(a, &document, .{});
            defer metadata.deinit(a);
            profile = @import("source_color_profile.zig").classify(if (metadata.sourceVersion) |*value| value else null);
        }
        const fragment = try @import("character_resource_clone.zig").writePreparedBatchCounted(a, &tree, template, intent.id, intent.properties, limit, profile orelse .{}, &stats.fragments);
        defer a.free(fragment);
        try append(a, &cg.additions, fragment, limit);
        try cg.occupied.put(a, intent.id, {});
        cg.added = std.math.add(u32, cg.added, 1) catch return error.LimitExceeded;
        stats.generated_characters += 1;
    }
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var count_texts: std.ArrayList([]u8) = .empty;
    defer {
        for (count_texts.items) |bytes| a.free(bytes);
        count_texts.deinit(a);
    }
    for ([_]*Group{ &pg, &cg }) |group| {
        if (group.added == 0) continue;
        const raw = group.count_raw.?;
        const next = std.math.add(u32, group.count, group.added) catch return error.LimitExceeded;
        const count_text = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ raw.raw[0], next, raw.raw[0] });
        count_texts.append(a, count_text) catch |err| {
            a.free(count_text);
            return err;
        };
        const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(tree.source.ptr);
        try changes.append(a, .{ .start = start, .end = start + raw.raw.len, .text = "", .serialized_xml = count_text });
        const at = tree.elements[group.parent.?].end_tag.?.start;
        try changes.append(a, .{ .start = at, .end = at, .text = "", .serialized_xml = group.additions.items });
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    const patched = try writer.write(a, tree.source, changes.items, limit);
    defer a.free(patched);
    stats.header_patches += 1;
    var verified = try @import("header_tree.zig").parse(a, patched, tree.item_index, .{ .max_xml_bytes = limit });
    defer verified.deinit(a);
    stats.final_parses += 1;
    // Local fragment writers share original namespace semantics; validate every
    // produced character shape exactly once in the assembled tree.
    if (characters.entries.items.len != 0) for (verified.elements, 0..) |element, index| {
        if (!element.is(head, "charPr")) continue;
        const parent = element.parent orelse continue;
        if (!verified.elements[parent].is(head, "charProperties")) continue;
        _ = try @import("character_shape_display.zig").read(a, &verified, index, 4096);
    };
    const result = if (fonts.entries.items.len != 0) try @import("font_resource_header.zig").writeBatch(a, &verified, fonts.entries.items, limit, &stats.fonts) else try a.dupe(u8, verified.source);
    return .{ .entry_index = entry_index, .bytes = result };
}
