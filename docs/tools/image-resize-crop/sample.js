/* Sample for Image Resize and Crop Online (TOOLCHK3): a made-up landscape, drawn here and saved as a JPEG file in
   memory, then opened like a file you pick. No network. */
export async function makeSample() {
  const W = 2400, H = 1600, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, H * 0.62); g.addColorStop(0, '#3b6fb6'); g.addColorStop(0.7, '#9cc3e6'); g.addColorStop(1, '#f3d9b1');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(1750, 520, 20, 1750, 520, 260); g.addColorStop(0, 'rgba(255,244,214,1)'); g.addColorStop(0.35, 'rgba(255,226,160,.9)'); g.addColorStop(1, 'rgba(255,226,160,0)');
  x.fillStyle = g; x.fillRect(1400, 200, 700, 700);
  x.fillStyle = 'rgba(255,255,255,.75)';
  for (const [cx, cy, s] of [[420, 260, 1], [980, 180, 0.7], [1320, 330, 0.85]]) { x.beginPath(); for (const [dx, dy, r] of [[0, 0, 70], [70, -25, 85], [150, 0, 70], [75, 20, 75]]) x.arc(cx + dx * s * 1.6, cy + dy * s * 1.6, r * s * 1.6, 0, 7); x.fill(); }
  const hill = (y0, amp, f, ph, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, H); for (let i = 0; i <= W; i += 8) x.lineTo(i, y0 + Math.sin(i * f + ph) * amp + Math.sin(i * f * 2.7 + ph * 2) * amp * 0.35); x.lineTo(W, H); x.fill(); };
  hill(900, 90, 0.0021, 1.2, '#5f7f9b'); hill(1010, 70, 0.0032, 0.2, '#4f7d4a'); hill(1150, 55, 0.0045, 2.0, '#3f6b38');
  g = x.createLinearGradient(0, 1250, 0, H); g.addColorStop(0, '#5d8f3f'); g.addColorStop(1, '#2f5a25'); x.fillStyle = g; x.fillRect(0, 1250, W, H - 1250);
  x.fillStyle = '#efe6d2'; x.fillRect(600, 1060, 260, 170); x.fillStyle = '#9b3b2c'; x.beginPath(); x.moveTo(570, 1070); x.lineTo(730, 960); x.lineTo(890, 1070); x.fill();
  x.fillStyle = '#5a3a28'; x.fillRect(705, 1140, 50, 90); x.fillStyle = '#7fb0d8'; x.fillRect(630, 1100, 50, 40); x.fillRect(785, 1100, 50, 40);
  for (let i = 0; i < 26; i++) { const tx = 1000 + i * 52 + (i % 3) * 9, ty = 1180 + (i % 4) * 14; x.fillStyle = '#5a3d27'; x.fillRect(tx - 5, ty, 10, 40); x.fillStyle = i % 2 ? '#2e5e2a' : '#356b2f'; x.beginPath(); x.arc(tx, ty - 14, 30, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,.85)'; x.font = '600 44px system-ui, sans-serif'; x.fillText('Sample photo, 2400 × 1600', 60, H - 60);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
  return new File([blob], 'sample-landscape.jpg', { type: 'image/jpeg' });
}
