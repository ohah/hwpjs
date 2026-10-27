//! Readonly current-header dry runs reuse the source-bound writers, never a Session clone.
const std = @import("std");
const m = @import("../model/formatting_patch.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const head = @import("document_xml.zig").head_uri;
pub fn node(a: std.mem.Allocator, tree: *const Tree, kind: []const u8, id: u32) !usize {
    const parent_kind = if (std.mem.eql(u8, kind, "charPr")) "charProperties" else "paraProperties";
    for (tree.elements, 0..) |element, index| {
        if (!element.is(head, kind)) continue;
        const parent = element.parent orelse continue;
        if (!tree.elements[parent].is(head, parent_kind)) continue;
        const raw = (try tree.attributeValue(a, index, "", "id")) orelse continue;
        if (try @import("table_xml_fields.zig").unsigned(a, raw, 4096) == id) return index;
    }
    return error.InvalidResourceReference;
}
pub fn authorizeParagraph(a: std.mem.Allocator, tree: *const Tree, index: usize, field: []const u8) !void {
    if (std.mem.startsWith(u8, field, "paragraph.margins.")) {
        const targets = try @import("paragraph_format_write_targets.zig").find(a, tree, index, "margin");
        if (targets.len != 1) return error.MissingParagraphMargin;
    }
}
pub fn paragraph(a: std.mem.Allocator, tree: *const Tree, index: usize, id: u32, patch: m.Paragraph, limit: usize) !void {
    if (@import("../model/paragraph_flags.zig").has(patch.flags)) {
        const fragment = try @import("paragraph_flags_patch.zig").write(a, tree, index, patch.flags, limit);
        defer a.free(fragment);
    }
    // These are the exact source writers, including case/default checks.
    if (patch.alignment) |value| {
        const alignment = std.meta.stringToEnum(@import("paragraph_resource_clone.zig").Alignment, @tagName(value)).?;
        const bytes = try @import("paragraph_resource_clone.zig").write(a, tree, index, id, alignment, limit);
        defer a.free(bytes);
    }
    const bytes = try @import("paragraph_resource_patch.zig").write(a, tree, index, patch.margins, patch.spacing, limit);
    defer a.free(bytes);
}
pub const Context = struct {
    allocator: std.mem.Allocator,
    bytes: []const u8,
    tree: Tree,
    profile: ?@import("source_color_profile.zig").Profile = null,
    pub fn init(a: std.mem.Allocator, session: *@import("editor_session.zig").Session) !Context {
        const header = try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, session.options.max_xml_bytes);
        errdefer a.free(header.bytes);
        const tree = try @import("header_tree.zig").parse(a, header.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
        return .{ .allocator = a, .bytes = header.bytes, .tree = tree };
    }
    pub fn deinit(self: *Context) void {
        self.tree.deinit(self.allocator);
        self.allocator.free(self.bytes);
        self.* = undefined;
    }
};
pub fn validate(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, owner: m.Owner, ranges: []const m.Range, patch: m.Patch) !void {
    if (!patch.hasCharacter() and !patch.hasParagraph()) return;
    var context = try Context.init(a, session);
    defer context.deinit();
    try validateContext(a, session, &context, owner, ranges, patch);
}
pub fn validateContext(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, context: *Context, owner: m.Owner, ranges: []const m.Range, patch: m.Patch) !void {
    const tree = &context.tree;
    if (patch.hasParagraph()) {
        const id = try session.paragraphShapeId(owner.section, owner.paragraph);
        try paragraph(a, tree, try node(a, tree, "paraPr", id), id, patch.paragraph, session.options.max_xml_bytes);
        if (@import("../model/border_fill_patch.zig").has(patch.paragraph.border_fill)) {
            const owner_node = try node(a, tree, "paraPr", id);
            const prepared = try @import("border_fill_resource_patch.zig").write(a, tree, try @import("border_fill_resource_patch.zig").reference(a, tree, owner_node), patch.paragraph.border_fill, session.options.max_xml_bytes, if (@import("border_fill_profile.zig").needsBorder(patch.paragraph.border_fill)) try @import("border_fill_profile.zig").read(a, session.source) else .{});
            a.free(prepared.bytes);
        }
    }
    if (!patch.hasCharacter()) return;
    var properties = patch.character;
    var ids = properties.font_ids orelse @as(@import("../model/character_fonts.zig").Values, @splat(null));
    var has_ids = properties.font_ids != null;
    for (patch.fonts, 0..) |font, language| if (font) |intent| switch (intent) {
        .id => |id| {
            ids[language] = id;
            has_ids = true;
        },
        .name => {},
    };
    if (has_ids) properties.font_ids = ids;
    var profile: @import("source_color_profile.zig").Profile = .{};
    if (@import("border_fill_profile.zig").needs(properties) and context.profile == null) {
        var document = try @import("package.zig").inspectDocument(a, session.source, .{});
        defer document.deinit(a);
        var producer = try @import("source_version_metadata.zig").readDocument(a, &document, .{});
        defer producer.deinit(a);
        context.profile = @import("source_color_profile.zig").classify(if (producer.sourceVersion) |*value| value else null);
    }
    profile = context.profile orelse .{};
    const spans = try @import("character_style_snapshot.zig").read(session, owner.section, owner.paragraph);
    defer session.allocator.free(spans);
    var checked: std.ArrayList(u32) = .empty;
    defer checked.deinit(a);
    for (spans) |span| {
        var selected = false;
        for (ranges) |range| if (@max(span.start_unit, range.startUnit) < @min(span.end_unit, range.endUnit)) {
            selected = true;
            break;
        };
        if (!selected) continue;
        const id = span.char_shape_id orelse return error.InvalidCharacterShapeReference;
        if (std.mem.indexOfScalar(u32, checked.items, id) != null) continue;
        const bytes = try @import("character_resource_clone.zig").writeWithProfile(a, tree, try node(a, tree, "charPr", id), id, properties, session.options.max_xml_bytes, profile);
        a.free(bytes);
        try checked.append(a, id);
    }
}
