// React Flow measures the DOM, which jsdom doesn't lay out. These are the stubs React Flow's
// testing guide gives, installed only by tests that render a graph.

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this);
  }
  unobserve(): void {}
  disconnect(): void {}
}

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = /scale\(([\d.]+)\)/.exec(transform ?? "")?.[1];
    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

export function stubReactFlowDom(): void {
  globalThis.ResizeObserver = ResizeObserverStub;
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as never;
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return Number.parseFloat(this.style.height) || 1;
      },
    },
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return Number.parseFloat(this.style.width) || 1;
      },
    },
  });
  SVGGraphicsElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
}
