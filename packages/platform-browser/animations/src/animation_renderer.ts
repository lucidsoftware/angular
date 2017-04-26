/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Injectable, NgZone, Renderer2, RendererFactory2, RendererStyleFlags2, RendererType2} from '@angular/core';

@Injectable()
export class AnimationRendererFactory implements RendererFactory2 {
  private _currentId: number = 0;
  private _microtaskId: number = 1;
  private _animationCallbacksBuffer: [(e: any) => any, any][] = [];
  private _rendererCache = new Map<Renderer2, BaseAnimationRenderer>();

  constructor(
      private delegate: RendererFactory2, private engine: any, private _zone: NgZone) {
    engine.onRemovalComplete = (element: any, delegate: Renderer2) => {
      // Note: if an component element has a leave animation, and the component
      // a host leave animation, the view engine will call `removeChild` for the parent
      // component renderer as well as for the child component renderer.
      // Therefore, we need to check if we already removed the element.
      if (delegate && delegate.parentNode(element)) {
        delegate.removeChild(element.parentNode, element);
      }
    };
  }

  createRenderer(hostElement: any, type: RendererType2): Renderer2 {
    const EMPTY_NAMESPACE_ID = '';

    // cache the delegates to find out which cached delegate can
    // be used by which cached renderer
    const delegate = this.delegate.createRenderer(hostElement, type);
    if (!hostElement || !type || !type.data || !type.data['animation']) {
      let renderer: BaseAnimationRenderer|undefined = this._rendererCache.get(delegate);
      if (!renderer) {
        renderer = new BaseAnimationRenderer(EMPTY_NAMESPACE_ID, delegate, this.engine);
        // only cache this result when the base renderer is used
        this._rendererCache.set(delegate, renderer);
      }
      return renderer;
    }

    const componentId = type.id;
    const namespaceId = type.id + '-' + this._currentId;
    this._currentId++;

    this.engine.register(namespaceId, hostElement);
    const animationTriggers = type.data['animation'] as any[];
    animationTriggers.forEach(
        trigger => this.engine.registerTrigger(
            componentId, namespaceId, hostElement, trigger.name, trigger));
    return new AnimationRenderer(this, namespaceId, delegate, this.engine);
  }

  begin() {
    if (this.delegate.begin) {
      this.delegate.begin();
    }
  }

  private _scheduleCountTask() {
    Zone.current.scheduleMicroTask('incremenet the animation microtask', () => this._microtaskId++);
  }

  /* @internal */
  scheduleListenerCallback(count: number, fn: (e: any) => any, data: any) {
    if (count >= 0 && count < this._microtaskId) {
      this._zone.run(() => fn(data));
      return;
    }

    if (this._animationCallbacksBuffer.length == 0) {
      Promise.resolve(null).then(() => {
        this._zone.run(() => {
          this._animationCallbacksBuffer.forEach(tuple => {
            const [fn, data] = tuple;
            fn(data);
          });
          this._animationCallbacksBuffer = [];
        });
      });
    }

    this._animationCallbacksBuffer.push([fn, data]);
  }

  end() {
    this._zone.runOutsideAngular(() => {
      this._scheduleCountTask();
      this.engine.flush(this._microtaskId);
    });
    if (this.delegate.end) {
      this.delegate.end();
    }
  }

  whenRenderingDone(): Promise<any> { return this.engine.whenRenderingDone(); }
}

export class BaseAnimationRenderer implements Renderer2 {
  constructor(
      protected namespaceId: string, public delegate: Renderer2, public engine: any) {
    this.destroyNode = this.delegate.destroyNode ? (n) => delegate.destroyNode !(n) : null;
  }

  get data() { return this.delegate.data; }

  destroyNode: ((n: any) => void)|null;

  destroy(): void {
    this.engine.destroy(this.namespaceId, this.delegate);
    this.delegate.destroy();
  }

  createElement(name: string, namespace?: string|null|undefined) {
    return this.delegate.createElement(name, namespace);
  }

  createComment(value: string) { return this.delegate.createComment(value); }

  createText(value: string) { return this.delegate.createText(value); }

  appendChild(parent: any, newChild: any): void {
    this.delegate.appendChild(parent, newChild);
    this.engine.onInsert(this.namespaceId, newChild, parent, false);
  }

  insertBefore(parent: any, newChild: any, refChild: any): void {
    this.delegate.insertBefore(parent, newChild, refChild);
    this.engine.onInsert(this.namespaceId, newChild, parent, true);
  }

  removeChild(parent: any, oldChild: any): void {
    this.engine.onRemove(this.namespaceId, oldChild, this.delegate);
  }

  selectRootElement(selectorOrNode: any) { return this.delegate.selectRootElement(selectorOrNode); }

  parentNode(node: any) { return this.delegate.parentNode(node); }

  nextSibling(node: any) { return this.delegate.nextSibling(node); }

  setAttribute(el: any, name: string, value: string, namespace?: string|null|undefined): void {
    this.delegate.setAttribute(el, name, value, namespace);
  }

  removeAttribute(el: any, name: string, namespace?: string|null|undefined): void {
    this.delegate.removeAttribute(el, name, namespace);
  }

  addClass(el: any, name: string): void { this.delegate.addClass(el, name); }

  removeClass(el: any, name: string): void { this.delegate.removeClass(el, name); }

  setStyle(el: any, style: string, value: any, flags?: RendererStyleFlags2|undefined): void {
    this.delegate.setStyle(el, style, value, flags);
  }

  removeStyle(el: any, style: string, flags?: RendererStyleFlags2|undefined): void {
    this.delegate.removeStyle(el, style, flags);
  }

  setProperty(el: any, name: string, value: any): void {
    this.delegate.setProperty(el, name, value);
  }

  setValue(node: any, value: string): void { this.delegate.setValue(node, value); }

  listen(target: any, eventName: string, callback: (event: any) => boolean | void): () => void {
    return this.delegate.listen(target, eventName, callback);
  }
}

export class AnimationRenderer extends BaseAnimationRenderer implements Renderer2 {
  constructor(
      public factory: AnimationRendererFactory, namespaceId: string, delegate: Renderer2,
      engine: any) {
    super(namespaceId, delegate, engine);
    this.namespaceId = namespaceId;
  }

  setProperty(el: any, name: string, value: any): void {
    if (name.charAt(0) == '@') {
      name = name.substr(1);
      this.engine.setProperty(this.namespaceId, el, name, value);
    } else {
      this.delegate.setProperty(el, name, value);
    }
  }

  listen(target: 'window'|'document'|'body'|any, eventName: string, callback: (event: any) => any):
      () => void {
    if (eventName.charAt(0) == '@') {
      const element = resolveElementFromTarget(target);
      let name = eventName.substr(1);
      let phase = '';
      if (name.charAt(0) != '@') {  // transition-specific
        [name, phase] = parseTriggerCallbackName(name);
      }
      return this.engine.listen(this.namespaceId, element, name, phase, event => {
        const countId = (event as any)['_data'] || -1;
        this.factory.scheduleListenerCallback(countId, callback, event);
      });
    }
    return this.delegate.listen(target, eventName, callback);
  }
}

function resolveElementFromTarget(target: 'window' | 'document' | 'body' | any): any {
  switch (target) {
    case 'body':
      return document.body;
    case 'document':
      return document;
    case 'window':
      return window;
    default:
      return target;
  }
}

function parseTriggerCallbackName(triggerName: string) {
  const dotIndex = triggerName.indexOf('.');
  const trigger = triggerName.substring(0, dotIndex);
  const phase = triggerName.substr(dotIndex + 1);
  return [trigger, phase];
}
