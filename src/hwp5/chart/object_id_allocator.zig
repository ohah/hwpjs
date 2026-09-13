const Objects = @import("object_table.zig").Table;

/// Chooses the lowest valid object ID absent from the parsed object scope and
/// the caller's additional forbidden set. The null sentinel is never returned.
/// This function does not reserve the result; callers must serialize or
/// register it before choosing another ID from the same scope.
pub fn findLowestAvailable(objects: *const Objects, forbidden: []const u32) !u32 {
    var candidate: u32 = 0;
    while (candidate != 0xffffffff) : (candidate += 1) {
        if (objects.entries.contains(candidate)) continue;
        var blocked = false;
        for (forbidden) |id| {
            if (candidate == id) {
                blocked = true;
                break;
            }
        }
        if (!blocked) return candidate;
    }
    return error.NoAvailableChartObjectId;
}
