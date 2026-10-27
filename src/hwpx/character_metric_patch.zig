//! 기존 직접 자식과 명시된 언어 속성만 갱신합니다. 부재 field는 생성하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Patch = @import("../model/document.zig").CharacterPropertyPatch;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, patch: Patch, limit: usize) ![]u8 {
    try @import("../model/character_metric_patch.zig").validate(patch);
    const source = try @import("character_font_metrics.zig").read(a, tree, node, 4096);
    inline for (.{ .{ "ratio", "ratio" }, .{ "char_spacing", "spacing" }, .{ "relative_size", "relativeSize" }, .{ "offset", "offset" } }) |entry| if (@field(patch, entry[0])) |values| {
        const original = @field(source, entry[1]) orelse return error.MissingCharacterMetric;
        for (values, original) |requested, value| if (requested != null and value == null) return error.MissingCharacterLanguageMetric;
    };
    var current = try a.dupe(u8, tree.source);
    defer a.free(current);
    inline for (.{ .{ "ratio", "ratio" }, .{ "char_spacing", "spacing" }, .{ "relative_size", "relSz" }, .{ "offset", "offset" } }) |entry| if (@field(patch, entry[0])) |values| {
        for (values, @import("font_faces.zig").reference_names) |value, language| if (value) |v| {
            var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
            defer parsed.deinit(a);
            const text = try std.fmt.allocPrint(a, "{d}", .{v});
            defer a.free(text);
            const fragment = try @import("character_child_attribute_patch.zig").write(a, &parsed, node, entry[1], language, text, limit);
            defer a.free(fragment);
            const next = try @import("xml_source_writer.zig").write(a, current, &.{.{ .start = parsed.elements[node].start_tag.start, .end = parsed.elements[node].end, .text = "", .serialized_xml = fragment }}, limit);
            a.free(current);
            current = next;
        };
    };
    var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
    defer parsed.deinit(a);
    return a.dupe(u8, parsed.sourceOf(node));
}
pub fn matchesCurrent(session: *@import("editor_session.zig").Session, id: u32, patch: Patch) !bool {
    if (!@import("../model/character_metric_patch.zig").has(patch) and patch.underline_style == null and patch.strike_style == null and patch.border_fill == null) return true;
    const a = session.allocator;
    const header = try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, session.options.max_xml_bytes);
    defer a.free(header.bytes);
    var tree = try @import("header_tree.zig").parse(a, header.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
    defer tree.deinit(a);
    const index = try @import("formatting_preflight.zig").node(a, &tree, "charPr", id);
    if (patch.border_fill) |border| {
        const ref = try @import("border_fill_resource_patch.zig").reference(a, &tree, index);
        const resource = try @import("border_fill_resource_patch.zig").sourceNode(a, &tree, ref);
        var mask: [4]bool = @splat(false);
        for (border.border.edges, 0..) |edge, i| if (edge) |value| {
            mask[i] = @import("../model/border_fill_patch.zig").edgeHas(value);
        };
        const profile = if (@import("border_fill_profile.zig").needsBorder(border)) try @import("border_fill_profile.zig").read(a, session.source) else @as(@import("source_color_profile.zig").Profile, .{});
        if (!@import("../model/border_fill_patch.zig").matches(try @import("border_fill_xml_patch.zig").observeSelected(a, &tree, resource, profile, mask, border.background != null), border)) return false;
    }
    return @import("../model/character_metric_patch.zig").matches(try @import("character_font_metrics.zig").read(a, &tree, index, 4096), patch) and try @import("character_decoration_style_patch.zig").matches(a, &tree, index, patch);
}
