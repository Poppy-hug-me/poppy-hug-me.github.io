/* 飘雪特效 - 为 Poppy. 的博客定制 */
(function () {
  if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) return; // 手机端关闭，省电省流量
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99998;';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d'), W, H;
  function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
  resize();
  addEventListener('resize', resize);

  var COUNT = Math.min(100, Math.floor(innerWidth / 14));
  var flakes = [];
  for (var i = 0; i < COUNT; i++) {
    flakes.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2.8 + 0.8,   // 雪花大小
      s: Math.random() * 1.2 + 0.4,   // 下落速度
      sw: Math.random() * 1.2,        // 左右摆动幅度
      p: Math.random() * Math.PI * 2  // 摆动相位
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      ctx.moveTo(f.x, f.y);
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function update() {
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.p += 0.01;
      f.y += f.s;
      f.x += Math.sin(f.p) * f.sw;
      if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
      if (f.x > W + 5) f.x = -5;
      if (f.x < -5) f.x = W + 5;
    }
  }

  (function loop() { draw(); update(); requestAnimationFrame(loop); })();
})();
