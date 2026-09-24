/* 天气特效：雪 / 雨 / 关闭 三档切换 - 为 Poppy. 的博客定制 */
(function () {
  if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) return; // 手机端关闭

  var MODES = ['snow', 'rain', 'off'];
  var ICONS = { snow: '❄️', rain: '🌧️', off: ' Umbrella'.trim() ? '🌂' : '🌂' };
  var LABELS = { snow: '下雪中（点击切换为下雨）', rain: '下雨中（点击关闭特效）', off: '特效已关闭（点击切换为下雪）' };

  // 读取上次的选择（默认下雪）
  var mode = 'snow';
  try { var saved = localStorage.getItem('weather-mode'); if (MODES.indexOf(saved) > -1) mode = saved; } catch (e) {}

  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99998;';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d'), W, H;
  function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
  resize();
  addEventListener('resize', resize);

  var flakes = [];
  function initParticles() {
    flakes = [];
    var count = mode === 'rain' ? 90 : 100;
    for (var i = 0; i < count; i++) {
      flakes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * (mode === 'rain' ? 1.2 : 2.8) + 0.8,
        len: Math.random() * 14 + 10,          // 雨丝长度
        s: Math.random() * (mode === 'rain' ? 7 : 1.2) + (mode === 'rain' ? 9 : 0.4),
        sw: Math.random() * 1.2,
        p: Math.random() * Math.PI * 2
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (mode === 'rain') {
      ctx.strokeStyle = 'rgba(150,175,205,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x - 1.5, f.y + f.len);
      }
      ctx.stroke();
    } else if (mode === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      for (var j = 0; j < flakes.length; j++) {
        var s = flakes[j];
        ctx.moveTo(s.x, s.y);
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  function update() {
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      if (mode === 'rain') {
        f.y += f.s; f.x -= 1;
        if (f.y > H + 20) { f.y = -20; f.x = Math.random() * (W + 100); }
        if (f.x < -20) f.x = W + 20;
      } else {
        f.p += 0.01; f.y += f.s; f.x += Math.sin(f.p) * f.sw;
        if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
        if (f.x > W + 5) f.x = -5;
        if (f.x < -5) f.x = W + 5;
      }
    }
  }

  function loop() {
    if (mode !== 'off') { draw(); update(); }
    else { ctx.clearRect(0, 0, W, H); }
    requestAnimationFrame(loop);
  }
  loop();

  // 切换按钮（放在右侧功能按钮上方，避免遮挡）
  var btn = document.createElement('div');
  btn.id = 'weather-toggle';
  btn.style.cssText = 'position:fixed;right:24px;bottom:265px;width:42px;height:42px;line-height:42px;' +
    'text-align:center;font-size:19px;border-radius:50%;cursor:pointer;z-index:999;user-select:none;' +
    'background:rgba(255,255,255,0.75);box-shadow:0 2px 10px rgba(0,0,0,0.12);transition:all .3s;';
  document.body.appendChild(btn);

  function renderBtn() {
    btn.textContent = ICONS[mode];
    btn.title = LABELS[mode];
    if (mode === 'off') btn.style.opacity = '0.55';
    else btn.style.opacity = '1';
  }
  renderBtn();
  initParticles();

  btn.addEventListener('click', function () {
    var idx = MODES.indexOf(mode);
    mode = MODES[(idx + 1) % MODES.length];
    try { localStorage.setItem('weather-mode', mode); } catch (e) {}
    initParticles();
    renderBtn();
  });
})();
