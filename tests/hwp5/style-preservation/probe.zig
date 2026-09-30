const std = @import("std");
const edit = @import("hwpjs").hwp5.experimental_style_preservation;

pub fn main(init: std.process.Init) !void {
    const a = init.gpa;
    const args = try init.minimal.args.toSlice(init.arena.allocator());
    if (args.len != 7) return error.ExpectedInputOutputSectionParagraphStyleLayoutPermission;
    const input = try std.Io.Dir.cwd().readFileAlloc(init.io, args[1], a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    try session.apply(.{ .set_style = .{
        .section = try std.fmt.parseInt(usize, args[3], 10),
        .paragraph = try std.fmt.parseInt(usize, args[4], 10),
        .style_id = try std.fmt.parseInt(u8, args[5], 10),
    } });
    const saved = try session.save(a, .{ .allow_stale_layout = std.mem.eql(u8, args[6], "allow-stale-layout") });
    defer a.free(saved.bytes);
    try std.Io.Dir.cwd().writeFile(init.io, .{ .sub_path = args[2], .data = saved.bytes });
}
