/* ============ Poppy. 的状态卡片 ============
 * 想改状态？只改下面引号里的文字，然后 git push 上线即可。
 * dot: online(绿点·在线) / busy(橙点·忙碌) / away(灰点·离开)
 */
window.BLOG_STATUS = {
  dot: 'online',
  status: '在线摸鱼中…',
  mood: '今天也想早点睡 (´t-ω-`)'
};

(function () {
  var DOTS = { online: '#4ade80', busy: '#f59e0b', away: '#9ca3af' };

  function build() {
    var author = document.querySelector('.card-widget.card-info');
    if (!author || document.getElementById('card-status')) return;
    var S = window.BLOG_STATUS;
    var card = document.createElement('div');
    card.className = 'card-widget card-status';
    card.id = 'card-status';
    card.innerHTML =
      '<div class="item-headline"><i class="fas fa-circle-dot"></i><span>当前状态</span></div>' +
      '<div class="status-body">' +
        '<div class="status-line"><span class="status-dot" style="background:' +
          (DOTS[S.dot] || DOTS.online) + '"></span>' + S.status + '</div>' +
        '<div class="status-mood">' + S.mood + '</div>' +
      '</div>';
    author.after(card);
  }

  build();
  document.addEventListener('pjax:complete', build);
})();
