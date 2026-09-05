//! Shared format invariants, not adapter-specific interpretation.
pub const mini_sector_shift = 6;
pub const mini_sector_size = 1 << mini_sector_shift;
pub const mini_stream_cutoff = 4096;

pub fn usesFat(size: u64) bool {
    return size >= mini_stream_cutoff;
}
