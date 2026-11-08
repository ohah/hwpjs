//! 아직 저장하지 않은 생성 표의 선택 제거 후보. 원본이나 다른 표를 되돌리지 않는다.
const std = @import("std");
const Values = @import("created_table_values.zig").Values;

pub fn prepare(a: std.mem.Allocator, original: *const Values, identity: u64) !Values {
    if (identity == 0) return error.InvalidCreatedTableIdentity;
    var selected: ?usize = null;
    for (original.entries.items, 0..) |entry, index| {
        if (entry.table.identity != identity) continue;
        if (selected != null) return error.AmbiguousTableDeletionIdentity;
        selected = index;
    }
    const index = selected orelse return error.MissingTableDeletionTarget;
    var owned: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer owned.deinit(a);
    for (original.entries.items[index].table.cells) |cell| try owned.put(a, cell.paragraph_id, {});
    for (original.entries.items, 0..) |entry, other| {
        if (other == index) continue;
        switch (entry.anchor.paragraph) {
            .generated_id => |id| if (owned.contains(id)) return error.UnsupportedTableDeletionReference,
            .source_ordinal => {},
        }
    }
    var candidate = try original.clone(a);
    const removed = candidate.entries.orderedRemove(index);
    var table = removed.table;
    table.deinit(a);
    return candidate;
}
