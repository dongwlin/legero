type ResizeObserverCallback = (
  entries: ResizeObserverEntry[],
  observer: ResizeObserver,
) => void

/**
 * jsdom has no layout engine. This observer supplies stable, non-zero
 * dimensions so react-window can render a real virtualized row in page
 * integration tests without replacing the list implementation.
 */
export class TestResizeObserver {
  static readonly width = 800
  static readonly height = 640

  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element) {
    queueMicrotask(() => {
      const entry = {
        target,
        contentRect: {
          width: TestResizeObserver.width,
          height: TestResizeObserver.height,
          top: 0,
          right: TestResizeObserver.width,
          bottom: TestResizeObserver.height,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        },
        borderBoxSize: [{ blockSize: TestResizeObserver.height, inlineSize: TestResizeObserver.width }],
        contentBoxSize: [{ blockSize: TestResizeObserver.height, inlineSize: TestResizeObserver.width }],
        devicePixelContentBoxSize: [],
      } as unknown as ResizeObserverEntry

      this.callback([entry], this as unknown as ResizeObserver)
    })
  }

  unobserve() {}

  disconnect() {}
}
