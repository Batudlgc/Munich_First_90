// Soru uzunluğu sınırları. src/index.ts'te DURAMAZ: Workers ana modülün her
// export'unu giriş noktası (handler/Durable Object) sayar ve düz bir sayı
// export'unda Worker açılmaz ("Incorrect type for map entry"). Uygulamadaki
// kopyası: src/lib/ask.ts.
export const MIN_QUESTION_LENGTH = 3;
export const MAX_QUESTION_LENGTH = 500;
