#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>
#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>
#import <ReactCommon/RCTTurboModule.h>
#import "HwpCanvasHost.h"
#include <mutex>

// Opt-in Canvas module; legacy Context module remains unchanged.
static NSMapTable<NSString *,HwpNativeCanvas *> *Registry() { static NSMapTable *table;static dispatch_once_t once;dispatch_once(&once,^{table=[NSMapTable strongToWeakObjectsMapTable];});return table; }
@interface HwpRegisteredCanvas : HwpNativeCanvas
@property(nonatomic,copy) NSString *surfaceId;
@end
@implementation HwpRegisteredCanvas
- (void)setSurfaceId:(NSString *)value { @synchronized(Registry()) {if(_surfaceId&&[Registry() objectForKey:_surfaceId]==self)[Registry() removeObjectForKey:_surfaceId];_surfaceId=[value copy];if(_surfaceId.length)[Registry() setObject:self forKey:_surfaceId];} }
@end
@interface HwpNativeCanvasManager : RCTViewManager @end
@implementation HwpNativeCanvasManager
RCT_EXPORT_MODULE(HwpNativeCanvas)
- (UIView *)view {return [HwpRegisteredCanvas new];}
RCT_EXPORT_VIEW_PROPERTY(surfaceId,NSString)
@end
@interface HwpNativeCanvasData : NSObject <RCTBridgeModule,RCTTurboModule,RCTTurboModuleWithJSIBindings> @end
@implementation HwpNativeCanvasData { std::shared_ptr<std::atomic<bool>> _alive; }
RCT_EXPORT_MODULE(HwpNativeCanvasData)
+ (BOOL)requiresMainQueueSetup {return NO;}
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {return std::make_shared<facebook::react::TurboModule>("HwpNativeCanvasData",params.jsInvoker);}
- (void)installJSIBindingsWithRuntime:(facebook::jsi::Runtime &)runtime callInvoker:(const std::shared_ptr<facebook::react::CallInvoker> &)invoker {
 if(_alive)_alive->store(false);
 _alive=std::make_shared<std::atomic<bool>>(true);auto alive=_alive;
 runtime.global().setProperty(runtime,"__hwpNativeCanvasCreateHost",facebook::jsi::Function::createFromHostFunction(runtime,facebook::jsi::PropNameID::forAscii(runtime,"__hwpNativeCanvasCreateHost"),1,
  [invoker,alive](facebook::jsi::Runtime &rt,const facebook::jsi::Value &,const facebook::jsi::Value *args,size_t count)->facebook::jsi::Value{
   if(!alive->load()||count!=1||!args[0].isString())throw facebook::jsi::JSError(rt,"CanvasSurfaceIdRequired");auto name=args[0].asString(rt).utf8(rt);NSString *key=[[NSString alloc] initWithBytes:name.data() length:name.size() encoding:NSUTF8StringEncoding];
   HwpNativeCanvas *view;@synchronized(Registry()){view=[Registry() objectForKey:key];}if(!view)throw facebook::jsi::JSError(rt,"CanvasSurfaceNotMounted");
   // Geometry starts unavailable until the main queue reports actual UIView bounds.
   auto host=createHwpCanvasHost(rt,view,CGRectZero,[invoker](std::function<void(facebook::jsi::Runtime &)> callback){invoker->invokeAsync(std::move(callback));},alive);return host;
  }));
}
- (void)invalidate {if(_alive)_alive->store(false);}
- (void)dealloc {if(_alive)_alive->store(false);}
@end
