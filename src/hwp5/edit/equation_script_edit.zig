//! Script-only edits of a currently owned EQEDIT. No font/layout guessing.
const std = @import("std");
const model = @import("../../model/document.zig");
const query = @import("equation_sources.zig");
const Version = @import("../version.zig").Version;
const Ticket = @import("../../model/history_mutation_epoch.zig").Ticket;
pub const Selector = struct { section: usize, equation_node: usize, layout: @import("../body/equation.zig").Layout };
pub const Witness = struct {
    selector: Selector,
    binding: Ticket,
    site: query.Site,
    section_sha256: [32]u8,
    payload_sha256: [32]u8,
    control_sha256: [32]u8,
    attributes: u32,
    tail_sha256: [32]u8,
};
pub const Request = struct { before: Witness, script: []const u8 };
pub fn digest(bytes: []const u8) [32]u8 {
    var value: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &value, .{});
    return value;
}
fn selected(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, node: usize) !query.Site {
    const sites = try query.sites(a, raw, version, current.paragraphs, .{});
    defer a.free(sites);
    var found: ?query.Site = null;
    for (sites) |site| if (site.equation_node == node) {
        if (found != null) return error.SourceBindingMismatch;
        found = site;
    };
    return found orelse error.InvalidEquationNode;
}
/// Ownership/protection is checked again at apply; a display node is no lease.
pub fn observe(a: std.mem.Allocator, decoded: []const []u8, document: *const model.Document, version: Version, selector: Selector, binding: Ticket) !Witness {
    if (selector.section >= document.sections.len) return error.InvalidSection;
    if (decoded.len != document.sections.len) return error.SourceBindingMismatch;
    const current = document.sections[selector.section];
    const raw = decoded[selector.section];
    const site = try selected(a, raw, version, current, selector.equation_node);
    if (current.paragraphs[site.paragraph].parent_node != null) return error.UnsupportedEquationHost;
    var protection = try @import("text_source_protection.zig").read(a, decoded, version, selector.section, current);
    defer protection.deinit(a);
    if (site.paragraph >= protection.protected_paragraphs.len) return error.SourceBindingMismatch;
    if (protection.protected_paragraphs[site.paragraph]) return error.UnsupportedEquationProtectedHost;
    const spans = try @import("local_field_spans.zig").collectReadableBound(a, raw, version, current);
    defer a.free(spans);
    for (spans) |span| {
        if (site.paragraph < span.begin.paragraph or site.paragraph > span.end.paragraph) continue;
        const end = std.math.add(u32, site.current_unit, 8) catch return error.SourceBindingMismatch;
        if ((site.paragraph != span.begin.paragraph or end > span.begin.unit) and (site.paragraph != span.end.paragraph or site.current_unit <= span.end.unit)) return error.UnsupportedEquationFieldHost;
    }
    // Explicit layout only. Tail bytes, fonts, version and unknown words stay opaque.
    const detail = try query.readSelected(a, raw, version, selector.equation_node, selector.layout, .{});
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const node = tree.nodes[selector.equation_node];
    if (node.subtree_end != selector.equation_node + 1) return error.UnsupportedEquationRecordChildren;
    const control_hash = digest(tree.nodes[site.control_node].record.framing.raw);
    var matching: usize = 0;
    for (tree.nodes) |record| {
        if (record.record.framing.tag != 71) continue;
        const hash = digest(record.record.framing.raw);
        if (std.mem.eql(u8, &control_hash, &hash)) matching += 1;
    }
    if (matching != 1) return error.UnsupportedEquationAmbiguousOwner;
    return .{ .selector = selector, .binding = binding, .site = site, .section_sha256 = digest(raw), .payload_sha256 = digest(node.record.framing.payload), .control_sha256 = control_hash, .attributes = detail.attributes, .tail_sha256 = digest(node.record.framing.payload[6 + detail.script.len ..]) };
}
/// Replaces only count+script. Every byte after the old script is retained.
pub fn patch(a: std.mem.Allocator, raw: []const u8, version: Version, node_index: usize, layout: @import("../body/equation.zig").Layout, expected_payload: [32]u8, script: []const u8, limit: usize) !?[]u8 {
    if (script.len == 0) return error.EmptyEquationScript;
    if (script.len > @import("equation_create_request.zig").max_script_bytes) return error.LimitExceeded;
    if (!std.unicode.utf8ValidateSlice(script)) return error.InvalidEquationScriptEncoding;
    const units = std.unicode.calcUtf16LeLen(script) catch return error.InvalidEquationScriptEncoding;
    if (units > 65535) return error.LimitExceeded;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    if (node_index >= tree.nodes.len) return error.InvalidEquationNode;
    const node = tree.nodes[node_index];
    if (node.record.framing.tag != 88 or node.subtree_end != node_index + 1) return error.InvalidEquationNode;
    const old = try query.readSelected(a, raw, version, node_index, layout, .{});
    const payload = node.record.framing.payload;
    const hash = digest(payload);
    if (!std.mem.eql(u8, &hash, &expected_payload)) return error.SourceBindingMismatch;
    const encoded = try std.unicode.utf8ToUtf16LeAlloc(a, script);
    defer a.free(encoded);
    const bytes = std.mem.sliceAsBytes(encoded);
    if (std.mem.eql(u8, old.script, bytes)) return null;
    const suffix_start = try std.math.add(usize, 6, old.script.len);
    if (suffix_start > payload.len) return error.SourceBindingMismatch;
    const size = try std.math.add(usize, 6 + bytes.len, payload.len - suffix_start);
    if (size > limit) return error.LimitExceeded;
    const replacement = try a.alloc(u8, size);
    defer a.free(replacement);
    @memcpy(replacement[0..4], payload[0..4]);
    std.mem.writeInt(u16, replacement[4..6], @intCast(units), .little);
    @memcpy(replacement[6..][0..bytes.len], bytes);
    @memcpy(replacement[6 + bytes.len ..], payload[suffix_start..]);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |record, index| {
        if (index == node_index) {
            try @import("../record_writer.zig").append(a, &out, 88, record.record.framing.level, replacement, limit);
        } else {
            if (out.items.len > limit or record.record.framing.raw.len > limit - out.items.len) return error.LimitExceeded;
            try out.appendSlice(a, record.record.framing.raw);
        }
    }
    const result = try query.readSelected(a, out.items, version, node_index, layout, .{});
    if (!std.mem.eql(u8, result.script, bytes)) return error.EquationScriptVerificationFailed;
    return try out.toOwnedSlice(a);
}
/// No node count/order change: retain semantic intents and recompute byte offsets.
/// Fixed object geometry and its line placements are unchanged, not remeasured.
pub fn prepare(a: std.mem.Allocator, decoded: []const []u8, document: *const model.Document, version: Version, request: Request, binding: Ticket, style_count: usize, limit: usize) !?model.Section {
    if (!std.meta.eql(request.before.binding.binding, binding.binding)) return error.SourceBindingMismatch;
    if (request.before.binding.epoch != binding.epoch) return error.StaleMutationEpoch;
    const actual = try observe(a, decoded, document, version, request.before.selector, binding);
    if (!std.meta.eql(actual, request.before)) return error.SourceBindingMismatch;
    const index = actual.selector.section;
    const bytes = (try patch(a, decoded[index], version, actual.selector.equation_node, actual.selector.layout, actual.payload_sha256, request.script, limit)) orelse return null;
    errdefer a.free(bytes);
    var offsets: std.ArrayList(usize) = .empty;
    defer offsets.deinit(a);
    var records = @import("../record.zig").Iterator.init(bytes, .{});
    var record_count: usize = 0;
    while (try records.next()) |record| : (record_count += 1) {
        if (record.tag != 66) continue;
        const Header = @import("../body/paragraph_header.zig").Header;
        const header = try Header.parse(record.payload, version);
        if (header.style_id >= style_count) return error.InvalidStyleReference;
        try offsets.append(a, record.offset + record.raw.len - record.payload.len + Header.style_id_offset);
    }
    const current = document.sections[index];
    if (record_count != current.source_record_count) return error.SourceBindingMismatch;
    const styles = try offsets.toOwnedSlice(a);
    errdefer a.free(styles);
    var candidate = try @import("../../model/clone.zig").section(a, current);
    const original_count = if (candidate.rebased_source) |basis| basis.original_record_count else candidate.source_record_count;
    if (candidate.rebased_source) |*basis| basis.deinit(a);
    candidate.rebased_source = .{ .bytes = bytes, .style_offsets = styles, .original_record_count = original_count };
    return candidate;
}

/// Actual CFB save is parsed afresh before publication. No caller/native node remap.
pub fn verifySaved(a: std.mem.Allocator, saved: []const u8, request: Request) !void {
    var source = try @import("../text_source.zig").Source.open(a, saved);
    defer source.deinit();
    const raw = try source.decodeSection(a, request.before.selector.section);
    defer a.free(raw);
    const version = source.header.version();
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const encoded = try std.unicode.utf8ToUtf16LeAlloc(a, request.script);
    defer a.free(encoded);
    var found: usize = 0;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 88) continue;
        const parent = node.parent orelse return error.OrphanEquation;
        const hash = digest(tree.nodes[parent].record.framing.raw);
        if (!std.mem.eql(u8, &hash, &request.before.control_sha256)) continue;
        const row = try query.readSelected(a, raw, version, index, request.before.selector.layout, .{});
        if (!std.mem.eql(u8, row.script, std.mem.sliceAsBytes(encoded))) return error.EquationScriptVerificationFailed;
        const tail_hash = digest(node.record.framing.payload[6 + row.script.len ..]);
        if (row.attributes != request.before.attributes or !std.mem.eql(u8, &tail_hash, &request.before.tail_sha256)) return error.EquationScriptVerificationFailed;
        found += 1;
    }
    if (found != 1) return error.EquationScriptVerificationFailed;
}
