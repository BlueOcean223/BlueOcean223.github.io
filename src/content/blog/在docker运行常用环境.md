---
title: 在docker运行常用环境
pubDate: 2025-06-07T23:52:30.000Z
tags: []
---

## 前言
在docker中运行常用环境，比如mysql、redis等，是一件非常便捷并且常用的方式。但是在第一次配置环境时（例如换了新的服务器，换了新虚拟机或者刚刚接触docker等），总是比较麻烦。因此想在博客中记录一下配置方式

## 安装docker
卸载旧版本

```bash
sudo yum remove docker \
                  docker-client \
                  docker-client-latest \
                  docker-common \
                  docker-latest \
                  docker-latest-logrotate \
                  docker-logrotate \
                  docker-engine
```


安装必要工具

```bash
sudo yum install -y yum-utils device-mapper-persistent-data lvm2
```



设置稳定的docker仓库

```bash
sudo yum-config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
```



安装docker引擎

```bash
sudo yum install -y docker-ce docker-ce-cli containerd.io
```



启动docker并配置开机自启动

```bash
sudo systemctl start docker
sudo systemctl enable docker
```



配置镜像加速

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<- 'EOF'
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"]
}
EOF

# 重启docker服务
sudo systemctl daemon-reload
sudo systemctl restart docker
```



验证docker

```bash
docker run hello-world
```


## 配置mysql
拉取镜像

```bash
docker pull mysql:8.0
```



运行

```bash
docker run --name mysql \
           -e MYSQL_ROOT_PASSWORD=123456 \
           -p 3306:3306 \
           -v /my/data/mysql:/var/lib/mysql \
           -d mysql:8.0
```


## 配置redis
拉取镜像

```bash
docker pull redis:6.2.7
```



运行

```bash
docker run -d \
  --name redis \
  -p 6379:6379 \
  -v /my/data/redis:/data \
  -e REDIS_PASSWORD=123456 \
  redis:6.2.7 \
  --requirepass 123456 \
  --appendonly yes
```

## 使用docker-compose启动
使用docker-compose前需要先安装

```bash
# 获取docker-compose
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# 为docker-compose文件给予可执行权限
sudo chmod +x /usr/local/bin/docker-compose

# 检查docker-compose是否安装成功
docker-compose --version
```

创建`docker-compose.yaml`文件
```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: mysql
    ports:
      - "3307:3306"
    environment:
      MYSQL_ROOT_PASSWORD: 123456
    volumes:
      - /my/data/mysql:/var/lib/mysql
    restart: unless-stopped

  redis:
    image: redis:6.2.7
    container_name: redis
    ports:
      - "6379:6379"
    volumes:
      - /my/data/redis:/data
    command: ["redis-server", "--requirepass", "123456", "--appendonly", "yes"]
    restart: unless-stopped
```



