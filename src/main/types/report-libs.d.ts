declare module 'arabic-persian-reshaper' {
  export const PersianShaper: {
    convertArabic: (text: string) => string;
  };
  export const ArabicShaper: {
    convertArabic: (text: string) => string;
  };
  const reshaper: {
    PersianShaper: typeof PersianShaper;
    ArabicShaper: typeof ArabicShaper;
  };
  export default reshaper;
}

declare module 'bidi-js' {
  export interface BidiEmbeddingLevels {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  }

  export interface BidiEngine {
    getEmbeddingLevels(text: string, explicitDirection?: 'ltr' | 'rtl'): BidiEmbeddingLevels;
    getReorderSegments(
      text: string,
      embeddingLevels: BidiEmbeddingLevels,
      start?: number,
      end?: number,
    ): Array<[number, number]>;
    getMirroredCharacter(character: string): string | null;
  }

  export default function bidiFactory(): BidiEngine;
}
