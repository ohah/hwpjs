const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
// Two selected nullable TextFormats after an inline TextBlock. This probe is
// not a product Series parser; the intervening word is never treated as count.
pub const Prefix = struct {
    previous: @import("chart-series-label-prefix.zig").Prefix,
    wire: []u8,
    allocator: std.mem.Allocator,
    pub fn reader(self: *Prefix) *core.Reader {
        return self.previous.reader();
    }
    pub fn types(self: *Prefix) *core.hwp5.chart_type_table.Table {
        return self.previous.types();
    }
    pub fn objects(self: *Prefix) *core.hwp5.chart_object_table.Table {
        return self.previous.objects();
    }
    pub fn deinit(self: *Prefix) void {
        self.allocator.free(self.wire);
        self.previous.deinit();
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, bytes: []const u8, limit: usize) !Prefix {
    var prefix = try @import("chart-series-label-prefix.zig").read(a, bytes, limit);
    errdefer prefix.deinit();
    const block = try core.hwp5.chart_text_block.readNullableObservedWithObjects(prefix.reader(), prefix.types(), prefix.objects(), .{});
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, block.object_id);
    const body = try @import("chart-text-body-probe.zig").serializeNullableBlock(a, block, prefix.objects());
    defer a.free(body);
    try out.appendSlice(a, body);
    try int(a, &out, u32, try prefix.reader().readInt(u16));
    for (0..2) |_| {
        const f = try core.hwp5.chart_text_format.readNullableObservedV1(prefix.reader(), prefix.types(), prefix.objects(), 65535);
        inline for (.{ f.object_id, f.raw_word, @intFromBool(f.code != null), if (f.code) |s| s.object_id else 0xffffffff, if (f.code) |s| s.bytes.len else 0, if (f.code) |s| s.trailer else 0, @intFromBool(f.code_introduced), f.end, prefix.objects().entries.count(), prefix.objects().string_bytes }) |v| try int(a, &out, u32, @intCast(v));
        if (f.code) |s| try out.appendSlice(a, s.bytes);
    }
    try int(a, &out, u32, prefix.types().definitions.count());
    return .{ .previous = prefix, .wire = try out.toOwnedSlice(a), .allocator = a };
}
