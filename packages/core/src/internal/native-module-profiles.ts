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
      ['e2e0333e3e703328a970126aab88e9d2a302a7fb1897e6822cc15b727f4684cc', true],
      ['28d2f91917e81d0522ffe04d6ddff150aee2ad815a9ed1ed6d470af905aaacca', true],
      ['202fc55283b670ea7c695ef3a326a0e6b8c86af3def7232c8e5bfab003699389', true],
      ['438044e0060fb0f40ab8a4a76eee2027e387f68579d547487fcd74ca88129088', true],
      ['72dadc5054047db9af10bf2eff69ea186804d4451644ba9cba7ad9abd3c87d74', true],
      ['e140d7ec8388c4bc21440c6fd42c4de833da88d885e118ce82233b9fa18d2447', true],
      ['a5242be8ce0118a22bb9d48fbca4149043e9e21142008deee85ae4503043184f', true],
      ['d3369b3b66d9b40d1ec7ea59c29f1e2cca6046adac0d2057b1e5c4517814e8e6', true],
      ['475af44280d71edc715be1c210c97701dd4dad049e74adaebf8dadb091b1876e', true],
      ['0100f86340c05f3d420f011424bf063f02e5d106bd71a388f4a1cba6fd0c001d', true],
      ['376634c3d1b827388d35bba1d068f054df76ead49dd150e1d2cd7a6c512340f4', true],
      ['2740293adc4c88ce146a4e41b27bb68d14fdefafd683c9ae5b268b0a92012b22', true],
      ['833583d35a92daac3c0cc05837109467242e2b4ae888ee1d7123bf398d9b054f', true],
      ['fdb8f5e83b77ec87812a0817c1c775be9b2f69653c9af0fe9a530703c1a6f544', true],
      ['be4d67ea99f3705ee9776f4f4b6094c73e7dcd55b01fbe58da3fa44996be0890', true],
      ['783a97faea07376fd68ca5ccc61fff38703ccb314b6034f9277cd6b4a80f889f', true],
      ['3e9c4e2f7ad34e857838eea82e6c98e8245c7c49fa417a496fff231f5ca1cd15', true],
      ['89b38f8b4717179053cbe8802c79fdd61142165ebf777c38fb2167e5b3655e21', true],
      ['585c80637a1cad6edecb503fe4b3fa1694d2d2ef4610ee6cbcb3b21728d0c5c6', true],
      ['c203495cffc98226f58b4d8d7fbc137049e31e8a55735f28b7a51fe569a7a1f9', true],
      ['79c54bc10f45cc6b647237a88e6ca82f52d951959217d14431f09bdd5477d470', true],
      ['a3be6777229dbe1ec895f4850168809f70d9cf52b14b85996a670a5577e865f1', true],
      ['5ece4c0a551716239c37af0e1ff40db7b2a642e1baf75bb27782bcf237bd1621', true],
      ['afd903edc5658543b768491efb6ee6fbdbe185a8f393334a363acbd2eb5510ae', true],
      ['8ab4d335f7fba4aa764ed3e1191c390f17ee80f053b9ada89748a490547d1980', true],
      ['50f1038dd81d87ea848cb160cf3d3759a788fe00235c99a04a95260f25199fb7', true],
      ['3723d2fe39a73dedd1f994c6c4cff8e8f75014761df8f0561a3be6a8362957dc', true],
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
