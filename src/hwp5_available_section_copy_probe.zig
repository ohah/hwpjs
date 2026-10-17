//! Test-only CLI: emits a prepared copy to stdout, never overwrites its input.
const std = @import("std");

pub fn main(init: std.process.Init) !void {
    const a = init.gpa;
    const args = try init.minimal.args.toSlice(init.arena.allocator());
    if (args.len != 2) return error.ExpectedInput;
    const input = try std.Io.Dir.cwd().readFileAlloc(init.io, args[1], a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    const prepared = try @import("hwp5/edit/available_section_copy.zig").prepare(a, input);
    defer a.free(prepared.bytes);
    try std.Io.File.stdout().writeStreamingAll(init.io, prepared.bytes);
}
