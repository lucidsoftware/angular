/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Injectable, RendererFactory2, RendererType2, ViewEncapsulation} from '@angular/core';

import {AnimationRenderer} from './animation_renderer';

@Injectable()
export class BrowserAnimationBuilder {
  private _nextAnimationId = 0;
  private _renderer: AnimationRenderer;

  constructor(rootRenderer: RendererFactory2) {
    const typeData = {
      id: '0',
      encapsulation: ViewEncapsulation.None,
      styles: [],
      data: {animation: []}
    } as RendererType2;
    this._renderer = rootRenderer.createRenderer(document.body, typeData) as AnimationRenderer;
  }

  build(animation: any|any[]): any {
    const id = this._nextAnimationId.toString();
    this._nextAnimationId++;
    const entry = Array.isArray(animation) ? {type: 2, animation} : animation;
    issueAnimationCommand(this._renderer, null, id, 'register', [entry]);
    return new BrowserAnimationFactory(id, this._renderer);
  }
}

export class BrowserAnimationFactory {
  constructor(private _id: string, private _renderer: AnimationRenderer) {}

  create(element: any, options?: any): any {
    return new RendererAnimationPlayer(this._id, element, options || {}, this._renderer);
  }
}

export class RendererAnimationPlayer {
  public parentPlayer: any|null = null;
  private _started = false;

  constructor(
      public id: string, public element: any, options: any,
      private _renderer: AnimationRenderer) {
    this._command('create', options);
  }

  private _listen(eventName: string, callback: (event: any) => any): () => void {
    return this._renderer.listen(this.element, `@@${this.id}:${eventName}`, callback);
  }

  private _command(command: string, ...args: any[]) {
    return issueAnimationCommand(this._renderer, this.element, this.id, command, args);
  }

  onDone(fn: () => void): void { this._listen('done', fn); }

  onStart(fn: () => void): void { this._listen('start', fn); }

  onDestroy(fn: () => void): void { this._listen('destroy', fn); }

  init(): void { this._command('init'); }

  hasStarted(): boolean { return this._started; }

  play(): void {
    this._command('play');
    this._started = true;
  }

  pause(): void { this._command('pause'); }

  restart(): void { this._command('restart'); }

  finish(): void { this._command('finish'); }

  destroy(): void { this._command('destroy'); }

  reset(): void { this._command('reset'); }

  setPosition(p: number): void { this._command('setPosition', p); }

  getPosition(): number { return 0; }

  public totalTime = 0;
}

function issueAnimationCommand(
    renderer: AnimationRenderer, element: any, id: string, command: string, args: any[]): any {
  return renderer.setProperty(element, `@@${id}:${command}`, args);
}
