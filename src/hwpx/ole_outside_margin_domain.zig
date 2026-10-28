//! OLE 여백의 공식 모델 수치 영역과 기존 관측값을 구분합니다. 편집 권한이 아닙니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Domain = enum { absent, official_model_unsigned32, observed_signed32 };
pub const Report = struct {
    values: [4]?i64,
    domains: [4]Domain,
    lock: ?bool,
    size_protect: ?bool,
};
fn flag(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?bool {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try fields.boolean(a, raw, 4096);
}
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Report {
    if (@import("run_anchor.zig").kind(tree, node) != .ole) return error.InvalidOleDisplayNode;
    const margins = try @import("picture_flow_values.zig").readOutsideMargins(a, tree, node);
    var domains: [4]Domain = undefined;
    for (margins, 0..) |value, i| {
        domains[i] = if (value) |number| if (number < 0) .observed_signed32 else .official_model_unsigned32 else .absent;
    }
    var missing: usize = 0;
    var duplicate: usize = 0;
    const size = fields.uniqueChild(tree, node, "sz", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureGeometryChild;
    return .{
        .values = margins,
        .domains = domains,
        .lock = try flag(a, tree, node, "lock"),
        .size_protect = if (size) |child| try flag(a, tree, child, "protect") else null,
    };
}

/// 2024 규범 수치 영역 비교용 진단입니다. 2011 문서의 편집 허가가 아닙니다.
pub const LexicalDomain = enum { model_unsigned32, observed_signed32, nonnegative_exceeds_reader_u32, reader_rejected };
pub fn classifyLexical(raw: []const u8) !LexicalDomain {
    if (raw.len > 4096) return error.LimitExceeded;
    const xml = @import("xml_values.zig");
    if (xml.nonNegative(raw)) |_| {
        _ = xml.unsigned32(raw) catch return .nonnegative_exceeds_reader_u32;
        return .model_unsigned32;
    } else |_| {
        _ = xml.signedOrUnsigned32(raw) catch return .reader_rejected;
        return .observed_signed32;
    }
}
