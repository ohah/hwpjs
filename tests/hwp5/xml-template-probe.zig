const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    var input: core.hwp5.xml_template.Input = .{};
    inline for (.{ "schema_name", "schema", "instance" }) |field| {
        const size = try r.readInt(u32);
        if (size != 0xffffffff) @field(input, field) = try r.take(size);
    }
    if (r.offset != bytes.len) return error.ExtraTemplateProbeInput;
    const parsed = try core.hwp5.xml_template.Template.parse(input, limit);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(parsed.total_bytes));
    try int(a, &out, u32, @intCast(parsed.trailing_bytes));
    inline for (.{ "schema_name", "schema", "instance" }) |field| {
        if (@field(parsed, field)) |s| {
            try int(a, &out, u32, @intCast(4 + s.value.len + s.extra.len));
            try int(a, &out, u32, @intCast(s.value.len / 2));
            try out.appendSlice(a, s.value);
            try out.appendSlice(a, s.extra);
        } else try int(a, &out, u32, 0xffffffff);
    }
    return out.toOwnedSlice(a);
}
