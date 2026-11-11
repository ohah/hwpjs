//! Named CLICK_HERE parameter edits. The source tree and existing History own state.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");
const uri = @import("document_xml.zig").paragraph_uri;
const creation = @import("named_field_create.zig");
pub const max_value_bytes = creation.max_parameter_bytes;
pub const max_request_bytes = 128 * 1024;

pub const Values = struct { direction: ?[]const u8, memo: ?[]const u8 };
pub const Update = struct {
    expected: Values,
    direction: []const u8,
    memo: []const u8,
};
pub const Request = struct {
    section: usize,
    paragraph: usize,
    beginElement: usize,
    expectedName: []const u8,
    expected: Values,
    direction: []const u8,
    memo: []const u8,
};

const Parsed = struct {
    arena: std.heap.ArenaAllocator,
    list: ?usize = null,
    // Direction, HelpState, Command.
    nodes: [3]?usize = .{ null, null, null },
    text: [3]std.ArrayList(u8) = .{ .empty, .empty, .empty },
    values: Values = .{ .direction = null, .memo = null },
    count: u32 = 0,
    pub fn deinit(self: *Parsed) void {
        self.arena.deinit();
    }
};

pub fn query(session: *const editor.Session, section: usize, paragraph: usize, element: usize, name: []const u8) ![]u8 {
    try @import("named_fields.zig").selected(session, section, element, name);
    const part = &session.sections[section];
    try part.validateSourceBasis();
    var parsed = try parse(session.allocator, &part.tree, element);
    defer parsed.deinit();
    var can_edit = session.history_delta_managed and @import("named_field_parameter_rebase.zig").supports(session, section, part);
    if (can_edit) {
        _ = @import("named_fields.zig").authorizeRename(session, section, paragraph, element, name, name) catch |err| switch (err) {
            error.NamedFieldProtected, error.NamedFieldRenameUnavailable, error.StaleNamedFieldTarget => blk: {
                can_edit = false;
                break :blk false;
            },
            else => return err,
        };
    }
    return std.json.Stringify.valueAlloc(session.allocator, .{
        .direction = parsed.values.direction,
        .memo = parsed.values.memo,
        .canEdit = can_edit,
    }, .{});
}

pub fn apply(session: *editor.Session, section: usize, paragraph: usize, element: usize, name: []const u8, update: Update) !bool {
    if (!session.history_delta_managed or !session.history_transaction_active)
        return error.HistoryProtocol2Required;
    _ = try @import("named_fields.zig").authorizeRename(session, section, paragraph, element, name, name);
    const old = &session.sections[section];
    try old.validateSourceBasis();
    if (!@import("named_field_parameter_rebase.zig").supports(session, section, old))
        return error.UnsupportedNamedFieldParametersSection;
    if (update.direction.len > max_value_bytes or update.memo.len > max_value_bytes)
        return error.LimitExceeded;
    const a = session.allocator;
    var parsed = try parse(a, &old.tree, element);
    defer parsed.deinit();
    if (!optionalEqual(parsed.values.direction, update.expected.direction) or
        !optionalEqual(parsed.values.memo, update.expected.memo))
        return error.NamedFieldParametersMismatch;
    if (optionalEqual(parsed.values.direction, update.direction) and
        optionalEqual(parsed.values.memo, update.memo))
        return false;

    if (old.structure_values != null)
        return @import("named_field_parameter_rebase.zig").apply(session, section, paragraph, element, name, update);

    const scratch = parsed.arena.allocator();
    var changes: std.ArrayList(writer.Change) = .empty;
    const tree = &old.tree;
    if (parsed.list) |list| {
        const list_node = tree.elements[list];
        // Only scalar contents, a count attribute when needed, and new scalar nodes change.
        var added: std.ArrayList(u8) = .empty;
        for ([_][]const u8{ update.direction, update.memo }, 0..) |value, index| {
            if (optionalEqual(if (index == 0) parsed.values.direction else parsed.values.memo, value)) continue;
            if (parsed.nodes[index]) |node| {
                try scalarChange(scratch, tree, node, value, &changes);
            } else {
                const name_key = if (index == 0) "Direction" else "HelpState";
                try appendScalar(scratch, &added, try prefixOf(scratch, tree, list), name_key, value);
                parsed.count = std.math.add(u32, parsed.count, 1) catch return error.LimitExceeded;
            }
        }
        if (parsed.nodes[2]) |command_node| {
            const command = try creation.commandValue(scratch, .{ .direction = update.direction, .memo = update.memo });
            try scalarChange(scratch, tree, command_node, command, &changes);
        }
        if (added.items.len != 0) {
            if (list_node.end_tag) |closing| {
                const tag = try countTag(scratch, tree, list, parsed.count);
                try changes.append(scratch, .{
                    .start = list_node.start_tag.start,
                    .end = list_node.start_tag.end,
                    .text = "",
                    .start_tag = tag,
                });
                try changes.append(scratch, .{ .start = closing.start, .end = closing.start, .text = "", .serialized_xml = added.items });
            } else {
                const tag = try countTag(scratch, tree, list, parsed.count);
                const qname = try tagName(scratch, tree, list);
                const expanded = try std.fmt.allocPrint(scratch, "{s}>{s}</{s}>", .{ tag[0 .. tag.len - 2], added.items, qname });
                try changes.append(scratch, .{ .start = list_node.start_tag.start, .end = list_node.end, .text = "", .serialized_xml = expanded });
            }
        }
    } else {
        var added: std.ArrayList(u8) = .empty;
        const prefix = try prefixOf(scratch, tree, element);
        try appendScalar(scratch, &added, prefix, "Direction", update.direction);
        try appendScalar(scratch, &added, prefix, "HelpState", update.memo);
        const parameters = try std.fmt.allocPrint(scratch, "<{s}parameters cnt=\"2\" name=\"\">{s}</{s}parameters>", .{ prefix, added.items, prefix });
        const begin = tree.elements[element];
        if (begin.end_tag != null) {
            try changes.append(scratch, .{ .start = begin.start_tag.end, .end = begin.start_tag.end, .text = "", .serialized_xml = parameters });
        } else {
            const raw = try currentBeginTag(scratch, tree, element, old.field_dirty.items);
            const qname = try tagName(scratch, tree, element);
            const expanded = try std.fmt.allocPrint(scratch, "{s}>{s}</{s}>", .{ raw[0 .. raw.len - 2], parameters, qname });
            try changes.append(scratch, .{ .start = begin.start_tag.start, .end = begin.end, .text = "", .serialized_xml = expanded });
        }
    }
    // A self-closing begin expansion has already baked its current dirty attribute.
    var dirty: std.ArrayList(@import("text_sites_save.zig").FieldDirty) = .empty;
    const baked_begin = parsed.list == null and tree.elements[element].end_tag == null;
    for (old.field_dirty.items) |field| {
        if (!baked_begin or field.element_index != element) try dirty.append(scratch, field);
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, lhs: writer.Change, rhs: writer.Change) bool {
            return lhs.start < rhs.start;
        }
    }.less);
    const xml = try @import("text_sites_save.zig").writeWithChanges(a, tree, &old.sites, editor.siteOptions(session.options), dirty.items, changes.items, session.options.max_xml_bytes);
    defer a.free(xml);
    const original = old.original_basis orelse return error.SourceBindingMismatch;
    const next = try @import("section_source_basis.zig").prepare(a, xml, section, tree.item_index, old.first_paragraph, session.options);
    var staged: editor.Section = .{
        .original_basis = original,
        .owned_rebased_basis = next.basis,
        .tree = next.basis.tree,
        .sites = next.sites,
        .locations = next.basis.locations,
        .entry_index = old.entry_index,
        .first_paragraph = old.first_paragraph,
        .source_first_paragraph = old.first_paragraph,
        .last_paragraph = next.basis.last_paragraph,
    };
    errdefer staged.deinitCurrent(a);
    if (staged.last_paragraph != old.last_paragraph) return error.SourceBindingMismatch;
    try session.installSectionSourceBasis(section, &staged);
    return true;
}

fn optionalEqual(lhs: ?[]const u8, rhs: ?[]const u8) bool {
    if (lhs) |a| return if (rhs) |b| std.mem.eql(u8, a, b) else false;
    return rhs == null;
}

fn parse(a: std.mem.Allocator, tree: *const Tree, element: usize) !Parsed {
    var result: Parsed = .{ .arena = std.heap.ArenaAllocator.init(a) };
    errdefer result.deinit();
    const scratch = result.arena.allocator();
    if (element >= tree.elements.len or !tree.elements[element].is(uri, "fieldBegin"))
        return error.InvalidFieldElement;
    var child = tree.elements[element].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "parameters")) continue;
        if (result.list != null) return error.UnsupportedNamedFieldParameters;
        result.list = index;
    }
    const list = result.list orelse return result;
    const count = (try tree.attributeValue(scratch, list, "", "cnt")) orelse return error.UnsupportedNamedFieldParameters;
    const count_text = try count.toUtf8(scratch, 32);
    const declared = try @import("xml_values.zig").unsigned32(count_text);
    child = tree.elements[list].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        result.count = std.math.add(u32, result.count, 1) catch return error.LimitExceeded;
        if (!std.mem.eql(u8, tree.elements[index].name.uri, uri)) continue;
        const name = (try tree.attributeValue(scratch, index, "", "name")) orelse continue;
        const decoded = try name.toUtf8(scratch, 4096);
        for ([_][]const u8{ "Direction", "HelpState", "Command" }, 0..) |key, slot| {
            if (!std.mem.eql(u8, key, decoded)) continue;
            if (result.nodes[slot] != null or !tree.elements[index].is(uri, "stringParam") or tree.elements[index].first_child != null)
                return error.UnsupportedNamedFieldParameters;
            const node = tree.elements[index];
            const content = if (node.end_tag) |end| tree.source[node.start_tag.end..end.start] else "";
            if (std.mem.indexOf(u8, content, "<!--") != null or std.mem.indexOf(u8, content, "<?") != null)
                return error.UnsupportedNamedFieldParameters;
            result.nodes[slot] = index;
        }
    }
    if (result.count != declared) return error.UnsupportedNamedFieldParameters;
    const Context = struct {
        allocator: std.mem.Allocator,
        parsed: *Parsed,
        fn content(raw: *anyopaque, event: Tree.ContentEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            for (self.parsed.nodes, 0..) |node, slot| {
                if (node != event.parent_index) continue;
                const limit: usize = if (slot == 2) 2 * max_value_bytes + 256 else max_value_bytes;
                const decoded = try event.value.toUtf8(self.allocator, limit -| self.parsed.text[slot].items.len);
                try self.parsed.text[slot].appendSlice(self.allocator, decoded);
            }
        }
    };
    var context: Context = .{ .allocator = scratch, .parsed = &result };
    try tree.visitContent(scratch, .{ .context = &context, .on_content = Context.content });
    result.values = .{
        .direction = if (result.nodes[0] != null) result.text[0].items else null,
        .memo = if (result.nodes[1] != null) result.text[1].items else null,
    };
    if (result.nodes[2] != null) {
        const command = try commandValues(result.text[2].items);
        if (result.values.direction) |value| {
            if (!std.mem.eql(u8, value, command.direction.?)) return error.UnsupportedNamedFieldParameters;
        } else result.values.direction = command.direction;
        if (result.values.memo) |value| {
            if (!std.mem.eql(u8, value, command.memo.?)) return error.UnsupportedNamedFieldParameters;
        } else result.values.memo = command.memo;
    }
    return result;
}

fn number(text: []const u8, cursor: *usize) !u32 {
    const end = std.mem.indexOfScalarPos(u8, text, cursor.*, ':') orelse return error.UnsupportedNamedFieldParameters;
    const raw = text[cursor.*..end];
    if (raw.len == 0) return error.UnsupportedNamedFieldParameters;
    for (raw) |byte| if (!std.ascii.isDigit(byte)) return error.UnsupportedNamedFieldParameters;
    const value = std.fmt.parseInt(u32, raw, 10) catch return error.UnsupportedNamedFieldParameters;
    cursor.* = end + 1;
    return value;
}

fn commandValues(text: []const u8) !Values {
    const prefix = "Clickhere:set:";
    if (!std.mem.startsWith(u8, text, prefix)) return error.UnsupportedNamedFieldParameters;
    var cursor: usize = prefix.len;
    const units = try number(text, &cursor);
    const bytes = @import("text_site_edit.zig").bytePosition(text[cursor..], units) catch return error.UnsupportedNamedFieldParameters;
    const payload = text[cursor..][0..bytes];
    if (std.mem.trim(u8, text[cursor + bytes ..], " \t\r\n").len != 0) return error.UnsupportedNamedFieldParameters;
    var result: Values = .{ .direction = null, .memo = null };
    cursor = 0;
    for (0..2) |_| {
        while (cursor < payload.len and std.ascii.isWhitespace(payload[cursor])) : (cursor += 1) {}
        const direction = std.mem.startsWith(u8, payload[cursor..], "Direction:wstring:");
        const key = if (direction) "Direction:wstring:" else "HelpState:wstring:";
        if (!std.mem.startsWith(u8, payload[cursor..], key)) return error.UnsupportedNamedFieldParameters;
        cursor += key.len;
        const length = try number(payload, &cursor);
        const end = @import("text_site_edit.zig").bytePosition(payload[cursor..], length) catch return error.UnsupportedNamedFieldParameters;
        const value = payload[cursor..][0..end];
        if (value.len > max_value_bytes) return error.LimitExceeded;
        const slot = if (direction) &result.direction else &result.memo;
        if (slot.* != null) return error.UnsupportedNamedFieldParameters;
        slot.* = value;
        cursor += end;
        if (cursor < payload.len and !std.ascii.isWhitespace(payload[cursor])) return error.UnsupportedNamedFieldParameters;
    }
    if (std.mem.trim(u8, payload[cursor..], " \t\r\n").len != 0 or result.direction == null or result.memo == null)
        return error.UnsupportedNamedFieldParameters;
    return result;
}

fn tagName(a: std.mem.Allocator, tree: *const Tree, element: usize) ![]const u8 {
    var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, element);
    defer tag.deinit(a);
    if (tag.name.encoding != .utf8) return error.UnsupportedEditEncoding;
    return a.dupe(u8, tag.name.raw);
}

fn prefixOf(a: std.mem.Allocator, tree: *const Tree, element: usize) ![]const u8 {
    const name = try tagName(a, tree, element);
    const local = tree.elements[element].name.local.raw;
    return name[0 .. name.len - local.len];
}

fn appendScalar(a: std.mem.Allocator, out: *std.ArrayList(u8), prefix: []const u8, key: []const u8, value: []const u8) !void {
    const escaped = try @import("../xml/text_writer.zig").encode(a, value, 6 * max_value_bytes);
    const node = try std.fmt.allocPrint(a, "<{s}stringParam name=\"{s}\">{s}</{s}stringParam>", .{ prefix, key, escaped, prefix });
    try out.appendSlice(a, node);
}

fn scalarChange(a: std.mem.Allocator, tree: *const Tree, index: usize, value: []const u8, changes: *std.ArrayList(writer.Change)) !void {
    const node = tree.elements[index];
    if (node.end_tag) |closing| {
        try changes.append(a, .{ .start = node.start_tag.end, .end = closing.start, .text = value });
    } else {
        try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = value, .expand_empty_element = true });
    }
}

fn countTag(a: std.mem.Allocator, tree: *const Tree, index: usize, count: u32) ![]u8 {
    const node = tree.elements[index];
    const attr = (try tree.attributeValue(a, index, "", "cnt")) orelse return error.UnsupportedNamedFieldParameters;
    const raw = tree.source[node.start_tag.start..node.start_tag.end];
    const offset = @intFromPtr(attr.raw.ptr) - @intFromPtr(raw.ptr);
    return std.fmt.allocPrint(a, "{s}\"{d}\"{s}", .{ raw[0..offset], count, raw[offset + attr.raw.len ..] });
}

fn currentBeginTag(a: std.mem.Allocator, tree: *const Tree, element: usize, dirty: []const @import("text_sites_save.zig").FieldDirty) ![]const u8 {
    var found: ?bool = null;
    for (dirty) |item| {
        if (item.element_index != element) continue;
        if (found != null) return error.DuplicateFieldDirty;
        found = item.dirty;
    }
    if (found) |value| return @import("field_dirty_tag.zig").write(a, tree, element, value, 64 * 1024);
    const node = tree.elements[element];
    return tree.source[node.start_tag.start..node.start_tag.end];
}
