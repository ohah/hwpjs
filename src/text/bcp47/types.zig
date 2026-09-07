pub const Options = struct { max_bytes: usize = 4096, max_subtags: usize = 512 };
pub const Kind = enum(u8) { language, private_use, grandfathered };
/// Borrowed spelling and subtag groups. Registry and extension semantics are not checked.
pub const Report = struct {
    raw: []const u8,
    kind: Kind = .language,
    subtags: usize,
    language: []const u8 = "",
    extlangs: []const u8 = "",
    script: []const u8 = "",
    region: []const u8 = "",
    variants: []const u8 = "",
    extensions: []const u8 = "",
    private_use: []const u8 = "",
    extlang_count: usize = 0,
    variant_count: usize = 0,
    extension_count: usize = 0,
    private_count: usize = 0,
    registry_validated: bool = false,
};
