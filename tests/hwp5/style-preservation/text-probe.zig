const std = @import("std");
const edit = @import("hwpjs").hwp5.experimental_style_preservation;
pub fn main(init: std.process.Init) !void {
    const a = init.gpa;
    const args = try init.minimal.args.toSlice(init.arena.allocator());
    if (args.len != 10) return error.ExpectedInputOutputSectionParagraphStartEndTextRangesLayout;
    const input = try std.Io.Dir.cwd().readFileAlloc(init.io, args[1], a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    if (std.mem.eql(u8, args[8], "char-shape")) {
        try session.apply(.{ .set_character_format = .{
            .section = try std.fmt.parseInt(usize, args[3], 10),
            .paragraph = try std.fmt.parseInt(usize, args[4], 10),
            .start_unit = try std.fmt.parseInt(u32, args[5], 10),
            .end_unit = try std.fmt.parseInt(u32, args[6], 10),
            .char_shape_id = try std.fmt.parseInt(u32, args[7], 10),
        } });
    } else try session.apply(.{ .splice_text = .{
        .section = try std.fmt.parseInt(usize, args[3], 10),
        .paragraph = try std.fmt.parseInt(usize, args[4], 10),
        .start_unit = try std.fmt.parseInt(u32, args[5], 10),
        .end_unit = try std.fmt.parseInt(u32, args[6], 10),
        .utf8 = args[7],
        .range_policy = if (std.mem.eql(u8, args[8], "half-open")) .half_open else .reject,
    } });
    const saved = try session.save(a, .{ .allow_stale_layout = std.mem.eql(u8, args[9], "allow-stale-layout") });
    defer a.free(saved.bytes);
    try std.Io.Dir.cwd().writeFile(init.io, .{ .sub_path = args[2], .data = saved.bytes });
}
