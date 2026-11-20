//! A chosen new-output profile, not a guess while parsing existing documents.
//! Approved latex.hwp SHA4f92f770... has20 EQEDIT records with this exact tail.
//! The extra word's SEMANTICS are absent from official revision1.3 table105.
//! Its zero value is an explicit raw-observed construction choice, not a
//! normative reserved-field claim or a promise of Hancom interoperability.
pub const Profile = enum { observed_eq60_hyhwpEQ_zero_word };
pub const Tail = struct {
    observed_word: u16,
    version: []const u8,
    font: []const u8,
};
pub fn tail(profile: Profile) Tail {
    return switch (profile) {
        .observed_eq60_hyhwpEQ_zero_word => .{ .observed_word = 0, .version = "Equation Version 60", .font = "HYhwpEQ" },
    };
}
