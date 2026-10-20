import { describe, expect, it } from 'vitest';

import { CHANNELS, parseChannel } from '@/lib/channels';

describe('parseChannel', () => {
  it.each(CHANNELS)('izinli etiket %s kabul edilir', (channel) => {
    expect(parseChannel(channel)).toBe(channel);
  });

  it('büyük harf ve boşluk normalleştirilir', () => {
    expect(parseChannel('TR-WA')).toBe('tr-wa');
    expect(parseChannel(' qr ')).toBe('qr');
  });

  it.each([['bilinmeyen', 'whatsapp'], ['boş', ''], ['sayı', 5], ['null', null], ['nesne', {}], ['kısmi', 'tr-'], ['enjeksiyon', 'tr-wa<script>']])(
    '%s etiket yok sayılır',
    (_name, value) => {
      expect(parseChannel(value)).toBeNull();
    },
  );

  it('liste tekrarsız ve küçük harfli', () => {
    expect(new Set(CHANNELS).size).toBe(CHANNELS.length);
    for (const channel of CHANNELS) expect(channel).toBe(channel.toLowerCase());
  });
});
