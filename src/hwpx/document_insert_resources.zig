//! Cross-package ID map for paragraph, character and style resources.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Change = @import("xml_source_writer.zig").Change;
const patch = @import("document_insert_xml.zig");
const names = @import("document_xml.zig");
const hh = names.head_uri;
const hc = "http://www.hancom.co.kr/hwpml/2011/core";

pub const Kind = enum { character, paragraph, style };
const group_names = [3][]const u8{ "charProperties", "paraProperties", "styles" };
const entry_names = [3][]const u8{ "charPr", "paraPr", "style" };
const Ids = std.AutoHashMapUnmanaged(u32, u32);
pub const Plan = struct {
    maps: [3]Ids,
    header: []const u8,

    pub fn resolve(self: *const Plan, kind: Kind, id: u32) !u32 {
        return self.maps[@backingInt(kind)].get(id) orelse error.UnresolvedInsertReference;
    }
};

const Groups = struct { nodes: [3]usize, counts: [3]u32 };

fn readGroups(a: std.mem.Allocator, tree: *const Tree) !Groups {
    if (tree.xml_report.processing_instructions != 0) return error.UnsupportedInsertHeader;
    try tree.visitContent(a, .{ .context = @constCast(tree), .on_content = checkContent });
    var result: Groups = undefined;
    var ref_list: ?usize = null;
    var child = tree.elements[0].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const node = tree.elements[index];
        if (node.is(hh, "refList")) {
            if (ref_list != null) return error.UnsupportedInsertHeader;
            ref_list = index;
        } else if (!node.is(hh, "beginNum") and !node.is(hh, "trackchangeConfig")) return error.UnsupportedInsertHeader;
    }
    var seen: [3]bool = @splat(false);
    child = tree.elements[ref_list orelse return error.UnsupportedInsertHeader].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const node = tree.elements[index];
        for (group_names, 0..) |group, kind| {
            if (node.is(hh, group)) {
                if (seen[kind] or node.end_tag == null) return error.UnsupportedInsertHeader;
                seen[kind] = true;
                var attributes = try patch.tag(a, tree, index, &.{"itemCnt"});
                attributes.deinit(a);
                const count = try patch.number(a, tree, index, "itemCnt");
                var observed: u32 = 0;
                var entry = node.first_child;
                while (entry) |element| : (entry = tree.elements[element].next_sibling) {
                    if (!tree.elements[element].is(hh, entry_names[kind])) return error.UnsupportedInsertHeader;
                    observed += 1;
                }
                if (observed != count or count == 0) return error.InvalidInsertResourceCount;
                result.nodes[kind] = index;
                result.counts[kind] = count;
                break;
            }
        } else try validateSharedGroup(a, tree, index);
    }
    for (seen) |value| if (!value) return error.UnsupportedInsertHeader;
    return result;
}

fn checkContent(_: *anyopaque, event: Tree.ContentEvent) !void {
    if (std.mem.trim(u8, event.value.raw, " \t\r\n").len != 0)
        return error.UnsupportedInsertHeader;
}

fn skeleton(a: std.mem.Allocator, tree: *const Tree, groups: Groups, limit: usize) ![]u8 {
    var changes: [3]Change = undefined;
    for (groups.nodes, group_names, &changes) |index, name, *change| {
        const node = tree.elements[index];
        change.* = .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = name };
    }
    return patch.write(a, tree.source, &changes, limit);
}

fn allowedTag(a: std.mem.Allocator, tree: *const Tree, index: usize, attrs: []const []const u8) !void {
    var parsed = try patch.tag(a, tree, index, attrs);
    parsed.deinit(a);
}

fn leaf(a: std.mem.Allocator, tree: *const Tree, index: usize, attrs: []const []const u8) !void {
    if (tree.elements[index].first_child != null) return error.UnsupportedInsertResource;
    try allowedTag(a, tree, index, attrs);
}

// These tables retain their original IDs and are admitted only when the
// surrounding headers compare equal. Reject dependencies on external payloads.
fn validateSharedGroup(a: std.mem.Allocator, tree: *const Tree, index: usize) !void {
    const group = tree.elements[index];
    try allowedTag(a, tree, index, &.{"itemCnt"});
    var child = group.first_child;
    while (child) |i| : (child = tree.elements[i].next_sibling) {
        const node = tree.elements[i];
        if (group.is(hh, "fontfaces") and node.is(hh, "fontface")) {
            try allowedTag(a, tree, i, &.{ "lang", "fontCnt" });
            var font = node.first_child;
            while (font) |f| : (font = tree.elements[f].next_sibling) {
                if (!tree.elements[f].is(hh, "font")) return error.UnsupportedInsertResource;
                try leaf(a, tree, f, &.{ "id", "face", "type", "isEmbedded" });
                if (try tree.attributeValue(a, f, "", "isEmbedded")) |value| {
                    if (try @import("table_xml_fields.zig").boolean(a, value, 32))
                        return error.UnsupportedInsertResource;
                }
            }
        } else if (group.is(hh, "borderFills") and node.is(hh, "borderFill")) {
            try allowedTag(a, tree, i, &.{ "id", "threeD", "shadow", "centerLine", "breakCellSeparateLine" });
            var edge = node.first_child;
            while (edge) |e| : (edge = tree.elements[e].next_sibling) {
                const border = tree.elements[e];
                if (!border.is(hh, "leftBorder") and !border.is(hh, "rightBorder") and
                    !border.is(hh, "topBorder") and !border.is(hh, "bottomBorder"))
                    return error.UnsupportedInsertResource;
                try leaf(a, tree, e, &.{ "type", "width", "color" });
            }
        } else if (group.is(hh, "tabProperties") and node.is(hh, "tabPr")) {
            try leaf(a, tree, i, &.{ "id", "autoTabLeft", "autoTabRight" });
        } else return error.UnsupportedInsertHeader;
    }
    if (!group.is(hh, "fontfaces") and !group.is(hh, "borderFills") and
        !group.is(hh, "tabProperties")) return error.UnsupportedInsertHeader;
}

fn validateCharacter(a: std.mem.Allocator, tree: *const Tree, index: usize) !void {
    try allowedTag(a, tree, index, &.{ "id", "height", "textColor", "shadeColor", "useFontSpace", "useKerning", "symMark", "borderFillIDRef" });
    var child = tree.elements[index].first_child;
    while (child) |i| : (child = tree.elements[i].next_sibling) {
        const node = tree.elements[i];
        if (node.is(hh, "fontRef") or node.is(hh, "ratio") or node.is(hh, "spacing") or node.is(hh, "relSz") or node.is(hh, "offset")) {
            try leaf(a, tree, i, &.{ "hangul", "latin", "hanja", "japanese", "other", "symbol", "user" });
        } else if (node.is(hh, "bold") or node.is(hh, "italic") or node.is(hh, "emboss") or node.is(hh, "engrave") or node.is(hh, "supscript") or node.is(hh, "subscript")) {
            try leaf(a, tree, i, &.{});
        } else if (node.is(hh, "underline") or node.is(hh, "strikeout")) {
            try leaf(a, tree, i, &.{ "type", "shape", "color" });
        } else return error.UnsupportedInsertResource;
    }
}

fn validateParagraph(a: std.mem.Allocator, tree: *const Tree, index: usize) !void {
    try allowedTag(a, tree, index, &.{ "id", "tabPrIDRef", "condense", "fontLineHeight", "snapToGrid", "suppressLineNumbers", "checked" });
    var child = tree.elements[index].first_child;
    while (child) |i| : (child = tree.elements[i].next_sibling) {
        const node = tree.elements[i];
        if (node.is(hh, "align")) {
            try leaf(a, tree, i, &.{ "horizontal", "vertical" });
        } else if (node.is(hh, "heading")) {
            try leaf(a, tree, i, &.{ "type", "idRef", "level" });
            try patch.requireValue(a, tree, i, "type", "NONE");
        } else if (node.is(hh, "breakSetting")) {
            try leaf(a, tree, i, &.{ "breakLatinWord", "breakNonLatinWord", "widowOrphan", "keepWithNext", "keepLines", "pageBreakBefore", "lineWrap" });
        } else if (node.is(hh, "margin")) {
            try allowedTag(a, tree, i, &.{});
            var value = node.first_child;
            while (value) |v| : (value = tree.elements[v].next_sibling) {
                const margin = tree.elements[v];
                if (!margin.is(hc, "intent") and !margin.is(hc, "left") and !margin.is(hc, "right") and
                    !margin.is(hc, "prev") and !margin.is(hc, "next")) return error.UnsupportedInsertResource;
                try leaf(a, tree, v, &.{ "value", "unit" });
            }
        } else if (node.is(hh, "lineSpacing")) {
            try leaf(a, tree, i, &.{ "type", "value", "unit" });
        } else if (node.is(hh, "border")) {
            try leaf(a, tree, i, &.{ "borderFillIDRef", "offsetLeft", "offsetRight", "offsetTop", "offsetBottom", "connect", "ignoreMargin" });
        } else if (node.is(hh, "autoSpacing")) {
            try leaf(a, tree, i, &.{ "eAsianEng", "eAsianNum" });
        } else return error.UnsupportedInsertResource;
    }
}

fn remap(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8, plan: *const Plan, kind: Kind, changes: *std.ArrayList(Change)) !void {
    const id = try patch.number(a, tree, index, name);
    try patch.replaceNumber(a, tree, index, name, try plan.resolve(kind, id), changes);
}

pub fn prepare(a: std.mem.Allocator, destination: *const Tree, donor: *const Tree, limit: usize) !Plan {
    const dest = try readGroups(a, destination);
    const source = try readGroups(a, donor);
    if (!std.mem.eql(u8, try skeleton(a, destination, dest, limit), try skeleton(a, donor, source, limit)))
        return error.IncompatibleInsertHeader;
    const identical = std.mem.eql(u8, destination.source, donor.source);
    var plan: Plan = .{ .maps = @splat(.empty), .header = destination.source };
    for (dest.nodes, source.nodes, &plan.maps) |destination_node, source_node, *map| {
        var used: Ids = .empty;
        var next: u64 = 0;
        var child = destination.elements[destination_node].first_child;
        while (child) |index| : (child = destination.elements[index].next_sibling) {
            const id = try patch.number(a, destination, index, "id");
            if ((try used.getOrPut(a, id)).found_existing) return error.DuplicateInsertResourceId;
            next = @max(next, @as(u64, id) + 1);
        }
        child = donor.elements[source_node].first_child;
        while (child) |index| : (child = donor.elements[index].next_sibling) {
            const id = try patch.number(a, donor, index, "id");
            const row = try map.getOrPut(a, id);
            if (row.found_existing) return error.DuplicateInsertResourceId;
            row.value_ptr.* = if (identical) id else std.math.cast(u32, next) orelse return error.LimitExceeded;
            next += 1;
        }
    }

    var header_changes: std.ArrayList(Change) = .empty;
    for (source.nodes, dest.nodes, 0..) |group, target, kind_index| {
        const kind: Kind = @fromBackingInt(@intCast(kind_index));
        var fragments: std.ArrayList(u8) = .empty;
        var child = donor.elements[group].first_child;
        while (child) |index| : (child = donor.elements[index].next_sibling) {
            switch (kind) {
                .character => try validateCharacter(a, donor, index),
                .paragraph => try validateParagraph(a, donor, index),
                .style => {
                    try leaf(a, donor, index, &.{ "id", "type", "name", "engName", "paraPrIDRef", "charPrIDRef", "nextStyleIDRef", "langID", "lockForm" });
                    try patch.requireValue(a, donor, index, "type", "PARA");
                },
            }
            var changes: std.ArrayList(Change) = .empty;
            if (kind == .style) {
                try remap(a, donor, index, "paraPrIDRef", &plan, .paragraph, &changes);
                try remap(a, donor, index, "charPrIDRef", &plan, .character, &changes);
                try remap(a, donor, index, "nextStyleIDRef", &plan, .style, &changes);
            }
            if (identical) continue;
            try remap(a, donor, index, "id", &plan, kind, &changes);
            const resource = try patch.fragment(a, donor, index, changes.items, limit);
            try patch.append(a, &fragments, resource, limit);
        }
        if (identical) continue;
        const count = std.math.add(u32, dest.counts[kind_index], source.counts[kind_index]) catch return error.LimitExceeded;
        try patch.replaceNumber(a, destination, target, "itemCnt", count, &header_changes);
        const end = destination.elements[target].end_tag.?.start;
        try header_changes.append(a, .{ .start = end, .end = end, .text = "", .serialized_xml = fragments.items });
    }
    if (!identical) plan.header = try patch.write(a, destination.source, header_changes.items, limit);
    return plan;
}
