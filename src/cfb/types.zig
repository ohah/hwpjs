pub const Options = struct {
    max_input_bytes: usize = 256 * 1024 * 1024,
    max_stream_bytes: usize = 256 * 1024 * 1024,
    max_total_stream_bytes: usize = 512 * 1024 * 1024,
    max_entries: usize = 1_000_000,
    max_path_bytes: usize = 64 * 1024 * 1024,
};

pub const Entry = struct {
    name: []const u8,
    path: []const u8 = "",
    kind: u8,
    color: u8,
    left: u32,
    right: u32,
    child: u32,
    clsid: [16]u8,
    state: u32,
    created: u64,
    modified: u64,
    start: u32,
    size: u64,
    content: []const u8 = "",
};
