// Inline SVG icons (Material-style paths). All use currentColor.
window.FIDS = window.FIDS || {};

(function (F) {
  const P = {
    plane: 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z',
    takeoff: 'M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49L21 11.49c.81-.23 1.28-1.05 1.07-1.85z',
    land: 'M2.5 19h19v2h-19v-2zm7.18-5.73l4.35 1.16 5.31 1.42c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2v8.28L5.15 8.95l-.93-2.32-1.45-.39v5.17l1.6.43 5.31 1.43z',
    clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.4 2-.9 1.5L11 13.2V7h2v5.4z',
    arrow: 'M4 11h12.2l-5.6-5.6L12 4l8 8-8 8-1.4-1.4 5.6-5.6H4z',
    wifi: 'M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z',
    power: 'M16 7V3h-2v4h-4V3H8v4h-.01C6.9 6.99 6 7.89 6 8.98v5.52L9.5 18v3h5v-3l3.5-3.51v-5.5c0-1.1-.9-2-2-2z',
    movie: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
    food: 'M2 17h20v2H2zm11.84-9.21c.1-.24.16-.51.16-.79 0-1.1-.9-2-2-2s-2 .9-2 2c0 .28.06.55.16.79C6.25 8.6 3.27 11.93 3 16h18c-.27-4.07-3.25-7.4-7.16-8.21z',
    cup: 'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z',
    check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  };

  F.icon = function (name, cls) {
    const rot = name === 'planeRight';
    const d = P[rot ? 'plane' : name];
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + d + '"' +
      (rot ? ' transform="rotate(90 12 12)"' : '') + '/></svg>';
  };

  // Five simple seated passengers for the "have a seat" panel.
  F.seated = (function () {
    let g = '';
    for (let i = 0; i < 5; i++) {
      const x = i * 120;
      g += '<g transform="translate(' + x + ',0)">' +
        '<rect x="14" y="40" width="16" height="110" rx="6" fill="#2152e3"/>' +          // seat back
        '<rect x="14" y="130" width="90" height="16" rx="6" fill="#2152e3"/>' +         // seat pan
        '<rect x="30" y="150" width="8" height="40" fill="#2152e3"/><rect x="90" y="150" width="8" height="40" fill="#2152e3"/>' +
        '<circle cx="58" cy="30" r="20" fill="#4b4d57"/>' +                             // head
        '<path d="M36 62 Q58 48 80 62 L84 128 L36 128 Z" fill="#4b4d57"/>' +            // torso
        '<path d="M44 124 L100 124 L100 138 L96 186 L82 186 L84 140 L44 140 Z" fill="#4b4d57"/>' + // legs
        '</g>';
    }
    return '<svg class="seated" viewBox="0 0 600 200" aria-hidden="true">' + g + '</svg>';
  })();
})(window.FIDS);
