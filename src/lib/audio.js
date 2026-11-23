// Conversion d'un enregistrement du micro (WebM/Opus) en WAV mono 16 kHz,
// format lu de façon fiable par Gemini (environ 1,9 Mo par minute).
export async function toWav16k(blob) {
  const input = await blob.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const audio = await ctx.decodeAudioData(input); // décodé et rééchantillonné à 16 kHz
  const n = audio.length;
  const mono = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += data[i] / audio.numberOfChannels;
  }
  const buffer = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, mono[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return { data: new Uint8Array(buffer), seconds: audio.duration };
}
