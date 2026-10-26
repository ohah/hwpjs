#import <React/RCTBridgeModule.h>
#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>
#import <React/RCTViewManager.h>
#import <ReactCommon/RCTTurboModule.h>
#include <ReactCommon/TurboModule.h>
#import <UIKit/UIKit.h>
#include "NativeCanvasContextJsi.h"

class HwpCanvasContextTurboModule final : public facebook::react::TurboModule {
 public:
  explicit HwpCanvasContextTurboModule(std::shared_ptr<facebook::react::CallInvoker> invoker)
    : TurboModule("HwpCanvasContext", std::move(invoker)) {
      methodMap_["install"] = MethodMetadata{0, [](facebook::jsi::Runtime &, facebook::react::TurboModule &, const facebook::jsi::Value *, size_t) -> facebook::jsi::Value { return facebook::jsi::Value(true); }};
  }
};
// Low-level Context integration: real RN executor and serialized native queue.
@interface HwpCanvasContextModule : NSObject <RCTBridgeModule, RCTTurboModule, RCTTurboModuleWithJSIBindings>
@end
@implementation HwpCanvasContextModule {
  std::shared_ptr<hwpjs::NativeRuntimeFence> _fence;
}
RCT_EXPORT_MODULE(HwpCanvasContext)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<HwpCanvasContextTurboModule>(params.jsInvoker);
}
- (void)installJSIBindingsWithRuntime:(facebook::jsi::Runtime &)runtime
                         callInvoker:(const std::shared_ptr<facebook::react::CallInvoker> &)invoker {
  if (_fence) _fence->invalidate();
  _fence = std::make_shared<hwpjs::NativeRuntimeFence>();
  auto fence = _fence;
  dispatch_queue_t queue = dispatch_queue_create("hwpjs.rn.context", DISPATCH_QUEUE_SERIAL);
  hwpjs::NativeContextSchedulers schedulers{
    [queue](std::function<void()> job) { dispatch_async(queue, ^{ job(); }); },
    [invoker, fence](std::function<void(facebook::jsi::Runtime &)> job) {
      invoker->invokeAsync([job = std::move(job), fence](facebook::jsi::Runtime &rt) { if (fence->active()) job(rt); });
    }
  };
  runtime.global().setProperty(runtime, "hwpNativeCanvasBinding", hwpjs::createNativeJsiCanvasBinding(runtime, schedulers, fence));
}

- (void)invalidate { if(_fence) _fence->invalidate(); }
- (void)dealloc { if(_fence) _fence->invalidate(); }
@end
