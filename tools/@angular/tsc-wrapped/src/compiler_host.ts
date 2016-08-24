import {writeFileSync} from 'fs';
import * as path from 'path';
import * as tsickle from 'tsickle';
import * as ts from 'typescript';
import NgOptions from './options';
import {check, tsc} from './tsc';

import {MetadataCollector} from './collector';


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

export class TsickleHost extends DelegatingHost {
  // Additional diagnostics gathered by pre- and post-emit transformations.
  public diagnostics: ts.Diagnostic[] = [];
  private TSICKLE_SUPPORT = `
interface DecoratorInvocation {
  type: Function;
  args?: any[];
}
`;
  constructor(delegate: ts.CompilerHost, private program: ts.Program,
    private ngOptions: NgOptions) {
    super(delegate);

    let tsickleOutput: ts.Map<string> = {};
    if (ngOptions.googleClosureOutput) {
      for (let file of program.getSourceFiles()) {
        let fileName = file.fileName;
        if (!/\.d\.ts$/.test(fileName)) {
          let {output, externs, diagnostics} =
              tsickle.annotate(program, program.getSourceFile(fileName), {untyped:true});
          check(diagnostics);
          tsickleOutput[ts.sys.resolvePath(fileName)] = output;
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
            const converted = tsickle.convertDecorators(program.getTypeChecker(), program.getSourceFile(fileName));
            if (converted.diagnostics) {
              this.diagnostics.push(...converted.diagnostics);
            }
            newContent = converted.output + this.TSICKLE_SUPPORT;
          } catch (e) {
            console.error('Cannot convertDecorators on file', fileName);
            throw e;
          }

          return ts.createSourceFile(fileName, newContent, languageVersion, true);
        }
      };

  createSourceReplacingCompilerHost = (substituteSource: ts.Map<string>): ts.CompilerHost => {
    let getSourceFile = (
        fileName: string, languageVersion: ts.ScriptTarget,
        onError?: (message: string) => void): ts.SourceFile => {
      if (fileName in substituteSource) {
        return ts.createSourceFile(fileName, substituteSource[fileName], languageVersion);
      }
      return this.delegate.getSourceFile(fileName, languageVersion, onError);
    }

    return {
      getSourceFile: getSourceFile,
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
  static pathToGoogModuleName(context:string, importPath:string) {
    importPath = importPath.replace(/\.js$/, '');
    if (importPath[0] == '.') {
      // './foo' or '../foo'.
      // Resolve the path against the dirname of the current module.
      importPath = path.join(path.dirname(context), importPath);
    }
    const dist = /dist\/packages-dist\/([^\/]+)\/esm\/(.*)/;
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
          const {output, referencedModules} = tsickle.convertCommonJsToGoogModule(
            path.relative(this.delegate.getCurrentDirectory(), fileName), data, TsickleHost.pathToGoogModuleName);
          toWrite = output;
        }
        return this.delegate.writeFile(fileName, toWrite, writeByteOrderMark, onError, sourceFiles);
      };
}

const IGNORED_FILES = /\.ngfactory\.js$|\.css\.js$|\.css\.shim\.js$/;

export class MetadataWriterHost extends DelegatingHost {
  private metadataCollector = new MetadataCollector();
  constructor(
      delegate: ts.CompilerHost, private program: ts.Program, private ngOptions: NgOptions) {
    super(delegate);
  }

  private writeMetadata(emitFilePath: string, sourceFile: ts.SourceFile) {
    // TODO: replace with DTS filePath when https://github.com/Microsoft/TypeScript/pull/8412 is
    // released
    if (/*DTS*/ /\.js$/.test(emitFilePath)) {
      const path = emitFilePath.replace(/*DTS*/ /\.js$/, '.metadata.json');
      const metadata =
          this.metadataCollector.getMetadata(sourceFile, !!this.ngOptions.strictMetadataEmit);
      if (metadata && metadata.metadata) {
        const metadataText = JSON.stringify(metadata);
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
      };
}
