//! Fresh canonical v3 CFB, never normalized from an existing document.
const std = @import("std");
pub fn create(a: std.mem.Allocator, xml: []const u8) ![]u8 {
    const limit = @import("chart_create_data.zig").max_xml_bytes;
    if (xml.len == 0 or xml.len > limit) return error.LimitExceeded;
    const cfb = try @import("../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "OOXMLChartContents", .parent = 0, .content = xml },
    }, .{ .limits = .{ .max_input_bytes = 2 * limit, .max_stream_bytes = limit } });
    defer a.free(cfb);
    const size = std.math.cast(u32, cfb.len) orelse return error.LimitExceeded;
    const output = try a.alloc(u8, try std.math.add(usize, cfb.len, 4));
    errdefer a.free(output);
    std.mem.writeInt(u32, output[0..4], size, .little);
    @memcpy(output[4..], cfb);
    // Strict open is mandatory for new output; no observed-repair branch.
    var checked = try @import("../ole/container.zig").open(a, output, .observed_size_prefix, .{ .strict = true, .max_input_bytes = 2 * limit, .max_stream_bytes = limit });
    defer checked.deinit();
    const index = try checked.findExact("/OOXMLChartContents") orelse return error.ChartCreateVerificationFailed;
    if (checked.entries[index].kind != 2 or !std.mem.eql(u8, checked.entries[index].content, xml)) return error.ChartCreateVerificationFailed;
    return output;
}
