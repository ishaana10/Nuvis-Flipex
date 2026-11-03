declare module 'page-flip' {
  export class PageFlip {
    constructor(element: HTMLElement, settings: Record<string, unknown>);
    loadFromImages(images: string[]): void;
    on(event: string, cb: (e: { data: unknown }) => void): this;
    flip(page: number): void;
    flipNext(): void;
    flipPrev(): void;
    destroy(): void;
    update(): void;
    getOrientation(): 'portrait' | 'landscape';
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getBoundsRect(): {
      left: number;
      top: number;
      width: number;
      height: number;
      pageWidth: number;
    };
  }
}
