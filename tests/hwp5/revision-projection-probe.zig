const std = @import("std");
const core = @import("hwpjs");
const Ranges = core.hwp5.body.Ranges;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const present = try r.readInt(u8);
    const missing_cr = try r.readInt(u8);
    if (present > 1 or missing_cr > 1) return error.InvalidMode;
    const units = try r.readInt(u32);
    const max_input = try r.readInt(u32);
    const max_output = try r.readInt(u32);
    const max_ranges = try r.readInt(u32);
    const length = try r.readInt(u32);
    if (present == 0 and length != 0) return error.InvalidMode;
    const text = try r.take(length);
    return core.hwp5.revision_projection.projectObserved(a, if (present == 1) text else null, units, try Ranges.parse(bytes[r.offset..]), .{ .max_input_bytes = max_input, .max_output_bytes = max_output, .max_ranges = max_ranges, .missing_text = if (missing_cr == 1) .observed_cr else .reject });
}
