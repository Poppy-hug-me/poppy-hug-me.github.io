/* ============ 节日氛围特效 ============
 * 想加节日？在下面 FESTIVALS 里加一条即可（year=年份, start/end=月-日）。
 * items 里是飘落的 emoji，banner 是顶部祝福横幅文字。
 */
(function () {
  var FESTIVALS = [
    {
      year: 2026, start: '09-24', end: '09-27', name: '中秋',
      items: ['🥮', '🌕', '🏮', '🐇'],
      banner: '🌕 月圆人团圆——中秋快乐！记得吃月饼呀～'
    },
    {
      year: 2027, start: '01-01', end: '01-01', name: '元旦',
      items: ['🎊', '✨', '🎆'],
      banner: '🎊 新的一年也要元气满满哦！'
    }
  ];

  var now = new Date();
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

  var fest = null;
  for (var i = 0; i < FESTIVALS.length; i++) {
    var f = FESTIVALS[i];
    if (f.year === now.getFullYear() && today >= f.start && today <= f.end) { fest = f; break; }
  }
  if (!fest) return;

  /* 顶部祝福横幅（可关闭） */
  var banner = document.createElement('div');
  banner.className = 'festival-banner';
  banner.innerHTML =
    '<span class="festival-text">' + fest.banner + '</span>' +
    '<span class="festival-close" title="关闭">×</span>';
  document.body.appendChild(banner);
  banner.querySelector('.festival-close').addEventListener('click', function () {
    banner.remove();
  });

  /* 飘落的节日元素 */
  var layer = document.createElement('div');
  layer.className = 'festival-layer';
  var COUNT = 22;
  for (var j = 0; j < COUNT; j++) {
    var s = document.createElement('span');
    s.textContent = fest.items[Math.floor(Math.random() * fest.items.length)];
    s.style.left = Math.random() * 100 + '%';
    s.style.fontSize = (14 + Math.random() * 16) + 'px';
    s.style.animationDuration = (7 + Math.random() * 8) + 's';
    s.style.animationDelay = (-Math.random() * 12) + 's';
    s.style.opacity = 0.55 + Math.random() * 0.4;
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
})();
