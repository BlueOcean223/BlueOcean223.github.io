---
title: Docker清理
date: 2025-06-09 11:42:08
tags:
cover: /img/syz.jpg
categories:
- 分享
---

## 前言
在使用docker时，不免产生一些额外的空间占用，例如匿名卷挂载、构建镜像时的缓存等。因此定期清理docker是非常有必要的，可以减少不必要的空间占用，节省服务器空间。



## 查看docker磁盘使用情况

```bash
docker system df
```

输出示例

```bash
[root@VM-20-7-centos docker]# docker system df
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          8         1         1.636GB   1.636GB (99%)
Containers      1         0         0B        0B
Local Volumes   8         0         5.586GB   5.586GB (100%)
Build Cache     67        0         4.317GB   4.317GB
```

其中`images`通常不需要清理。`container`可以根据个人需求来清理。`local Volumes`为本地匿名卷挂载，100%表示这些匿名卷全部未被容器挂载，可以放心清理。并且对于主要的容器，大部分情况下都会具名挂载，因此`local volumes`可以放心清理。`build cache`为构建镜像缓存，也可以放心清理



## 清理匿名卷

```bash
# 列出所有卷，确认无用后再删除
docker volume ls

# 删除所有未使用的卷
docker volume prune
```



## 清理构建缓存

```bash
docker builder prune
```

如果未来想避免缓存累计，可以在构建时禁用缓存：

```bash
docker build --no-cache -t my-image .
```



如果确认没有重要的数据残留，可以直接运行

```bash
docker system prune -a --volumes
```

- `-a`：删除所有未使用的镜像
- `--volumes`：删除所有未使用的卷



## 预防措施

1. 定期维护：
   - 定期运行`docker system prune`清理临时资源
2. 定期检查
   - 定期运行`docker system df`检查docker磁盘使用情况
3. 规范挂载卷
   - 创建容器时，使用具名挂载，显示指定主机路径，避免匿名卷



