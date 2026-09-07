const std = @import("std");
const Tree = @import("form_property_tree.zig").Tree;
const schema = @import("form_schema.zig");
const Kind = @import("form_object.zig").Kind;
pub const State = enum(u32) { not_applicable, missing, unlimited, nonnegative, deferred };
pub const View = struct {
    state: State,
    /// Borrows the original property input, not the temporary Tree node array.
    raw: ?[]const u8 = null,
    /// Mathematical comparison only. The caller chooses its count/unit; this
    /// does not enforce an editing limit or assume a Unicode counting model.
    pub fn compareCount(self: View, count: u64) ?std.math.Order {
        if (self.state != .nonnegative) return null;
        const bytes = self.raw.?;
        var limit: u64 = 0;
        for (0..bytes.len / 2) |i| {
            const digit = std.mem.readInt(u16, bytes[i * 2 ..][0..2], .little) - '0';
            limit = std.math.mul(u64, limit, 10) catch return .lt;
            limit = std.math.add(u64, limit, digit) catch return .lt;
        }
        return std.math.order(count, limit);
    }
};
/// Same unchanged parsed Tree and schema for this kind. Decimal grammar is
/// already validated; no fixed-width range/default is inferred from `int`.
pub fn inspectObserved(tree: Tree, report: schema.Report, kind: Kind) View {
    if (kind != .edit) return .{ .state = .not_applicable };
    const p = report.get(tree, .max_length) orelse return .{ .state = .missing };
    if (std.mem.readInt(u16, p.value[0..2], .little) != '-') return .{ .state = .nonnegative, .raw = p.value };
    // Leading zeroes are kept in raw. Only the mathematical -1 sentinel is
    // interpreted; negative zero and all other negatives remain deferred.
    var offset: usize = 2;
    while (offset + 2 < p.value.len and std.mem.readInt(u16, p.value[offset..][0..2], .little) == '0') : (offset += 2) {}
    const unlimited = p.value.len - offset == 2 and std.mem.readInt(u16, p.value[offset..][0..2], .little) == '1';
    return .{ .state = if (unlimited) .unlimited else .deferred, .raw = p.value };
}
