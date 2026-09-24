// Test-only shard expectations from the independent Python ZIP/XML oracle.
// Keep shared census values here; the oracle remains an independent source.
pub const accepted = [_]usize{ 64, 68, 56, 49, 61, 59, 58, 61 };
pub const rejected_zip = [_]usize{ 1, 3, 0, 2, 0, 0, 0, 0 };
pub const encrypted = [_]usize{ 0, 0, 0, 0, 2, 0, 0, 0 };
pub const sections = [_]usize{ 75, 72, 72, 53, 64, 62, 63, 83 };
pub const paragraphs = [_]usize{ 28740, 20865, 20019, 11680, 44679, 24829, 23614, 40720 };
pub const begin_present = [_]usize{ 60, 64, 53, 48, 58, 57, 54, 61 };
