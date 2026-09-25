//! Shared format invariants, not adapter-specific interpretation.
pub const signature = [_]u8{ 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1 };
pub const root_name = "Root Entry";
pub const mini_sector_shift = 6;
pub const mini_sector_size = 1 << mini_sector_shift;
pub const mini_stream_cutoff = 4096;

pub fn usesFat(size: u64) bool {
    return size >= mini_stream_cutoff;
}
