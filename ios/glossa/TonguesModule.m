#import "TonguesModule.h"
#import <React/RCTLog.h>

@implementation TonguesModule

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents {
  return @[@"openEpubFile"];
}

- (void)sendOpenEpubFileEvent:(NSString *)filePath {
  [self sendEventWithName:@"openEpubFile" body:@{@"uri": filePath}];
}

// Method accessible from JavaScript
RCT_EXPORT_METHOD(checkPendingFiles:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // Just resolve with empty object (implementation for API compatibility with Android)
  resolve(@{@"status": @"ok"});
}

@end