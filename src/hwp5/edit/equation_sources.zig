//! EQEDIT 원문 조회. 반환 배열만 소유하며 문자열은 입력 Section 바이트를 빌린다.
const std = @import("std");
const equation = @import("../body/equation.zig");
const rules = @import("../body/control_rules.zig");
const Version = @import("../version.zig").Version;

pub const Options = struct {
    records: @import("../record.zig").Options = .{},
    max_equations: usize = 10_000,
    max_script_bytes: usize = 1024 * 1024,
};

pub const Source = struct {
    control_node: usize,
    equation_node: usize,
    attributes: u32,
    /// UTF16LE 원문이다. NUL과 짝 없는 서로게이트도 변형하지 않는다.
    script: []const u8,
    font_size: u32,
    color: u32,
    baseline: i16,
    unknown: u16,
    version_info: []const u8,
    font_name: ?[]const u8,
    extra: []const u8,
};

const RecordSite = struct { control_node: usize, equation_node: usize };
pub const Site = struct {
    control_node: usize,
    equation_node: usize,
    paragraph_node: usize,
    paragraph: usize,
    source_unit: usize,
    current_unit: u32,
};

fn collect(a: std.mem.Allocator, tree: @import("../body/tree.zig").Tree, options: Options) ![]RecordSite {
    const counts = try a.alloc(u8, tree.nodes.len);
    defer a.free(counts);
    @memset(counts, 0);
    var out: std.ArrayList(RecordSite) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != equation.tag) continue;
        const parent = node.parent orelse return error.OrphanEquation;
        const owner = tree.nodes[parent].record.value;
        if (owner != .control_header or owner.control_header.id != rules.equation_id) return error.OrphanEquation;
        if (counts[parent] != 0) return error.DuplicateEquation;
        counts[parent] = 1;
        if (out.items.len >= options.max_equations) return error.LimitExceeded;
        try out.append(a, .{ .control_node = parent, .equation_node = index });
    }
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value == .control_header and node.record.value.control_header.id == rules.equation_id and counts[index] == 0)
            return error.MissingEquation;
    }
    return out.toOwnedSlice(a);
}

fn decode(tree: @import("../body/tree.zig").Tree, site: RecordSite, layout: equation.Layout) !Source {
    const p = try equation.Properties.parse(tree.nodes[site.equation_node].record.framing.payload, layout);
    return .{
        .control_node = site.control_node,
        .equation_node = site.equation_node,
        .attributes = p.attributes,
        .script = p.script,
        .font_size = p.font_size,
        .color = p.color,
        .baseline = p.baseline,
        .unknown = p.unknown,
        .version_info = p.version_info,
        .font_name = p.font_name,
        .extra = p.extra,
    };
}

/// layout은 호출자가 확정한다. 버전이나 길이로 폰트 필드를 추측하지 않는다.
/// raw가 유효한 동안만 반환 문자열을 사용할 수 있다. 배열은 a.free로 해제한다.
pub fn read(a: std.mem.Allocator, raw: []const u8, version: Version, layout: equation.Layout, options: Options) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, options.records);
    defer tree.deinit(a);
    const records = try collect(a, tree, options);
    defer a.free(records);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    var script_bytes: usize = 0;
    for (records) |site| {
        const p = try decode(tree, site, layout);
        if (p.script.len > options.max_script_bytes - script_bytes) return error.LimitExceeded;
        script_bytes += p.script.len;
        try out.append(a, p);
    }
    return out.toOwnedSlice(a);
}

/// 선택한 레코드만 디코딩한다. 다른 수식의 불명 배치를 추측하지 않는다.
pub fn readSelected(a: std.mem.Allocator, raw: []const u8, version: Version, equation_node: usize, layout: equation.Layout, options: Options) !Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, options.records);
    defer tree.deinit(a);
    const records = try collect(a, tree, options);
    defer a.free(records);
    for (records) |site| {
        if (site.equation_node != equation_node) continue;
        const result = try decode(tree, site, layout);
        if (result.script.len > options.max_script_bytes) return error.LimitExceeded;
        return result;
    }
    return error.InvalidEquationNode;
}

/// 원문 control_links와 현재 모델의 연장 제어 순서를 한 번씩 대조한다.
/// 목록에서는 EQEDIT 스크립트 파서를 호출하지 않는다.
pub fn sites(a: std.mem.Allocator, raw: []const u8, version: Version, paragraphs: []const @import("../../model/document.zig").Paragraph, options: Options) ![]Site {
    var tree = try @import("source_tree.zig").parse(a, raw, version, options.records);
    defer tree.deinit(a);
    const records = try collect(a, tree, options);
    defer a.free(records);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var owners = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    var by_control: std.AutoHashMapUnmanaged(usize, RecordSite) = .empty;
    defer by_control.deinit(a);
    for (records) |site| try by_control.put(a, site.control_node, site);
    var spans: std.AutoHashMapUnmanaged(usize, struct { start: usize, end: usize }) = .empty;
    defer spans.deinit(a);
    for (links.items, 0..) |link, index| {
        const entry = try spans.getOrPut(a, link.paragraph_node);
        if (!entry.found_existing) entry.value_ptr.* = .{ .start = index, .end = index };
        entry.value_ptr.end = index + 1;
    }
    var out: std.ArrayList(Site) = .empty;
    errdefer out.deinit(a);
    for (paragraphs, 0..) |paragraph, current_index| {
        const source = paragraph.source_node orelse continue;
        const span = spans.get(source) orelse continue;
        const current_parent: ?usize = if (paragraph.parent_node) |node| node else null;
        if (owners.get(source) != current_index or current_parent != tree.nodes[source].parent) return error.SourceBindingMismatch;
        var next = span.start;
        for (paragraph.tokens) |token| {
            if (token.encoding != .utf16le) return error.SourceBindingMismatch;
            var iterator = try @import("../body/text.zig").Iterator.init(token.raw);
            while (try iterator.next()) |part| {
                if (part.value != .control or part.value.control.kind != .extended) continue;
                if (next >= span.end) return error.MissingControlHeader;
                const link = links.items[next];
                next += 1;
                var reader: @import("../../binary/reader.zig").Reader = .{ .bytes = part.value.control.data };
                if (part.value.control.code != link.code or try reader.readInt(u32) != link.id) return error.SourceBindingMismatch;
                if (by_control.get(link.control_node)) |site| {
                    if (link.code != 11 or link.header_id != rules.equation_id) return error.UnsupportedEquationAnchor;
                    const unit = try std.math.add(usize, token.start_unit, part.start_unit);
                    try out.append(a, .{
                        .control_node = site.control_node,
                        .equation_node = site.equation_node,
                        .paragraph_node = source,
                        .paragraph = current_index,
                        .source_unit = link.start_unit,
                        .current_unit = std.math.cast(u32, unit) orelse return error.LimitExceeded,
                    });
                }
            }
        }
        if (next != span.end) return error.MissingCurrentControlAnchor;
    }
    if (out.items.len != records.len) return error.MissingCurrentEquationAnchor;
    return out.toOwnedSlice(a);
}
