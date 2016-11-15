/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript';
import NgOptions from '../src/options';
import {formatDiagnostics, TsickleCompilerHost} from '../src/compiler_host';
import {writeTempFile} from './test_support';
import {DecoratorDownlevelCompilerHost} from '../src/compiler_host';

describe('Compiler Host', () => {
  function makeProgram(fileName: string, source: string): [ts.Program, ts.CompilerHost, NgOptions] {
    let fn = writeTempFile(fileName, source);
    let opts: NgOptions = {
      target: ts.ScriptTarget.ES5,
      types: [],
      genDir: '/tmp',
      basePath: '/tmp',
      noEmit: true,
      googleClosureOutput: false,
    };

    // TsickleCompilerHost wants a ts.Program, which is the result of
    // parsing and typechecking the code before tsickle processing.
    // So we must create and run the entire stack of CompilerHost.
    let host = ts.createCompilerHost(opts);
    let program = ts.createProgram([fn], opts, host);
    // To get types resolved, you must first call getPreEmitDiagnostics.
    let diags = formatDiagnostics(ts.getPreEmitDiagnostics(program));
    expect(diags).toEqual('');

    return [program, host, opts];
  }

  it('inserts JSDoc annotations', () => {
    const [program, host, opts] = makeProgram('foo.ts', 'let x: number = 123');
    const tsickleHost = new TsickleCompilerHost(host, program, opts);
    const f = tsickleHost.getSourceFile(program.getRootFileNames()[0], ts.ScriptTarget.ES5);
    expect(f.text).toContain('/** @type {?} */');
  });

  it('reports diagnostics about existing JSDoc', () => {
    const [program, host, opts] =
        makeProgram('error.ts', '/** @param {string} x*/ function f(x: string){};');
    const tsickleHost = new TsickleCompilerHost(host, program, opts);
    const f = tsickleHost.getSourceFile(program.getRootFileNames()[0], ts.ScriptTarget.ES5);
    expect(formatDiagnostics(tsickleHost.diagnostics)).toContain('redundant with TypeScript types');
  });

  it('should convert paths to goog.module names', () => {
    expect(DecoratorDownlevelCompilerHost.pathToGoogModuleName("some-file.ts", "dist/packages-dist/core/esm/place/testing")).toEqual("_angular$core$place$testing");
    expect(DecoratorDownlevelCompilerHost.pathToGoogModuleName("some-file.ts", "dist/packages-dist/core/esm/place/index")).toEqual("_angular$core$place");
    expect(DecoratorDownlevelCompilerHost.pathToGoogModuleName("some-file.ts", "dist/es6/AsyncSubject")).toEqual("rxjs$AsyncSubject");
    expect(DecoratorDownlevelCompilerHost.pathToGoogModuleName("some-file.ts", "./other_file")).toEqual("other__file");
    expect(DecoratorDownlevelCompilerHost.pathToGoogModuleName("", "./other_file")).toEqual("other__file");
  });
});
