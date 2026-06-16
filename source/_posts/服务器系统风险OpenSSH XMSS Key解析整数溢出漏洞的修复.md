---
title: 服务器系统风险OpenSSH XMSS Key解析整数溢出漏洞的修复
date: 2025-06-29 11:29:49
tags:
cover: /img/yourname.jpg
categories:
- bug
---

博主的腾讯云服务器最近在主机安全中发现**风险提示OpenSSH XMSS Key解析整数溢出漏洞**。

原因是因为服务器默认就是OpenSSH是8.0版本所以存在漏洞，在8.1以后就修复了。
因此通过升级OpenSSH版本即可解决

OpenSSH升级版本到最新(8.6)的操作方法
为了小心谨慎请提前打开2个登录入口以防止操作失误打开不了SHH 并且提前制作快照备份数据

下面是操作命令可直接复制

1:下载依赖软件包
```bash
yum install wget gcc -y
yum install -y zlib-devel openssl-devel 
yum install pam-devel libselinux-devel zlib-devel openssl-devel -y 、
```

2:通过wget直接下载

查看当前最新版本：https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/
```bash
wget https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-8.6p1.tar.gz
```
3:删除低版本OpenSSH的rpm包
```bash
rpm -e --nodeps `rpm -qa | grep openssh`
```

4：解压新的OpenSSH
```bash
tar -zxvf openssh-8.6p1.tar.gz
cd  openssh-8.6p1
```
5：配置
```bash
./configure   --prefix=/usr   --sysconfdir=/etc/ssh    --with-md5-passwords   --with-pam --with-zlib   --with-tcp-wrappers    --with-ssl-dir=/usr/local/ssl   --without-hardening
```
6：编译安装
```bash
make
make install
```

7：给权力
```bash
chmod 600 /etc/ssh/ssh_host_rsa_key /etc/ssh/ssh_host_ecdsa_key /etc/ssh/ssh_host_ed25519_key
```

8：复制配置文件并设置允许root用户远程登录
```bash
cp -a contrib/redhat/sshd.init  /etc/init.d/sshd
cp -a contrib/redhat/sshd.pam /etc/pam.d/sshd.pam
chmod u+x /etc/init.d/sshd
vim /etc/ssh/sshd_config 
```

我们先按"I”，即切换到“插入”状态。就可以通过上下左右移动光标，或空格、退格及回车等进行编辑修改
修改`#PermitRootLogin prohibit-password`项去掉注释#并把`prohibit-password`改为`yes`，
修改后即为`PermitRootLogin yes`
去掉注释`#PasswordAuthentication yes`变为`PasswordAuthentication yes`
最后退出保存按键盘ESC 底部输入`:wq` 回车

9:添加添加自启服务ssh到开机启动项
```bash
chkconfig --add sshd
chkconfig sshd on
```

10:重启服务
```bash
systemctl restart sshd
```

11:查看是否成功安装最新版
```bash
ssh -V
```

12：这里可以看出成功！以防万一先别关闭登录面板，请打开新面板试一试能否登录！
```bash
[root@VM-12-16-opencloudos ~]# ssh -V
OpenSSH_8.6p1, OpenSSL 1.1.1k  FIPS 25 Mar 2021
```


版权声明：本文参考CSDN博主「AugustDY」的原创文章。
原文链接：https://blog.csdn.net/AugustDY/article/details/119754810
