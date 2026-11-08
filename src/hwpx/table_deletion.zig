//! 표 subtree의 원문 소유권을 검사하고 기존 Native writer로만 제거한다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");

pub const Candidate = struct {
    bytes: []u8,
    removed_paragraphs: []usize,
    removed_tables: usize,
    host_paragraph: usize,
    pub fn deinit(self: *Candidate, a: std.mem.Allocator) void {
        a.free(self.bytes);
        a.free(self.removed_paragraphs);
        self.* = undefined;
    }
};

fn is(tree: *const Tree, node: usize, local: []const u8) bool {
    return fields.childIs(tree, node, local);
}

fn number(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?u32 {
    const value = try tree.attributeValue(a, node, "", name) orelse return null;
    return try fields.unsigned(a, value, 64);
}

fn directHost(tree: *const Tree, node: usize) !usize {
    if (tree.part_kind != .section or node >= tree.elements.len or !is(tree, node, "tbl")) return error.InvalidTableDeletionTarget;
    const run = tree.elements[node].parent orelse return error.InvalidTableDeletionHost;
    if (!is(tree, run, "run")) return error.InvalidTableDeletionHost;
    const paragraph = tree.elements[run].parent orelse return error.InvalidTableDeletionHost;
    if (!is(tree, paragraph, "p")) return error.InvalidTableDeletionHost;
    return paragraph;
}

fn host(tree: *const Tree, node: usize) !usize {
    const paragraph = try directHost(tree, node);
    var ancestor: ?usize = paragraph;
    while (ancestor) |at| {
        const e = tree.elements[at];
        if (e.name.local.equals("switch", false) or e.name.local.equals("case", false) or e.name.local.equals("default", false)) return error.UnsupportedTableDeletionBranch;
        ancestor = e.parent;
    }
    return paragraph;
}

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, table_node: usize, limit: usize) !Candidate {
    return prepareMany(a, tree, &.{table_node}, limit);
}

/// 입력 순서와 무관하게 소스 순서로 한 번 조립한다. 중복·포함 선택은 거부한다.
pub fn prepareMany(a: std.mem.Allocator, tree: *const Tree, table_nodes: []const usize, limit: usize) !Candidate {
    if (tree.source.len > limit) return error.LimitExceeded;
    if (table_nodes.len == 0 or table_nodes.len > 4096) return error.InvalidTableDeletionTargets;
    try @import("field_free_section.zig").validate(a, tree, limit);
    var selected: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer selected.deinit(a);
    var hosts: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer hosts.deinit(a);
    for (table_nodes) |node| {
        const paragraph = try directHost(tree, node);
        if ((try selected.getOrPut(a, node)).found_existing) return error.DuplicateTableDeletionTarget;
        try hosts.put(a, paragraph, {});
    }
    var paragraphs: std.ArrayList(usize) = .empty;
    defer paragraphs.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var tables: usize = 0;
    var end: usize = 0;
    var branch_end: usize = 0;
    for (tree.elements, 0..) |e, index| {
        if (e.start_tag.start >= end) end = 0;
        if (e.start_tag.start >= branch_end) branch_end = 0;
        if (e.name.local.equals("switch", false) or e.name.local.equals("case", false) or e.name.local.equals("default", false)) branch_end = @max(branch_end, e.end);
        if (selected.contains(index)) {
            if (branch_end != 0) return error.UnsupportedTableDeletionBranch;
            if (end != 0) return error.OverlappingTableDeletionTargets;
            end = e.end;
            try changes.append(a, .{ .start = e.start_tag.start, .end = e.end, .text = "", .serialized_xml = "" });
        }
        const inside = end != 0 and e.end <= end;
        if (inside) {
            if (is(tree, index, "p")) try paragraphs.append(a, index);
            if (is(tree, index, "tbl")) tables += 1;
            for ([_][]const u8{ "footNote", "endNote", "fieldBegin", "fieldEnd", "bookmark", "memo" }) |name| {
                if (is(tree, index, name)) return error.UnsupportedTableDeletionReference;
            }
            if (is(tree, index, "subList")) {
                for ([_][]const u8{ "linkListIDRef", "linkListNextIDRef" }) |name| {
                    if (try number(a, tree, index, name)) |value| if (value != 0) return error.UnsupportedTableDeletionReference;
                }
            }
        }
        if (!inside and e.parent != null and hosts.contains(e.parent.?) and is(tree, index, "linesegarray")) {
            try changes.append(a, .{ .start = e.start_tag.start, .end = e.end, .text = "", .serialized_xml = "" });
        }
    }
    const bytes = try writer.write(a, tree.source, changes.items, limit);
    errdefer a.free(bytes);
    const removed = try paragraphs.toOwnedSlice(a);
    return .{ .bytes = bytes, .removed_paragraphs = removed, .removed_tables = tables, .host_paragraph = try directHost(tree, table_nodes[0]) };
}

/// Native 저장 후보에만 적용한다. source/current의 유일한 표 id와 호스트 id를 결속한다.
pub fn prepareCurrent(a: std.mem.Allocator, source: *const Tree, current_xml: []const u8, source_table_node: usize, limit: usize) !Candidate {
    const original_host = try host(source, source_table_node);
    const id = try number(a, source, source_table_node, "id") orelse return error.UnsupportedTableDeletionIdentity;
    const paragraph_id = try number(a, source, original_host, "id") orelse return error.UnsupportedTableDeletionIdentity;
    var source_matches: usize = 0;
    var source_hosts: usize = 0;
    for (source.elements, 0..) |_, index| {
        if (is(source, index, "tbl") and try number(a, source, index, "id") == id) source_matches += 1;
        if (is(source, index, "p") and try number(a, source, index, "id") == paragraph_id) source_hosts += 1;
    }
    if (source_matches != 1 or source_hosts != 1) return error.AmbiguousTableDeletionIdentity;
    var current = try @import("section_tree.zig").parse(a, current_xml, source.section_ordinal orelse return error.InvalidPartOrdinal, source.item_index, .{ .max_xml_bytes = limit });
    defer current.deinit(a);
    var found: ?usize = null;
    var current_hosts: usize = 0;
    for (current.elements, 0..) |_, index| {
        if (is(&current, index, "p") and try number(a, &current, index, "id") == paragraph_id) current_hosts += 1;
        if (!is(&current, index, "tbl") or try number(a, &current, index, "id") != id) continue;
        if (found != null) return error.AmbiguousTableDeletionIdentity;
        found = index;
    }
    const selected = found orelse return error.MissingTableDeletionTarget;
    if (current_hosts > 1) return error.AmbiguousTableDeletionIdentity;
    const current_host = try host(&current, selected);
    if (try number(a, &current, current_host, "id") != paragraph_id) return error.SourceBindingMismatch;
    return prepare(a, &current, selected, limit);
}
