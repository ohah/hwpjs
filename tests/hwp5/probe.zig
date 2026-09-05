//! Test-only WASM bridge; not the public product ABI.
const std = @import("std");
const core = @import("hwpjs");
const a = std.heap.wasm_allocator;
var output: []u8 = &.{};
var last_error: []const u8 = "";

export fn alloc(n: usize) ?[*]u8 {
    return (a.alloc(u8, @max(n, 1)) catch return null).ptr;
}
export fn free(ptr: [*]u8, n: usize) void {
    a.free(ptr[0..@max(n, 1)]);
}
export fn result_ptr() [*]const u8 {
    return output.ptr;
}
export fn result_len() usize {
    return output.len;
}
export fn error_ptr() [*]const u8 {
    return last_error.ptr;
}
export fn error_len() usize {
    return last_error.len;
}
export fn close() void {
    a.free(output);
    output = &.{};
}

fn run(mode: u32, bytes: []const u8, limit: usize) ![]u8 {
    switch (mode) {
        0 => {
            const h = try core.hwp5.Header.parse(bytes);
            const fields = [_]u32{ h.version().raw, h.flags(), h.licenseFlags(), h.encryptVersion(), h.country() };
            const out = try a.alloc(u8, fields.len * 4);
            for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
            return out;
        },
        1 => return core.raw_deflate.decode(a, bytes, limit),
        2 => {
            // Exercise wasm32 subtraction bounds even for a 0xffffffff wire size.
            var records = core.hwp5.record.Iterator.init(bytes, .{
                .max_records = limit,
                .max_payload_bytes = std.math.maxInt(usize),
            });
            var out: std.ArrayList(u8) = .empty;
            defer out.deinit(a);
            while (try records.next()) |r| {
                for ([_]u32{ r.tag, r.level, @intCast(r.offset), @intCast(r.raw.len), @intCast(r.payload.len) }) |v| {
                    var word: [4]u8 = undefined;
                    std.mem.writeInt(u32, &word, v, .little);
                    try out.appendSlice(a, &word);
                }
            }
            return out.toOwnedSlice(a);
        },
        3 => {
            if (bytes.len < 256) return error.InvalidHeaderSize;
            const h = try core.hwp5.Header.parse(bytes[0..256]);
            return core.hwp5.stream.decode(a, &h, bytes[256..], limit);
        },
        else => return error.InvalidMode,
    }
}
export fn probe(mode: u32, ptr: [*]const u8, len: usize, limit: usize) bool {
    close();
    last_error = "";
    output = run(mode, ptr[0..len], limit) catch |err| {
        last_error = @errorName(err);
        return false;
    };
    return true;
}
