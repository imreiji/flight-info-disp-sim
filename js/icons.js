// Inline SVG icons (Material-style paths). All use currentColor.
window.FIDS = window.FIDS || {};

(function (F) {
  // Our icon names -> symbol ids in United's own icon sprite.
  const SPRITE = 'assets/icons/united-sprite.svg';
  const IDS = {
    plane: 'plane', planeRight: 'plane', takeoff: 'plane-departing', land: 'plane-arriving', clock: 'flight-status',
    arrow: 'arrow-right', wifi: 'wifi', power: 'in-seat-power', movie: 'movies', food: 'food', cup: 'beverage',
    check: 'checkmark', delay: 'delays', weather: 'mostly-cloudy', seat: 'seat', upgrade: 'upgrade', standby: 'standby',
  };

  F.icon = function (name, cls) {
    return '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="' + SPRITE + '#' + (IDS[name] || name) + '"/></svg>';
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
