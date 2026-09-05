const state = @import("cfb.zig");
export fn cfb_sector_count() usize {
    return if (state.get()) |file| file.sectorCount() else 0;
}
// ID -1 is the complete header sector; nonnegative IDs are raw sectors.
fn raw(id: i32) []const u8 {
    const file = state.get() orelse return "";
    if (id == -1) return file.rawHeader();
    if (id < 0) return "";
    return file.rawSector(@intCast(id)) catch "";
}
export fn cfb_raw_ptr(id: i32) [*]const u8 {
    return raw(id).ptr;
}
export fn cfb_raw_len(id: i32) usize {
    return raw(id).len;
}
