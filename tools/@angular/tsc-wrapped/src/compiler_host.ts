/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {writeFileSync} from 'fs';
import * as path from 'path';
import * as tsickle from 'tsickle';
import * as ts from 'typescript';
import NgOptions from './options';
import {check, tsc} from './tsc';

import {MetadataCollector} from './collector';
import {ModuleMetadata} from './schema';

export function formatDiagnostics(d: ts.Diagnostic[]): string {
  const host: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getNewLine: () => ts.sys.newLine,
    getCanonicalFileName: (f: string) => f
  };
  return ts.formatDiagnostics(d, host);
}

/**
 * Implementation of CompilerHost that forwards all methods to another instance.
 * Useful for partial implementations to override only methods they care about.
 */
export abstract class DelegatingHost implements ts.CompilerHost {
  constructor(protected delegate: ts.CompilerHost) {}
  getSourceFile =
      (fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void) =>
          this.delegate.getSourceFile(fileName, languageVersion, onError);

  getCancellationToken = () => this.delegate.getCancellationToken();
  getDefaultLibFileName = (options: ts.CompilerOptions) =>
      this.delegate.getDefaultLibFileName(options);
  getDefaultLibLocation = () => this.delegate.getDefaultLibLocation();
  writeFile: ts.WriteFileCallback = this.delegate.writeFile;
  getCurrentDirectory = () => this.delegate.getCurrentDirectory();
  getDirectories = (path: string): string[] =>
      (this.delegate as any).getDirectories?(this.delegate as any).getDirectories(path): [];
  getCanonicalFileName = (fileName: string) => this.delegate.getCanonicalFileName(fileName);
  useCaseSensitiveFileNames = () => this.delegate.useCaseSensitiveFileNames();
  getNewLine = () => this.delegate.getNewLine();
  fileExists = (fileName: string) => this.delegate.fileExists(fileName);
  readFile = (fileName: string) => this.delegate.readFile(fileName);
  trace = (s: string) => this.delegate.trace(s);
  directoryExists = (directoryName: string) => this.delegate.directoryExists(directoryName);
}

export class DecoratorDownlevelCompilerHost extends DelegatingHost {
  private ANNOTATION_SUPPORT = `
interface DecoratorInvocation {
  type: Function;
  args?: any[];
}
`;
  /** Error messages produced by tsickle, if any. */
  public diagnostics: ts.Diagnostic[] = [];

  constructor(delegate: ts.CompilerHost, private program: ts.Program,
    private ngOptions: NgOptions) {
    super(delegate);

    let tsickleOutput = new Map<string, string>();
    if (ngOptions.googleClosureOutput) {
      for (let file of program.getSourceFiles()) {
        let fileName = file.fileName;
        if (!/\.d\.ts$/.test(fileName)) {
          let {output, externs, diagnostics} =
              tsickle.annotate(program, program.getSourceFile(fileName), {untyped:true});
          check(diagnostics);
          tsickleOutput.set(ts.sys.resolvePath(fileName), output);
        }
      }
    }

    this.subsitutingHost = this.createSourceReplacingCompilerHost(tsickleOutput);
    this.substituteProgram = ts.createProgram(
      program.getRootFileNames(),
      program.getCompilerOptions(),
      this.subsitutingHost,
      program
    );
    try{
      tsc.typeCheck(this.subsitutingHost, this.substituteProgram);
    } catch(e) {}
  }

  private subsitutingHost: ts.CompilerHost;
  private substituteProgram: ts.Program;

  getSourceFile =
      (fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void) => {
        const originalContent = this.delegate.readFile(fileName);
        let newContent = originalContent;

        if (/\.d\.ts$/.test(fileName)) {
          return ts.createSourceFile(fileName, originalContent, languageVersion, true);
        } else {
          try {
            let program: ts.Program;
            if (this.ngOptions.googleClosureOutput) {
              program = this.substituteProgram;
            } else {
              program = this.program;
            }
            const converted = tsickle.convertDecorators(
                this.program.getTypeChecker(), this.program.getSourceFile(fileName));
            if (converted.diagnostics) {
              this.diagnostics.push(...converted.diagnostics);
            }
            newContent = converted.output + this.ANNOTATION_SUPPORT;
          } catch (e) {
            console.error('Cannot convertDecorators on file', fileName);
            throw e;
          }

          return ts.createSourceFile(fileName, newContent, languageVersion, true);
        }
      };

  createSourceReplacingCompilerHost = (substituteSource: Map<string, string>): ts.CompilerHost => {
    let getSourceFile = (
        fileName: string, languageVersion: ts.ScriptTarget,
        onError?: (message: string) => void): ts.SourceFile => {
      if (substituteSource.has(fileName)) {
        return ts.createSourceFile(fileName, substituteSource.get(fileName), languageVersion);
      }
      return this.delegate.getSourceFile(fileName, languageVersion, onError);
    }

    return {
      getSourceFile: getSourceFile,
      getDirectories: this.getDirectories,
      getCancellationToken: this.getCancellationToken,
      getDefaultLibFileName: this.getDefaultLibFileName,
      writeFile: this.writeFile,
      getCurrentDirectory: this.getCurrentDirectory,
      getCanonicalFileName: this.getCanonicalFileName,
      useCaseSensitiveFileNames: this.useCaseSensitiveFileNames,
      getNewLine: this.getNewLine,
      fileExists: this.fileExists,
      readFile: this.readFile,
      directoryExists: this.directoryExists,
    };
  }

  /**
   * Massages file names into valid goog.module names:
   * - resolves relative paths to the given context
   * - replace resolved module path with module name
   * - replaces '/' with '$' to have a flat name.
   * - replace first char if non-alpha
   * - replace subsequent non-alpha numeric chars
   */
  static pathToGoogModuleName(context:string, importPath:string): string {
    importPath = importPath.replace(/\.js$/, '');
    if (importPath[0] == '.') {
      // './foo' or '../foo'.
      // Resolve the path against the dirname of the current module.
      importPath = path.join(path.dirname(context), importPath);
    }
    const dist = /dist\/packages-closure\/([^\/]+)\/(.*)/;
    if (dist.test(importPath)) {
      importPath = importPath.replace(dist, (match:string, pkg:string, impt:string) => {
        return `@angular/${pkg}/${impt}`;
      }).replace(/\/index$/, '');
    }
    // Replace characters not supported by goog.module.
    let moduleName = importPath.replace(/\//g, '.')
      .replace(/^[^a-zA-Z_$]/, '_')
      .replace(/[^a-zA-Z0-9._$]/g, '_');
    return moduleName;
  }

  writeFile: ts.WriteFileCallback =
      (fileName: string, data: string, writeByteOrderMark: boolean,
       onError?: (message: string) => void, sourceFiles?: ts.SourceFile[]) => {
        let toWrite = data;
        if (/\.js$/.test(fileName) && this.ngOptions.googleClosureOutput) {
          const relativeFileName = path.relative(this.delegate.getCurrentDirectory(), fileName);
          const {output, referencedModules} = tsickle.processES5(relativeFileName, relativeFileName, data, DecoratorDownlevelCompilerHost.pathToGoogModuleName);
          toWrite = output;
        }
        return this.delegate.writeFile(fileName, toWrite, writeByteOrderMark, onError, sourceFiles);
      };
}

export class TsickleCompilerHost extends DelegatingHost {
  /** Error messages produced by tsickle, if any. */
  public diagnostics: ts.Diagnostic[] = [];

  constructor(
      delegate: ts.CompilerHost, private oldProgram: ts.Program, private options: NgOptions) {
    super(delegate);
  }

  getSourceFile =
      (fileName: string, languageVersion: ts.ScriptTarget, onError?: (message: string) => void) => {
        let sourceFile = this.oldProgram.getSourceFile(fileName);
        let isDefinitions = /\.d\.ts$/.test(fileName);
        // Don't tsickle-process any d.ts that isn't a compilation target;
        // this means we don't process e.g. lib.d.ts.
        if (isDefinitions) return sourceFile;

        let {output, externs, diagnostics} =
            tsickle.annotate(this.oldProgram, sourceFile, {untyped: true});
        this.diagnostics = diagnostics;
        return ts.createSourceFile(fileName, output, languageVersion, true);
      }
}

const IGNORED_FILES = /\.ngfactory\.js$|\.ngstyle\.js$/;

export class MetadataWriterHost extends DelegatingHost {
  private metadataCollector = new MetadataCollector({quotedNames: true});
  private metadataCollector1 = new MetadataCollector({version: 1});
  constructor(delegate: ts.CompilerHost, private ngOptions: NgOptions) { super(delegate); }

  private writeMetadata(emitFilePath: string, sourceFile: ts.SourceFile) {
    // TODO: replace with DTS filePath when https://github.com/Microsoft/TypeScript/pull/8412 is
    // released
    if (/*DTS*/ /\.js$/.test(emitFilePath)) {
      const path = emitFilePath.replace(/*DTS*/ /\.js$/, '.metadata.json');

      // Beginning with 2.1, TypeScript transforms the source tree before emitting it.
      // We need the original, unmodified, tree which might be several levels back
      // depending on the number of transforms performed. All SourceFile's prior to 2.1
      // will appear to be the original source since they didn't include an original field.
      let collectableFile = sourceFile;
      while ((collectableFile as any).original) {
        collectableFile = (collectableFile as any).original;
      }

      const metadata =
          this.metadataCollector.getMetadata(collectableFile, !!this.ngOptions.strictMetadataEmit);
      const metadata1 = this.metadataCollector1.getMetadata(collectableFile, false);
      const metadatas: ModuleMetadata[] = [metadata, metadata1].filter(e => !!e);
      if (metadatas.length) {
        const metadataText = JSON.stringify(metadatas);
        writeFileSync(path, metadataText, {encoding: 'utf-8'});
      }
    }
  }

  writeFile: ts.WriteFileCallback =
      (fileName: string, data: string, writeByteOrderMark: boolean,
       onError?: (message: string) => void, sourceFiles?: ts.SourceFile[]) => {
        if (/\.d\.ts$/.test(fileName)) {
          // Let the original file be written first; this takes care of creating parent directories
          this.delegate.writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles);

          // TODO: remove this early return after https://github.com/Microsoft/TypeScript/pull/8412
          // is
          // released
          return;
        }

        if (IGNORED_FILES.test(fileName)) {
          return;
        }

        if (!sourceFiles) {
          throw new Error(
              'Metadata emit requires the sourceFiles are passed to WriteFileCallback. ' +
              'Update to TypeScript ^1.9.0-dev');
        }
        if (sourceFiles.length > 1) {
          throw new Error('Bundled emit with --out is not supported');
        }
        this.writeMetadata(fileName, sourceFiles[0]);
      }
}
