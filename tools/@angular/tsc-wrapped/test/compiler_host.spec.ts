import {TsickleHost} from '../src/compiler_host';

describe('TsickleHost', () => {

  beforeEach(() => {
  });

  fit('should convert paths to goog.module names', () => {
    expect(TsickleHost.pathToGoogModuleName("some-file.ts", "dist/packages-dist/core/esm/place/testing")).toEqual("_angular$core$place$testing");
    expect(TsickleHost.pathToGoogModuleName("some-file.ts", "dist/packages-dist/core/esm/place/index")).toEqual("_angular$core$place");
    expect(TsickleHost.pathToGoogModuleName("some-file.ts", "dist/es6/AsyncSubject")).toEqual("rxjs$AsyncSubject");
    expect(TsickleHost.pathToGoogModuleName("some-file.ts", "./other_file")).toEqual("other__file");
    expect(TsickleHost.pathToGoogModuleName("", "./other_file")).toEqual("other__file");

  });
});