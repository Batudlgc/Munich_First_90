// Soru uzunluğu sınırları. src/index.ts'te DURAMAZ: Workers ana modülün her
// export'unu giriş noktası (handler/Durable Object) sayar ve düz bir sayı
// export'unda Worker açılmaz ("Incorrect type for map entry"). Uygulamadaki
// kopyası: src/lib/ask.ts.
export const MIN_QUESTION_LENGTH = 3;
export const MAX_QUESTION_LENGTH = 500;

// Ortak günlük token bütçesinin paylaşımı (denetim 28.10: 6-9 adres bütçeyi
// herkes için bitirebiliyordu). Bugün HEAVY_CALLER_QUESTIONS kadar soru sormuş
// bir adres bütçenin yalnız bu payına kadar harcayabilir; kalan pay o gün az
// soran adreslere ayrılır. Kişi başı sert tavan yerine bu: kampüs/mobil ağda
// aynı adresi paylaşan gerçek kullanıcılar bütçe doluncaya dek kesilmez.
export const HEAVY_CALLER_QUESTIONS = 5;
export const HEAVY_CALLER_BUDGET_SHARE = 0.7;
