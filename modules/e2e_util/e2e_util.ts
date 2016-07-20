/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
const yargs = require('yargs');
import * as webdriver from 'selenium-webdriver';

let cmdArgs: {'bundles': boolean};

declare var browser: any;
declare var expect: any;

export function readCommandLine(extraOptions?: {[key: string]: any}) {
  const options: {[key: string]: any} = {
    'bundles': {describe: 'Whether to use the angular bundles or not.', default: false}
  };
  for (var key in extraOptions) {
    options[key] = extraOptions[key];
  }

  cmdArgs = yargs.usage('Angular e2e test options.').options(options).help('ng-help').wrap(40).argv;
  return cmdArgs;
}

export function openBrowser(config: {
  url: string,
  params?: {name: string, value: any}[],
  ignoreBrowserSynchronization?: boolean
}) {
  if (config.ignoreBrowserSynchronization) {
    browser.ignoreSynchronization = true;
  }
  var params = config.params || [];
  if (!params.some((param) => param.name === 'bundles')) {
    params = params.concat([{name: 'bundles', value: cmdArgs.bundles}]);
  }

  var urlParams: string[] = [];
  params.forEach((param) => { urlParams.push(param.name + '=' + param.value); });
  var url = encodeURI(config.url + '?' + urlParams.join('&'));
  browser.get(url);
  if (config.ignoreBrowserSynchronization) {
    browser.sleep(500);
  }
}

/**
 * @experimental This API will be moved to Protractor.
 */
export function verifyNoBrowserErrors() {
  return true;
}
