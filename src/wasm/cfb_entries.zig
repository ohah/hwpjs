const state = @import("cfb.zig");
const cfb = @import("../cfb/reader.zig");
fn entry(index: usize) ?*const cfb.Entry {
    if (state.get()) |file| {
        if (index < file.entries.len) return &file.entries[index];
    }
    return null;
}
// Field IDs: 0=name, 1=path, 2=content, 3=CLSID bytes.
fn field(index: usize, key: u32) []const u8 {
    const e = entry(index) orelse return "";
    return switch (key) {
        0 => e.name,
        1 => e.path,
        2 => e.content,
        3 => &e.clsid,
        else => "",
    };
}
export fn cfb_field_ptr(index: usize, key: u32) [*]const u8 {
    return field(index, key).ptr;
}
export fn cfb_field_len(index: usize, key: u32) usize {
    return field(index, key).len;
}
export fn cfb_value(index: usize, key: u32) u64 {
    const e = entry(index) orelse return 0;
    return switch (key) {
        0 => e.kind,
        1 => e.color,
        2 => e.left,
        3 => e.right,
        4 => e.child,
        5 => e.state,
        6 => e.created,
        7 => e.modified,
        8 => e.start,
        9 => e.size,
        else => 0,
    };
}
