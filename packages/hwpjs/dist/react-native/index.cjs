let react_native = require("react-native");

//#region ../../node_modules/.bun/craby-modules@0.1.0-rc.3+0891b211bdee886f/node_modules/craby-modules/dist/index.mjs
/**
* Android JNI initialization workaround
*
* We need `filesDir` of `Context` for JNI initialization, but it's unavailable during `PackageList` construction.
* The context is only passed when React Native calls `BaseReactPackage.getModule()`.
*
* Workaround: Load a dummy module to trigger `getModule()` before the actual module.
*
* - 1. Request non-existent module → triggers `getModule()`
* - 2. `getModule()` receives `ReactApplicationContext`
*   - 2-1. Calls `nativeSetDataPath()` (C++ extern function) to set `context.filesDir.absolutePath`
*   - 2-2. Returns placeholder module (no-op) instance (Actual C++ TurboModule is now can be initialized with the required values)
*
* @param moduleName The name of the module to prepare.
*/
function prepareJNI(moduleName) {
	if (react_native.Platform.OS !== "android") return;
	react_native.TurboModuleRegistry.get(`__craby${moduleName}_JNI_prepare__`);
}
const NativeModuleRegistry = {
	get(moduleName) {
		prepareJNI(moduleName);
		return react_native.TurboModuleRegistry.get(moduleName);
	},
	getEnforcing(moduleName) {
		prepareJNI(moduleName);
		return react_native.TurboModuleRegistry.getEnforcing(moduleName);
	}
};

//#endregion
//#region src-reactnative/NativeReactNative.ts
var NativeReactNative_default = NativeModuleRegistry.getEnforcing("Hwpjs");

//#endregion
exports.Hwpjs = NativeReactNative_default;
//# sourceMappingURL=index.cjs.map