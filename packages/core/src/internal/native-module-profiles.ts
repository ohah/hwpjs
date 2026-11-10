// Explicitly verified content profiles. Environment values and ABI exports never register a module.
import type { NativeModuleContract } from './native-runtime-origin.ts';
type Profile = Readonly<{ contract: NativeModuleContract; ownerWindow: boolean }>;
const profiles = new Map<string, Profile>(
  (
    [
      ['8e0ff0d0e80f185f255024cb9d946b0469648fd5eb175ef6c7aa3562124c91ff', false],
      ['a38f4df7993c8f645fd28fd13df0108f9be4ba5ca55736e76e334d7d8968343f', false],
      ['d849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb', true],
      ['bd095cdf56892d5b5708a567ca91ae271846a3949bfc41c3a717bdee6513684f', true],
      ['ede6256ef063765cfb1f4489d2bece3a971aa715041c993fec87d4eb374855fa', true],
      ['25998a7513b73938abe5e9e614a18733059b42f71f00b13cf663f073c26396b3', true],
      ['f25c1a4807f428a8a392e8ef0be6dadced309825a6a9704305694969fd9c40bb', true],
      ['4b7fd814e32a03ea88f6adcd4ef8458be344dfc8a94a698b29e21df0b255d34a', true],
      ['aa4161ae261a37cff5cfe05ba78d7e9d8ad236c1999ddf5d978ac6b1a60bf122', true],
      ['c14f11aaa9a278298f469d1dec9bfbdba2e33f1a0433925f2c0b073866e6de02', true],
      ['82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc', true],
      ['fee47642df3a3626d3b37662e13d4130b02f44e1b86843b207ab6d64b99f3ab6', true],
    ] as const
  ).map(
    ([sha256, ownerWindow]) =>
      [
        sha256,
        Object.freeze({
          contract: Object.freeze({ contract: 'hwp5-exclusive-text-delta-v1' as const, sha256 }),
          ownerWindow,
        }),
      ] as const,
  ),
);
export function verifiedNativeContract(sha256: string): NativeModuleContract | undefined {
  return profiles.get(sha256)?.contract;
}
export function verifiedOwnerWindowProfile(sha256: string): boolean {
  return profiles.get(sha256)?.ownerWindow === true;
}
