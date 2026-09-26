const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const attributes = @import("xml_part_attributes.zig");
const document_xml = @import("document_xml.zig");
const direct_text = @import("xml_direct_text.zig");
const values = @import("xml_values.zig");

pub const Kind = enum { indexmark, dutmal };
pub const TextKind = enum { first_key, second_key, main_text, sub_text };

pub const Options = struct {
    max_controls: usize = 100_000,
    max_texts: usize = 200_000,
    max_name_bytes: usize = 4096,
    max_attribute_bytes: usize = 4096,
    max_value_bytes: usize = 1024 * 1024,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};

pub const DutmalAttributes = struct {
    pos_type: ?[]const u8 = null,
    sz_ratio: ?[]const u8 = null,
    option: ?[]const u8 = null,
    style_id_ref: ?[]const u8 = null,
    alignment: ?[]const u8 = null,
};

pub const Control = struct {
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    parent_uri: []const u8,
    parent_local_name: []const u8,
    kind: Kind,
    raw_xml: []const u8,
    attributes: DutmalAttributes = .{},
    /// Direct text only, not descendant text. Preserved even though not modeled.
    direct_text: []const u8 = "",
    first_text: usize,
    text_count: usize = 0,
    direct_children: usize = 0,
    unknown_children: usize = 0,
    other_attributes: usize = 0,
};

pub const Text = struct {
    control_index: usize,
    element_index: usize,
    kind: TextKind,
    /// Borrows the containing Control.raw_xml.
    raw_xml: []const u8,
    value: []const u8 = "",
    direct_children: usize = 0,
    other_attributes: usize = 0,
};

pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    controls: []const Control,
    texts: []const Text,
    value_bytes: usize,
    owned_bytes: usize,
    unknown_children: usize,
    other_attributes: usize,

    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const Budget = struct {
    max: usize,
    used: usize = 0,

    fn copy(self: *Budget, a: std.mem.Allocator, bytes: []const u8) ![]const u8 {
        if (bytes.len > self.max -| self.used) return error.LimitExceeded;
        const result = try a.dupe(u8, bytes);
        self.used += bytes.len;
        return result;
    }

    pub fn note(self: *Budget, count: usize) !void {
        if (count > self.max -| self.used) return error.LimitExceeded;
        self.used += count;
    }
};

fn controlKind(element: tree_mod.Element) ?Kind {
    if (element.is(document_xml.paragraph_uri, "indexmark")) return .indexmark;
    if (element.is(document_xml.paragraph_uri, "dutmal")) return .dutmal;
    return null;
}

fn textKind(element: tree_mod.Element, parent: Kind) ?TextKind {
    if (parent == .indexmark) {
        if (element.is(document_xml.paragraph_uri, "firstKey")) return .first_key;
        if (element.is(document_xml.paragraph_uri, "secondKey")) return .second_key;
    } else {
        if (element.is(document_xml.paragraph_uri, "mainText")) return .main_text;
        if (element.is(document_xml.paragraph_uri, "subText")) return .sub_text;
    }
    return null;
}

const attribute_names = [_][]const u8{ "posType", "szRatio", "option", "styleIDRef", "align" };

fn knownAttribute(name: xml.qname.QName, kind: Kind) bool {
    if (kind != .dutmal or name.prefix != null) return false;
    for (attribute_names) |wanted| if (name.local.equals(wanted, false)) return true;
    return false;
}

fn otherAttributeCount(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, kind: ?Kind) !usize {
    var tag = try attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var count: usize = 0;
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        if (kind) |control_kind| {
            if (knownAttribute(name, control_kind)) continue;
        }
        count += 1;
    }
    return count;
}

fn decodedAttribute(a: std.mem.Allocator, owned_a: std.mem.Allocator, budget: *Budget, attribute: ?xml.attribute_value.Value, limit: usize) !?[]const u8 {
    const present = attribute orelse return null;
    const decoded = try present.toUtf8(a, limit);
    defer a.free(decoded);
    return try budget.copy(owned_a, decoded);
}

fn dutmalAttributes(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, options: Options, budget: *Budget) !DutmalAttributes {
    var raw: [attribute_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &attribute_names, &raw);
    const result: DutmalAttributes = .{
        .pos_type = try decodedAttribute(a, owned_a, budget, raw[0], options.max_attribute_bytes),
        .sz_ratio = try decodedAttribute(a, owned_a, budget, raw[1], options.max_attribute_bytes),
        .option = try decodedAttribute(a, owned_a, budget, raw[2], options.max_attribute_bytes),
        .style_id_ref = try decodedAttribute(a, owned_a, budget, raw[3], options.max_attribute_bytes),
        .alignment = try decodedAttribute(a, owned_a, budget, raw[4], options.max_attribute_bytes),
    };
    if (result.pos_type) |value| {
        if (!std.mem.eql(u8, value, "TOP") and !std.mem.eql(u8, value, "BOTTOM")) return error.InvalidDutmalPosition;
    }
    if (result.alignment) |value| {
        const choices = [_][]const u8{ "JUSTIFY", "LEFT", "RIGHT", "CENTER", "DISTRIBUTE", "DISTRIBUTE_SPACE" };
        var found = false;
        for (choices) |choice| if (std.mem.eql(u8, value, choice)) {
            found = true;
            break;
        };
        if (!found) return error.InvalidDutmalAlignment;
    }
    for ([_]?[]const u8{ result.sz_ratio, result.option, result.style_id_ref }) |value| {
        if (value) |present| _ = try values.unsigned32(present);
    }
    return result;
}

const Target = union(enum) { control: usize, text: usize };

const ContentContext = struct {
    temp_a: std.mem.Allocator,
    owned_a: std.mem.Allocator,
    indices: *const std.AutoHashMapUnmanaged(usize, Target),
    control_builders: []std.ArrayList(u8),
    text_builders: []std.ArrayList(u8),
    max_value_bytes: usize,
    budget: *Budget,
    value_bytes: *usize,

    fn onContent(raw: *anyopaque, event: tree_mod.Tree.ContentEvent) anyerror!void {
        const self: *ContentContext = @ptrCast(@alignCast(raw));
        const target = self.indices.get(event.parent_index) orelse return;
        const builder = switch (target) {
            .control => |index| &self.control_builders[index],
            .text => |index| &self.text_builders[index],
        };
        try direct_text.append(self.temp_a, self.owned_a, builder, event.value, self.max_value_bytes, self.budget, self.value_bytes);
    }
};

/// Owns section indexmark/dutmal XML and modeled direct string children.
/// This does not infer index contents, note layout, or style reference validity.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options) !Report {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var budget: Budget = .{ .max = options.max_owned_bytes };
    var controls: std.ArrayList(Control) = .empty;
    var texts: std.ArrayList(Text) = .empty;
    var control_builders: std.ArrayList(std.ArrayList(u8)) = .empty;
    var text_builders: std.ArrayList(std.ArrayList(u8)) = .empty;
    var value_bytes: usize = 0;
    var unknown_children: usize = 0;
    var other_attributes: usize = 0;
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        var indices: std.AutoHashMapUnmanaged(usize, Target) = .empty;
        defer indices.deinit(a);
        const first_control = controls.items.len;
        const first_text = texts.items.len;
        for (tree.elements, 0..) |element, element_index| {
            const kind = controlKind(element) orelse continue;
            const parent_index = element.parent orelse continue;
            if (controls.items.len >= options.max_controls) return error.LimitExceeded;
            const parent_name = tree.elements[parent_index].name;
            if (parent_name.uri.len > options.max_name_bytes) return error.LimitExceeded;
            const parent_local = try (xml.text_content.View{
                .kind = .cdata,
                .raw = parent_name.local.raw,
                .encoding = parent_name.local.encoding,
                .scalars = 0,
                .reference_options = .{},
            }).toUtf8(a, options.max_name_bytes);
            defer a.free(parent_local);
            const root_index = controls.items.len;
            const raw_xml = try budget.copy(owned_a, tree.sourceOf(element_index));
            var control: Control = .{
                .section_ordinal = ordinal,
                .element_index = element_index,
                .parent_element_index = parent_index,
                .parent_uri = try budget.copy(owned_a, parent_name.uri),
                .parent_local_name = try budget.copy(owned_a, parent_local),
                .kind = kind,
                .raw_xml = raw_xml,
                .first_text = texts.items.len,
                .other_attributes = try otherAttributeCount(a, tree, element_index, kind),
            };
            if (kind == .dutmal) control.attributes = try dutmalAttributes(a, owned_a, tree, element_index, options, &budget);
            var child = element.first_child;
            while (child) |child_index| : (child = tree.elements[child_index].next_sibling) {
                control.direct_children += 1;
                const text_kind = textKind(tree.elements[child_index], kind) orelse {
                    control.unknown_children += 1;
                    unknown_children += 1;
                    continue;
                };
                if (texts.items.len >= options.max_texts) return error.LimitExceeded;
                const child_element = tree.elements[child_index];
                const base = element.start_tag.start;
                if (child_element.start_tag.start < base or child_element.end < child_element.start_tag.start or child_element.end - base > raw_xml.len) return error.InvalidSourceSpan;
                var text: Text = .{
                    .control_index = root_index,
                    .element_index = child_index,
                    .kind = text_kind,
                    .raw_xml = raw_xml[child_element.start_tag.start - base .. child_element.end - base],
                    .other_attributes = try otherAttributeCount(a, tree, child_index, null),
                };
                var descendant = child_element.first_child;
                while (descendant) |descendant_index| : (descendant = tree.elements[descendant_index].next_sibling) text.direct_children += 1;
                other_attributes += text.other_attributes;
                try texts.append(owned_a, text);
                try text_builders.append(owned_a, .empty);
                try indices.put(a, child_index, .{ .text = texts.items.len - 1 });
                control.text_count += 1;
            }
            other_attributes += control.other_attributes;
            try controls.append(owned_a, control);
            try control_builders.append(owned_a, .empty);
            try indices.put(a, element_index, .{ .control = root_index });
        }
        if (indices.count() == 0) continue;
        var content: ContentContext = .{
            .temp_a = a,
            .owned_a = owned_a,
            .indices = &indices,
            .control_builders = control_builders.items,
            .text_builders = text_builders.items,
            .max_value_bytes = options.max_value_bytes,
            .budget = &budget,
            .value_bytes = &value_bytes,
        };
        try tree.visitContent(a, .{ .context = &content, .on_content = ContentContext.onContent });
        for (controls.items[first_control..], first_control..) |*control, index| control.direct_text = try control_builders.items[index].toOwnedSlice(owned_a);
        for (texts.items[first_text..], first_text..) |*item, index| item.value = try text_builders.items[index].toOwnedSlice(owned_a);
    }
    return .{
        .arena = arena,
        .sections = sections.len,
        .controls = try controls.toOwnedSlice(owned_a),
        .texts = try texts.toOwnedSlice(owned_a),
        .value_bytes = value_bytes,
        .owned_bytes = budget.used,
        .unknown_children = unknown_children,
        .other_attributes = other_attributes,
    };
}
