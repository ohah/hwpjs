//! 글자 resource insert/clone은 기존 구현을 재사용하고 BorderFill 소유권만 준비합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Resources = @import("border_fill_resource_patch.zig");
const Patch = @import("../model/document.zig").CharacterPropertyPatch;
const Border = @import("../model/border_fill_patch.zig").Patch;
const Profile = @import("source_color_profile.zig").Profile;
fn sourceId(a: std.mem.Allocator, tree: *const Tree, node: usize) !u32 {
    return Resources.id(a, tree, node);
}
pub fn insert(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, patch: Patch, border: Border, limit: usize, profile: Profile) ![]u8 {
    const source = try sourceId(a, tree, node);
    const fill = try Resources.write(a, tree, try Resources.reference(a, tree, node), border, limit, profile);
    defer a.free(fill.bytes);
    var prepared = try @import("header_tree.zig").parse(a, fill.bytes, tree.item_index, .{ .max_xml_bytes = limit });
    defer prepared.deinit(a);
    const template = try Resources.target(a, &prepared, "charPr", source);
    var without = patch;
    without.border_fill = null;
    const inserted = try @import("character_resource_insert.zig").writePreparedWithProfile(a, &prepared, template, id, without, limit, profile);
    defer a.free(inserted);
    var current = try @import("header_tree.zig").parse(a, inserted, tree.item_index, .{ .max_xml_bytes = limit });
    defer current.deinit(a);
    return Resources.patchReference(a, &current, try Resources.target(a, &current, "charPr", id), fill.id, limit);
}
pub fn clone(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, patch: Patch, border: Border, limit: usize, profile: Profile) ![]u8 {
    // dry-run도 동일 BorderFill writer를 통과합니다. 원본 charPr는 최종 출력에서 보존됩니다.
    const fill = try Resources.write(a, tree, try Resources.reference(a, tree, node), border, limit, profile);
    defer a.free(fill.bytes);
    var prepared = try @import("header_tree.zig").parse(a, fill.bytes, tree.item_index, .{ .max_xml_bytes = limit });
    defer prepared.deinit(a);
    const template = try Resources.target(a, &prepared, "charPr", try sourceId(a, tree, node));
    var without = patch;
    without.border_fill = null;
    const fragment = try @import("character_resource_clone.zig").writePreparedWithProfile(a, &prepared, template, id, without, limit, profile);
    defer a.free(fragment);
    const staged = try @import("xml_source_writer.zig").write(a, prepared.source, &.{.{ .start = prepared.elements[template].start_tag.start, .end = prepared.elements[template].end, .text = "", .serialized_xml = fragment }}, limit);
    defer a.free(staged);
    var changed = try @import("header_tree.zig").parse(a, staged, tree.item_index, .{ .max_xml_bytes = limit });
    defer changed.deinit(a);
    const patched = try Resources.patchReference(a, &changed, template, fill.id, limit);
    defer a.free(patched);
    var result = try @import("header_tree.zig").parse(a, patched, tree.item_index, .{ .max_xml_bytes = limit });
    defer result.deinit(a);
    return a.dupe(u8, result.sourceOf(template));
}
