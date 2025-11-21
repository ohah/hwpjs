const NativeModuleRegistry = {
  getEnforcing<T>(name: string): T {
    return null as unknown as T;
  },
};
/** TODO: Craby */
interface NativeModule {}

// Define your module interface
interface HwpReaderSpec extends NativeModule {
  readFile(path: string): Promise<string>;
}

// Get the native module
export default NativeModuleRegistry.getEnforcing<HwpReaderSpec>('HwpReader');

// Example usage (placeholder)
export const readHwpFile = async (path: string): Promise<string> => {
  const module = NativeModuleRegistry.getEnforcing<HwpReaderSpec>('HwpReader');
  return await module.readFile(path);
};
