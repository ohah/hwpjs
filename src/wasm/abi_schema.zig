// Generated from js/abi-schema.mjs by tools/generate-abi.mjs. Do not edit.
pub const version: u32 = 5;
pub const Field = enum(u32) {
    name = 0,
    path = 1,
    content = 2,
    clsid = 3,
    _,
};
pub const Value = enum(u32) {
    kind = 0,
    color = 1,
    left = 2,
    right = 3,
    child = 4,
    state = 5,
    created = 6,
    modified = 7,
    start = 8,
    size = 9,
    uses_fat = 10,
    has_content = 11,
    _,
};
pub const document = struct {
    pub const header_bytes: usize = 8;
    pub const node_bytes: usize = 56;
    pub const parent: usize = 0;
    pub const kind: usize = 4;
    pub const name_len: usize = 8;
    pub const content_len: usize = 12;
    pub const state: usize = 16;
    pub const reserved: usize = 20;
    pub const created: usize = 24;
    pub const modified: usize = 32;
    pub const clsid: usize = 40;
};
