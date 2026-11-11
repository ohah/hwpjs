//! Read-only names from exact CTRL_DATA owners and values from current field spans.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;
const rules = @import("../body/control_rules.zig");
const field_start = @import("../body/field_start.zig");
const topology = @import("local_field_spans.zig");
const names = @import("control_data_names.zig");

const SourceLocation = struct { paragraph: usize, sourceNode: u32, startUnit: u32, endUnit: u32 };
const Row = struct {
    section: usize,
    node: usize,
    kind: enum { CLICK_HERE, BOOKMARK },
    name: ?[]const u8,
    text: ?[]const u8 = null,
    sourceLocation: ?SourceLocation = null,
};
const Snapshot = struct {
    rows: std.ArrayList(Row) = .empty,
    complete: bool = true,
    name_bytes: usize = 2 * 1024 * 1024,
    value_bytes: usize = 4 * 1024 * 1024,
};
const Key = struct { paragraph: usize, ordinal: usize };
const Start = struct { id: u32, span: ?topology.Span = null };
const CurrentText = std.AutoHashMapUnmanaged(usize, ?[]u8);

pub fn encode(a: std.mem.Allocator, source: []const []const u8, version: Version, document: *const model.Document) ![]u8 {
    if (source.len != document.sections.len) return error.SourceBindingMismatch;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    var snapshot: Snapshot = .{};
    for (source, document.sections, 0..) |bytes, section, index| {
        try collect(a, arena.allocator(), bytes, version, section, index, &snapshot);
    }
    return std.json.Stringify.valueAlloc(a, .{
        .format = "hwp5",
        .coverage = if (snapshot.complete) "complete" else "partial",
        .rows = snapshot.rows.items,
    }, .{});
}

fn collect(a: std.mem.Allocator, owned: std.mem.Allocator, bytes: []const u8, version: Version, section: model.Section, si: usize, result: *Snapshot) !void {
    var tree = try Tree.parseTextPreview(a, bytes, version, .{});
    defer tree.deinit(a);
    // Other source controls do not need field topology.
    var headers: std.ArrayList(usize) = .empty;
    defer headers.deinit(a);
    var header_counts: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer header_counts.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        const record = node.record.framing;
        if (record.tag == 87) {
            if (node.parent == null or tree.nodes[node.parent.?].record.value == .header)
                result.complete = false;
            continue;
        }
        if (record.tag != 71) continue;
        const header = try @import("../body/control_header.zig").Header.parse(record.payload);
        if (!field_start.supports(header.id)) continue;
        const parent = node.parent orelse {
            result.complete = false;
            continue;
        };
        if (tree.nodes[parent].record.value != .header) {
            result.complete = false;
            continue;
        }
        const count = try header_counts.getOrPut(a, parent);
        if (!count.found_existing) count.value_ptr.* = 0;
        count.value_ptr.* += 1;
        try headers.append(a, index);
    }
    if (headers.items.len == 0) {
        for (section.paragraphs) |paragraph| for (paragraph.tokens) |token| {
            if (token.kind == .control and isFieldMarker(token.raw)) result.complete = false;
        };
        return;
    }

    var report: ?topology.Report = topology.inspectReadableBound(a, bytes, version, section) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => blk: {
            result.complete = false;
            break :blk null;
        },
    };
    defer if (report) |*value| value.deinit(a);
    var starts: std.AutoHashMapUnmanaged(Key, Start) = .empty;
    defer starts.deinit(a);
    var current: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer current.deinit(a);
    const counts = try a.alloc(usize, section.paragraphs.len);
    defer a.free(counts);
    @memset(counts, 0);
    if (report) |value| {
        for (value.spans) |span| {
            try putStart(a, &starts, counts, span.begin.paragraph, span.ordinal, .{ .id = span.field_id, .span = span });
        }
        for (value.unresolved) |item| {
            if (item.kind != .unclosed_start) {
                result.complete = false;
                continue;
            }
            try putStart(a, &starts, counts, item.position.paragraph, item.ordinal orelse return error.SourceBindingMismatch, .{ .id = item.marker_id });
        }
        for (section.paragraphs, counts, 0..) |p, count, pi| {
            const node = p.originalNode() catch {
                if (count != 0) result.complete = false;
                continue;
            };
            const entry = try current.getOrPut(a, node);
            if (entry.found_existing) return error.SourceBindingMismatch;
            entry.value_ptr.* = pi;
            if (count != (header_counts.get(node) orelse 0)) result.complete = false;
        }
    }

    // Cache raw current text only while querying this section. Each value must
    // fall between the exact bound markers and have no inner control tokens.
    var raw_cache: CurrentText = .empty;
    defer {
        var values = raw_cache.valueIterator();
        while (values.next()) |raw| if (raw.*) |text| a.free(text);
        raw_cache.deinit(a);
    }
    var ordinals: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer ordinals.deinit(a);
    for (headers.items) |index| {
        const node = tree.nodes[index];
        const parent = node.parent.?;
        const entry = try ordinals.getOrPut(a, parent);
        if (!entry.found_existing) entry.value_ptr.* = 0;
        const ordinal = entry.value_ptr.*;
        entry.value_ptr.* += 1;
        const header = try @import("../body/control_header.zig").Header.parse(node.record.framing.payload);
        const kind: @FieldType(Row, "kind") = if (header.id == rules.id("%clk")) .CLICK_HERE else if (header.id == rules.id("%bmk")) .BOOKMARK else {
            result.complete = false;
            continue;
        };
        _ = field_start.Properties.parse(header.properties) catch {
            result.complete = false;
            continue;
        };
        if (result.rows.items.len == 20_000) {
            result.complete = false;
            break;
        }
        const raw_name = readName(a, tree, index) catch |err| switch (err) {
            error.OutOfMemory => return err,
            else => {
                result.complete = false;
                continue;
            },
        };
        var name: ?[]const u8 = null;
        if (raw_name) |raw| {
            if (raw.len > 4096 or raw.len * 2 > result.name_bytes) {
                result.complete = false;
                continue;
            }
            name = (try utf8(owned, a, raw)) orelse {
                result.complete = false;
                continue;
            };
            result.name_bytes -= name.?.len;
        }
        var row: Row = .{ .section = si, .node = index, .kind = kind, .name = name };
        if (current.get(parent)) |pi| {
            if (counts[pi] == header_counts.get(parent).?) {
                const start = starts.get(.{ .paragraph = pi, .ordinal = ordinal });
                if (start == null or start.?.id != header.id) result.complete = false;
                if (start != null and start.?.id == header.id) {
                    if (start.?.span) |span| {
                        const p = section.paragraphs[pi];
                        if (p.parent_node == null and span.end.paragraph == pi) {
                            try projectValue(a, owned, tree, p, parent, span, &raw_cache, &row, result);
                        }
                    }
                }
            }
        } else result.complete = false;
        try result.rows.append(owned, row);
    }
}

fn putStart(a: std.mem.Allocator, starts: *std.AutoHashMapUnmanaged(Key, Start), counts: []usize, pi: usize, ordinal: usize, value: Start) !void {
    if (pi >= counts.len) return error.SourceBindingMismatch;
    const entry = try starts.getOrPut(a, .{ .paragraph = pi, .ordinal = ordinal });
    if (entry.found_existing) return error.SourceBindingMismatch;
    entry.value_ptr.* = value;
    counts[pi] += 1;
}

fn readName(a: std.mem.Allocator, tree: Tree, index: usize) !?[]const u8 {
    var data: ?usize = null;
    var child = index + 1;
    while (child < tree.nodes[index].subtree_end) : (child = tree.nodes[child].subtree_end) {
        const node = tree.nodes[child];
        if (node.parent != index) return error.SourceBindingMismatch;
        if (node.record.framing.tag != 87) continue;
        if (data != null) return error.UnsupportedControlData;
        data = child;
    }
    const at = data orelse return null;
    const owner = try names.ownerForTree(tree, at);
    var doc = try @import("../parameters/parser.zig").Document.parse(a, tree.nodes[at].record.framing.payload, .{
        .header_layout = .observed6,
        .null_layout = .observed_empty,
    });
    defer doc.deinit(a);
    return try names.name(doc, owner);
}

fn projectValue(a: std.mem.Allocator, owned: std.mem.Allocator, tree: Tree, p: model.Paragraph, source_node: usize, span: topology.Span, cache: *CurrentText, row: *Row, result: *Snapshot) !void {
    const start = span.begin.unit;
    const end = span.end.unit;
    if (end < start or end > p.declared_units) return error.SourceBindingMismatch;
    if (@as(usize, end - start) * 3 > result.value_bytes) return;
    const cached = try cache.getOrPut(a, span.begin.paragraph);
    if (!cached.found_existing) {
        cached.value_ptr.* = null;
        if (p.restart_control_source == null and try sameFieldMarkers(tree, source_node, p)) {
            cached.value_ptr.* = try @import("plain_text_content.zig").textBytes(a, p);
        } else result.complete = false;
    }
    const raw = cached.value_ptr.* orelse return;
    if (raw.len / 2 != p.declared_units) return error.SourceBindingMismatch;
    const value = raw[@as(usize, start) * 2 .. @as(usize, end) * 2];
    const Text = @import("../body/text.zig").Text;
    var tokens = (try Text.parse(value)).tokens();
    while (try tokens.next()) |token| if (token.value == .control) return;
    row.text = (try utf8(owned, a, value)) orelse return;
    result.value_bytes -= row.text.?.len;
    row.sourceLocation = .{
        .paragraph = span.begin.paragraph,
        .sourceNode = std.math.cast(u32, source_node) orelse return error.LimitExceeded,
        .startUnit = start,
        .endUnit = end,
    };
}

fn isFieldMarker(raw: []const u8) bool {
    if (raw.len != 16) return false;
    const code = std.mem.readInt(u16, raw[0..2], .little);
    return code == 3 or code == 4;
}

// Ownership and ordinal alone cannot authorize a marker moved between source
// paragraphs. Require the original field marker sequence to survive verbatim.
fn sameFieldMarkers(tree: Tree, node: usize, p: model.Paragraph) !bool {
    const children = try @import("../body/paragraph_children.zig").collect(tree, node);
    const text = children.text_node orelse return false;
    var original = tree.nodes[text].record.value.text.tokens();
    var index: usize = 0;
    while (try original.next()) |token| {
        if (token.value != .control or !isFieldMarker(token.raw)) continue;
        while (index < p.tokens.len) : (index += 1) {
            const current = p.tokens[index];
            if (current.kind == .control and isFieldMarker(current.raw)) break;
        }
        if (index == p.tokens.len or !std.mem.eql(u8, p.tokens[index].raw, token.raw)) return false;
        index += 1;
    }
    for (p.tokens[index..]) |token| {
        if (token.kind == .control and isFieldMarker(token.raw)) return false;
    }
    return true;
}

fn utf8(owned: std.mem.Allocator, a: std.mem.Allocator, raw: []const u8) !?[]const u8 {
    if (raw.len % 2 != 0) return null;
    const units = try a.alloc(u16, raw.len / 2);
    defer a.free(units);
    for (units, 0..) |*unit, i| unit.* = std.mem.nativeToLittle(u16, std.mem.readInt(u16, raw[i * 2 ..][0..2], .little));
    return std.unicode.utf16LeToUtf8Alloc(owned, units) catch |err| switch (err) {
        error.DanglingSurrogateHalf, error.ExpectedSecondSurrogateHalf, error.UnexpectedSecondSurrogateHalf => null,
        else => return err,
    };
}
