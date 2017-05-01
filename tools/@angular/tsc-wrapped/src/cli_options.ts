/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
export class CliOptions {
  public basePath: string;
  public googModuleProjectName: string|null;
  public moduleIdBasePath: string|null;
  constructor({basePath = null, googModuleProjectName = null, moduleIdBasePath = null}: {basePath?: string, googModuleProjectName?: string, moduleIdBasePath?: string}) {
    this.basePath = basePath;
    this.googModuleProjectName = googModuleProjectName;
    this.moduleIdBasePath = moduleIdBasePath;
  }
}

export class I18nExtractionCliOptions extends CliOptions {
  i18nFormat: string|null;
  locale: string|null;
  outFile: string|null;

  constructor({i18nFormat = null, locale = null, outFile = null}: {
    i18nFormat?: string,
    locale?: string,
    outFile?: string,
  }) {
    super({});
    this.i18nFormat = i18nFormat;
    this.locale = locale;
    this.outFile = outFile;
  }
}

export class NgcCliOptions extends CliOptions {
  public i18nFormat: string;
  public i18nFile: string;
  public locale: string;
  public missingTranslation: string;

  constructor({i18nFormat = null, i18nFile = null, locale = null, missingTranslation = null,
               basePath = null, googModuleProjectName = null, moduleIdBasePath = null}: {
    i18nFormat?: string,
    i18nFile?: string,
    locale?: string,
    missingTranslation?: string,
    basePath?: string,
    googModuleProjectName?: string,
    moduleIdBasePath?: string
  }) {
    super({basePath: basePath, googModuleProjectName: googModuleProjectName, moduleIdBasePath: moduleIdBasePath});
    this.i18nFormat = i18nFormat;
    this.i18nFile = i18nFile;
    this.locale = locale;
    this.missingTranslation = missingTranslation;
  }
}
