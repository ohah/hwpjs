const std = @import("std");
const utf16 = @import("../../text/utf16.zig");
const View = @import("mluc.zig").View;
pub const Options = struct { max_unique_bytes: usize = 64 * 1024 * 1024, max_records: usize = 100000 };
pub const Report = struct {
    records: usize,
    unique_strings: usize,
    inspected_bytes: usize,
    scalars: u64 = 0,
    nul_scalars: u64 = 0,
    bom_scalars: u64 = 0,
    nul_terminated_records: usize = 0,
    locale_deferred: bool = true,
};
/// Complete UTF-16BE validation. Exact shared ranges are inspected only once;
/// partially overlapping strings must each be valid independently.
pub fn inspect(a: std.mem.Allocator, view: View, options: Options) !Report {
    if (view.count > options.max_records) return error.LimitExceeded;
    const Key = struct { offset: usize, length: usize };
    var seen = std.AutoHashMap(Key, utf16.Stats).init(a);
    defer seen.deinit();
    var r: Report = .{ .records = view.count, .unique_strings = 0, .inspected_bytes = 0 };
    for (0..view.count) |i| {
        const record = try view.at(i);
        const key: Key = .{ .offset = @intFromPtr(record.text.ptr) - @intFromPtr(view.data.ptr), .length = record.text.len };
        const entry = try seen.getOrPut(key);
        if (!entry.found_existing) {
            if (record.text.len > options.max_unique_bytes - r.inspected_bytes) return error.LimitExceeded;
            entry.value_ptr.* = try utf16.inspect(record.text, .big);
            r.inspected_bytes += record.text.len;
            r.unique_strings += 1;
        }
        const s = entry.value_ptr.*;
        r.scalars += s.scalars;
        r.nul_scalars += s.nul_scalars;
        r.bom_scalars += s.bom_scalars;
        r.nul_terminated_records += @intFromBool(s.ends_in_nul);
    }
    return r;
}
