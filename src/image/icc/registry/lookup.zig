const data = @import("data.zig");
pub const snapshot_sha256 = data.snapshot_sha256;
pub const Status = enum { unspecified, registered, not_found_in_snapshot, unresolved_snapshot };
/// Binary search over generator-validated strictly increasing keys.
pub fn contains(comptime T: type, keys: []const T, key: T) bool {
    var low: usize = 0;
    var high = keys.len;
    while (low < high) {
        const mid = low + (high - low) / 2;
        if (keys[mid] < key) low = mid + 1 else high = mid;
    }
    return low < keys.len and keys[low] == key;
}
fn single(keys: []const u32, complete: bool, key: u32) Status {
    if (key == 0) return .unspecified;
    if (contains(u32, keys, key)) return .registered;
    return if (complete) .not_found_in_snapshot else .unresolved_snapshot;
}
pub fn cmm(key: u32) Status {
    return single(&data.cmm, data.cmm_complete, key);
}
pub fn manufacturer(key: u32) Status {
    return single(&data.manufacturer, data.manufacturer_complete, key);
}
pub fn device(parent: u32, key: u32) Status {
    if (key == 0) return .unspecified;
    if (parent == 0) return .unresolved_snapshot;
    const combined = (@as(u64, parent) << 32) | key;
    if (contains(u64, &data.device, combined)) return .registered;
    return if (data.device_complete) .not_found_in_snapshot else .unresolved_snapshot;
}
