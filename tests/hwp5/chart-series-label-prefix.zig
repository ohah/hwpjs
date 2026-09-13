const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
// Test-only first-Series assembly. Count is supplied by the independent caller,
// not inferred by a product array policy. Tail raw66 is not interpreted here.
pub const Prefix = struct {
    previous: @import("chart-post-line-prefix.zig").Prefix,
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
    var input: core.Reader = .{ .bytes = bytes };
    const max_objects = try input.readInt(u32);
    const count = try input.readInt(u32);
    if (count > 32) return error.LimitExceeded;
    var prefix = try @import("chart-post-line-prefix.zig").read(a, bytes[input.offset..], limit, max_objects);
    errdefer prefix.deinit();
    _ = try core.hwp5.chart_series_prefix.readObservedV2(prefix.reader(), prefix.types(), prefix.objects());
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, count);
    for (0..count) |_| {
        const p = try core.hwp5.chart_series_point.readObservedV1(prefix.reader(), prefix.types(), prefix.objects(), .{});
        try int(a, &out, u32, p.object_id);
        try int(a, &out, u32, @intCast(p.end));
        try out.appendSlice(a, &p.raw);
        try label(a, &out, p.label, prefix.objects());
    }
    _ = try prefix.reader().take(66);
    _ = try prefix.objects().readStringObservedV1(prefix.reader(), prefix.types(), 65535);
    const value = try core.hwp5.chart_series_label.readObservedV1(prefix.reader(), prefix.types(), prefix.objects(), .{});
    try label(a, &out, value, prefix.objects());
    try int(a, &out, u32, prefix.types().definitions.count());
    return .{ .previous = prefix, .wire = try out.toOwnedSlice(a), .allocator = a };
}
fn label(a: std.mem.Allocator, out: *std.ArrayList(u8), v: core.hwp5.chart_series_label.Label, objects: *const core.hwp5.chart_object_table.Table) !void {
    try int(a, out, u32, v.object_id);
    try int(a, out, u32, @intCast(v.end));
    const body = try @import("chart-text-body-probe.zig").serialize(a, v.body, objects);
    defer a.free(body);
    try out.appendSlice(a, body);
}
