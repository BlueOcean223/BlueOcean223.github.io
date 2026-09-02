---
title: HMAC 和普通哈希差在哪：从长度扩展攻击讲到常数时间比较
pubDate: 2026-09-01T10:16:52.000Z
description: 为什么 sha256(secret + payload) 这种签名写法是有洞的？本文用可运行的 Go 代码实测长度扩展攻击、HMAC 与裸哈希的性能差距、以及朴素字节比较泄露出来的时序信号，顺带把盐、pepper、慢哈希和常数时间比较一次讲清楚。
tags:
  - HMAC
  - 哈希
  - 长度扩展攻击
  - 时序攻击
  - 加盐
  - 密码存储
  - Go
---

# 从一个支付回调说起

你做了个接收支付回调的接口。平台每次发请求过来，结构大概长这样：

```text
POST /api/payment/callback HTTP/1.1
Content-Type: application/json
X-Timestamp: 1725148800
X-Signature: 9f86d081884c...（64 位十六进制）

{"order_id":"2024001","amount":100,"status":"paid"}
```

`X-Signature` 是签名。平台用你俩事先约定好的密钥，对请求体算了一个哈希值放在这里。你收到请求后用同样的密钥重新算一遍，跟 header 里的对上了，才相信这条消息确实是平台发的、中间没被改过。

签名的计算逻辑通常是：

```go
sign := sha256.Sum256([]byte(secret + body))
```

密钥拼在前面、整体过一遍 SHA-256，看起来该有的都有了：不知道 `secret` 就算不出 `sign`，SHA-256 也没被破。

但这段代码是有洞的。攻击者可以在完全不知道 `secret` 的前提下，往 body 后面追加内容，并且算出一个服务端认可的新签名。

下面从这个洞出发，把 HMAC 和普通哈希的区别、性能代价、以及周边那一圈容易踩的坑（盐、pepper、慢哈希、时序攻击）过一遍。

# 1. 哈希和 HMAC 分别解决什么问题

先说一个最关键的区别：**哈希谁都能算，HMAC 只有拿着密钥的人能算。**

## 1.1 哈希：验完整性，不验身份

你从 GitHub 下了个安装包，Release 页面上写着 SHA-256 是 `a1b2c3...`。下完在本地跑一遍 `sha256sum`，对上了，说明文件在传输过程中没损坏。

但这里有个前提：你信任那个 SHA-256 确实是 GitHub 给的。因为 SHA-256 是公开算法，谁都能算。如果有人同时替换了安装包和校验值，你看不出来。

所以裸哈希只能防意外损坏（网络丢包、磁盘坏块）。要是有人蓄意篡改，光靠哈希是防不住的。

## 1.2 HMAC：验完整性，也验身份

HMAC 多了一个密钥。只有知道密钥的人才能算出正确的值。

回到支付回调的场景：平台和你事先约定了一个 secret，平台每次发请求时用 `HMAC(secret, payload)` 算一个签名带在 header 里。你收到后用同一个 secret 重新算一遍，对上了就说明两件事：

1. 消息没被改过
2. 消息来自知道 secret 的人（也就是平台自己）

攻击者就算在中间截到了请求、改了 payload，他也算不出新的 HMAC，因为他没有 secret。

| | 需要密钥吗 | 谁能算 | 防什么 |
| --- | --- | --- | --- |
| 哈希 (SHA-256) | 不需要 | 谁都能 | 意外损坏 |
| HMAC | 需要 | 只有持钥方 | 意外损坏 + 恶意篡改 + 身份伪造 |

一句话：你防的是手滑还是防的是人？防人就得有密钥，就该用 HMAC。具体什么场景对应什么方案，第 5.4 节有一张完整的对照表。

补充两个容易混的概念。加密管的是"别人看不见"（可逆），HMAC 管的是"别人改不了"（不可逆），两者解决的不是同一个问题。还有数字签名（Ed25519、RSA），和 HMAC 一样管"改不了"，但用的是非对称密钥：签名方和验证方拿的不是同一个密钥，所以可以对第三方举证。HMAC 是对称的，验证方自己也能伪造，当不了证据。

# 2. 那直接 hash(secret + message) 不就行了

上一节说了要有密钥。那把密钥拼在消息前面再 hash，不知道密钥就算不出来，问题解决了？

暴力猜密钥确实不现实。但攻击者有别的路。

## 2.1 不需要知道密钥就能伪造

先说攻击能做到什么，再解释为什么。

假设服务端的签名方式是 `tag = SHA256(secret + "user=alice&role=guest")`。攻击者不知道 secret，但他拿到了这个 tag（从 cookie、URL 参数、响应体里都有可能）。他能做到：

1. 在消息尾部追加 `&role=admin`
2. 纯靠已有的 tag 算出一个新 tag
3. 把新消息和新 tag 发给服务端
4. 服务端验签通过，攻击者提权成功

整个过程不需要知道 secret 的内容，只需要猜到它的长度。不知道长度就从 1 试到 64，几十次请求就够。

这就是**长度扩展攻击**（Length Extension Attack）。Flickr 的 API 签名在 2009 年就栽在这上面，之后 Vimeo 等一批用了同样方案的服务也中过招。

## 2.2 为什么能做到

要理解这个攻击，先要知道 SHA-256 内部是怎么工作的。不用懂数学细节，只需要知道三件事。

**SHA-256 内部有 8 个数。** 具体来说是 8 个 32 位整数，规范里叫 A、B、C、D、E、F、G、H，一共 256 位。"SHA-256"名字里的 256 就是这么来的。计算开始之前，这 8 个数被设成固定的初始值（所有人都一样）。

**数据是一块一块喂进去的。** SHA-256 把输入切成 64 字节一块。每喂进去一块，内部那 8 个数就经过一轮复杂运算更新一次。全部喂完之后，还会补一段填充（padding），填充里包含了输入的总比特数。

**最终输出就是这 8 个数拼在一起。** 没有任何额外处理。A B C D E F G H 按顺序拼起来，就是你看到的那 64 个十六进制字符（32 字节）。

```text
初始状态 A₀B₀C₀D₀E₀F₀G₀H₀
    ↓ 喂入 block0
更新为   A₁B₁C₁D₁E₁F₁G₁H₁
    ↓ 喂入 block1
更新为   A₂B₂C₂D₂E₂F₂G₂H₂
    ↓ 喂入 block2（含 padding）
最终状态 A₃B₃C₃D₃E₃F₃G₃H₃  →  直接拼起来输出 = 哈希值
```

问题就在第三条。拿到哈希值 = 拿到 A₃B₃C₃...H₃ = 拿到了这台机器处理完所有数据之后的完整状态。

攻击者可以造一台新的 SHA-256 机器，把 A B C D E F G H 直接设成从哈希值里拆出来的那 8 个数，然后继续往里喂新数据（`&role=admin`）。新机器不需要知道前面喂过什么（secret 是什么、message 是什么），它只需要知道"机器现在停在哪"，就能接着往下算。

这就是下面 PoC 里 `forge` 函数做的事：把 tag（也就是 A₃...H₃）塞回 `sha256.New()` 的内部状态，然后 `Write(extra)`，得到的新哈希和"从头喂完 secret + message + padding + extra"完全一样。

**为什么要猜 secret 的长度？** SHA-256 补的 padding 里包含输入的总比特数。攻击者知道 message 有多长但不知道 secret 有多长，所以算不准 padding 的内容。猜错了 padding，伪造出来的消息跟服务端重算的就对不上。于是他从长度 1 开始往上试，每次用不同的 padding 构造伪造消息，哪个被服务端接受了就说明猜对了。密钥一般不超过 64 字节，几十次请求就能覆盖。

MD5、SHA-1、SHA-256、SHA-512 内部结构都一样（Merkle-Damgård），输出都是直接暴露内部状态，全部中招。

## 2.3 跑一遍看看

Go 的 `crypto/sha256` 实现了 `encoding.BinaryUnmarshaler`，正好可以直接把摘要塞回去当状态用，写出一个非常短的 PoC：

```go
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding"
	"encoding/binary"
	"encoding/hex"
	"fmt"
)

// glue 计算 SHA-256 对长度为 msgLen 的消息追加的那段填充
func glue(msgLen int) []byte {
	pad := []byte{0x80}
	for (msgLen+len(pad))%64 != 56 {
		pad = append(pad, 0)
	}
	var l [8]byte
	binary.BigEndian.PutUint64(l[:], uint64(msgLen)*8)
	return append(pad, l[:]...)
}

// forge 在只知道 tag = SHA256(secret||msg) 和 len(secret) 的前提下，
// 伪造出 SHA256(secret||msg||glue||extra)
func forge(tag []byte, secretLen, msgLen int, extra []byte) []byte {
	total := secretLen + msgLen
	padded := total + len(glue(total)) // 一定是 64 的倍数

	// 拼出 crypto/sha256 的内部状态：magic + 8 个 h 值 + 64 字节缓冲 + 已处理长度
	state := make([]byte, 0, 108)
	state = append(state, "sha\x03"...)
	state = append(state, tag...)              // 摘要就是 h[0..7]
	state = append(state, make([]byte, 64)...) // 缓冲为空
	state = binary.BigEndian.AppendUint64(state, uint64(padded))

	h := sha256.New()
	if err := h.(encoding.BinaryUnmarshaler).UnmarshalBinary(state); err != nil {
		panic(err)
	}
	h.Write(extra)
	return h.Sum(nil)
}

func main() {
	secret := []byte("s3cr3t-key-42") // 攻击者不知道内容，只需猜到长度
	msg := []byte("user=alice&role=guest")
	extra := []byte("&role=admin")

	// 服务端：tag = H(secret || msg)
	tag := sha256.Sum256(append(append([]byte{}, secret...), msg...))
	fmt.Printf("原始消息 : %s\n", msg)
	fmt.Printf("原始 tag : %s\n", hex.EncodeToString(tag[:]))

	// 攻击者：不知道 secret，直接伪造
	forged := forge(tag[:], len(secret), len(msg), extra)
	newMsg := append(append([]byte{}, msg...), glue(len(secret)+len(msg))...)
	newMsg = append(newMsg, extra...)
	fmt.Printf("伪造 tag : %s\n", hex.EncodeToString(forged))

	// 服务端拿到 newMsg 后重新计算，看看认不认
	real := sha256.Sum256(append(append([]byte{}, secret...), newMsg...))
	fmt.Printf("服务端算 : %s\n", hex.EncodeToString(real[:]))
	fmt.Printf("伪造成功 : %v\n", bytes.Equal(forged, real[:]))
	fmt.Printf("伪造消息 : %q\n", newMsg)
}
```

跑出来：

```text
原始消息 : user=alice&role=guest
原始 tag : 408055b399eabef315f59cef82624346631116c2d9a1a3dc4522c36f9cc5e040
伪造 tag : d89831c23801294dac52c0ed43473bc212effe8fb331666a7369d39df06dd01c
服务端算 : d89831c23801294dac52c0ed43473bc212effe8fb331666a7369d39df06dd01c
伪造成功 : true
伪造消息 : "user=alice&role=guest\x80\x00\x00...\x00\x01\x10&role=admin"
```

服务端算出来的和伪造的一模一样。

看到输出里那段 `\x80\x00...\x00\x01\x10` 了吗？那是原始计算时 SHA-256 自己在末尾补的 padding。攻击者把它留在了新消息的中间。这里容易产生一个疑问：中间夹了 padding，这还是合法的消息吗？

答案是：对 SHA-256 来说，中间那段就是普通的字节，不是 padding。SHA-256 只在自己处理的最末尾补 padding，中间的 `\x80\x00...` 它当普通数据处理。这段"脏数据"之所以要留着，是因为它让新消息的分块边界和原始计算对齐：服务端处理 `secret + 原始消息 + 这段旧padding` 时，SHA-256 走过的块和产生的中间状态，与原始计算完全相同。接下来处理 `&role=admin`，就是从同一个状态继续算，结果自然和攻击者从 tag 接着算的一致。

消息中间夹的那堆二进制看着很脏，但很多解析器不在乎。`net/url` 会把那堆字节当成上一个参数值的一部分，`&role=admin` 被当成新参数。而 `Query().Get("role")` 取的是第一个，PHP 的 `$_GET` 取的是最后一个，两边解析不一致的地方就是提权的口子。

现成工具 `hash_extender` 一条命令就能生成 payload，连上面这段代码都不用写。

## 2.4 把密钥放后面呢

`hash(message + secret)` 确实躲开了长度扩展。但安全性全押在哈希的抗碰撞性上：如果能找到两个不同的消息 `m1 ≠ m2` 使得 `H(m1) = H(m2)`，那 `H(m1||secret) = H(m2||secret)` 也成立，签名可以整条搬过去用。

对 SHA-256 来说这暂时不是问题，但对 MD5 是灾难（笔记本上秒级出碰撞），对 SHA-1 也已经失守（2017 年的 SHATTERED，2020 年的选择前缀碰撞把成本压到几万美元）。把安全性建立在"这个哈希以后也不会被找到碰撞"上，是个会过期的假设。

## 2.5 哪些哈希天生免疫

- SHA-3 / Keccak：海绵结构，摘要只是内部状态的一部分，天然抗长度扩展，还自带 KMAC。
- BLAKE2 / BLAKE3：内置 keyed 模式，`BLAKE3::keyed_hash(key, msg)` 本身就是个 MAC，不需要套 HMAC。
- SHA-512/256、SHA-224：内部状态比输出长，截断掉的那部分攻击者拿不到，因此也免疫。

即便手上是这些算法，没有明确理由的话还是建议用标准 HMAC。对接方、网关、SDK、审计工具都认 HMAC-SHA256，你自研的 keyed hash 方案需要额外说明，而"需要额外说明的密码学方案"通常就是出事的地方。

# 3. HMAC 怎么堵住这个洞

HMAC 的思路很直接：在外面再套一层哈希。

上一节说了，攻击者能扩展是因为拿到了内部状态。HMAC 做了两次哈希：

```text
内层：H( K⊕ipad  ‖  message )     →  中间摘要
外层：H( K⊕opad  ‖  中间摘要 )    →  最终 tag
```

攻击者拿到的最终 tag 是外层的输出。他想接着扩展，扩展出来的是外层的东西；但服务端验签时新消息是喂给内层的。内层和外层用的密钥不同（一个异或了 `0x36`，一个异或了 `0x5c`），两边对不上，扩展出来的 tag 通不过验签。

这就是 HMAC 比 `hash(secret + msg)` 多出来的那一层保护。

RFC 2104 的完整定义：

```text
HMAC(K, m) = H( (K' ⊕ opad) ‖ H( (K' ⊕ ipad) ‖ m ) )

K'    = K 处理成刚好一个分组长（SHA-256 是 64 字节）：
        len(K) >  B  →  K' = H(K) 再右补零
        len(K) <= B  →  K' = K 右补零
ipad  = 0x36 重复 B 次
opad  = 0x5c 重复 B 次
```

手搓一遍验证，和标准库结果完全一致：

```go
const blockSize = 64 // SHA-256 的分组长度

func myHMAC(key, msg []byte) []byte {
	// 1. key 比分组长就先 hash，短就右补零到分组长
	if len(key) > blockSize {
		sum := sha256.Sum256(key)
		key = sum[:]
	}
	k := make([]byte, blockSize)
	copy(k, key)

	ipad := make([]byte, blockSize)
	opad := make([]byte, blockSize)
	for i := range k {
		ipad[i] = k[i] ^ 0x36
		opad[i] = k[i] ^ 0x5c
	}

	// 2. inner = H((K ⊕ ipad) || msg)
	inner := sha256.New()
	inner.Write(ipad)
	inner.Write(msg)

	// 3. outer = H((K ⊕ opad) || inner)
	outer := sha256.New()
	outer.Write(opad)
	outer.Write(inner.Sum(nil))
	return outer.Sum(nil)
}
```

```text
手搓       : ff53a67998c7d876652e395796a47173ce60af2031c743156da3a68d98ce2412
crypto/hmac: ff53a67998c7d876652e395796a47173ce60af2031c743156da3a68d98ce2412
一致       : true
```

## 3.1 安全性不靠抗碰撞

HMAC 有个很实用的性质：安全归约建立在"底层压缩函数是个伪随机函数（PRF）"上，而不是建立在抗碰撞上。意味着什么？MD5 的抗碰撞早就没了，但 HMAC-MD5 至今没有实用的伪造攻击。同理 HMAC-SHA1 在 TLS 里还能继续用一阵。

当然新系统别用它们，没必要去赌。默认 HMAC-SHA256 就行。

## 3.2 两个容易踩的实现坑

一是超长密钥会被先哈希。`len(K) > 64` 时 `K' = H(K)`，所以一个 100 字节的密钥，和它的 SHA-256 摘要（当成 32 字节密钥用），产生的 HMAC 完全相同。这不是漏洞，但会让"密钥越长越安全"的直觉失效。超过 64 字节纯属浪费，32 字节随机数就是最优解。

二是 `ipad` / `opad` 别自己改。选 `0x36` 和 `0x5c` 是因为两者异或后汉明距离大，能保证内外两层用的实际密钥差异足够。图省事写成 `0x00` / `0xff` 之类会削弱安全论证。

# 4. 性能：HMAC 比裸哈希慢多少

这大概是被问得最多的一个问题。直接上实测（Apple M2，Go 1.26.5，`go test -bench`）：

```go
func BenchmarkHMACReuse(b *testing.B) {
	for _, s := range sizes {
		msg := make([]byte, s.n)
		m := hmac.New(sha256.New, key) // 复用同一个 Hash
		b.Run(s.name, func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				m.Reset()
				m.Write(msg)
				m.Sum(nil)
			}
		})
	}
}
```

| 消息长度 | SHA-256 | HMAC（每次 `New`） | HMAC（复用 + `Reset`） | New 倍数 | 复用倍数 |
| --- | --- | --- | --- | --- | --- |
| 16 B | 47.2 ns | 301.5 ns | 106.0 ns | 6.4× | 2.2× |
| 64 B | 52.3 ns | 310.5 ns | 119.8 ns | 5.9× | 2.3× |
| 256 B | 123.3 ns | 381.0 ns | 186.7 ns | 3.1× | 1.5× |
| 1 KB | 414.7 ns | 697.4 ns | 480.1 ns | 1.7× | 1.16× |
| 64 KB | 24.95 µs | 25.55 µs | 25.03 µs | 1.02× | 1.003× |
| 1 MB | 398.8 µs | 400.6 µs | 399.1 µs | 1.005× | 1.001× |

先看最右边两列。倍数从 6.4× 一路掉到 1.001×，因为 HMAC 的额外开销是个固定值，不随消息长度增长：对比裸哈希，它固定多出三次压缩函数调用，`K'⊕ipad` 一个分组、`K'⊕opad` 一个分组、内层摘要一个分组。消息越长这三次占比越小，到 64 KB 已经在噪声里了。

再看 16 字节那一行，`New` 和复用差了将近三倍。这部分几乎全是密钥预处理和内存分配的钱。Go 的 `crypto/hmac` 会把 ipad/opad 两个分组压缩后的中间状态 marshal 下来缓存，`Reset()` 时直接 unmarshal 恢复，省掉重复计算：

```go
// crypto/internal/fips140/hmac/hmac.go
// Marshaling succeeded; save the marshaled state for later
h.ipad = imarshal
h.opad = omarshal
```

所以高 QPS 的验签路径上，把 `hmac.Hash` 放进 `sync.Pool` 或者按密钥缓存起来复用，比换算法有用得多。注意 `hmac.Hash` 不是并发安全的，池化的时候别共享。

不过说到底，性能不该是"要不要用 HMAC"的理由。就算按最差的 6.4× 算，单次也才 300 ns，一台机器每秒能做 300 万次。真到了这个量级，瓶颈早在 JSON 解析、网络和数据库上了，轮不到 HMAC。

## 4.1 反过来：有些场景嫌它太快

同一台机器上量一下 PBKDF2-HMAC-SHA256：

| 迭代轮数 | 耗时 | 单轮 |
| --- | --- | --- |
| 10,000 | 1.26 ms | 0.126 µs |
| 100,000 | 10.2 ms | 0.102 µs |
| 310,000 | 32.3 ms | 0.104 µs |
| 600,000 | 62.9 ms | 0.105 µs |

一次 HMAC-SHA256 约 0.1 µs，OWASP 建议的 600,000 轮 PBKDF2 约 63 ms，差了近六个数量级。这个差距是故意造出来的。

原因很直白。验签的对手是伪造者，他没有密钥，暴力枚举 256 位空间没有意义，所以算法快无所谓。存密码的对手则是拖库之后离线爆破的人，他手里有全部密文和无限时间，你算得越快他也爆得越快。这就引出下一节。

# 5. 盐、pepper、密钥：三个不同的东西

"加盐"经常和 HMAC 混着讲，但它们解决的完全不是同一个问题。在说区别之前，先把三个概念过一遍。

## 5.1 盐（salt）：让同样的密码产生不同的哈希

假设你的用户表长这样，密码用 SHA-256 存：

```text
user   | password_hash
-------|----------------------------------------------
alice  | 5e884898da28047151d0e56f8dc6292773603d0d...
bob    | 5e884898da28047151d0e56f8dc6292773603d0d...
```

两个人用了同一个密码（`password`），哈希完全相同。攻击者拖到库之后，一眼就看出这俩人密码一样。更要命的是，`password` 这种常见词的 SHA-256 结果早就被算好了，放在彩虹表里直接查就行，连暴力破解都不用。2012 年 LinkedIn 泄露的 650 万条无盐 SHA-1 几天内就被破掉了绝大部分。

盐就是为了解决这个问题。给每个用户生成一个随机字符串（盐），拼在密码前面再 hash：

```text
user   | salt                             | password_hash
-------|----------------------------------|----------------------------------------------
alice  | a3f2b8c1e9d04f6a7b2c8d1e0f3a5b7c | 7b1c4a9e... (和下面完全不同)
bob    | 92e4d1f7a5b8306c4d2e9f1a8b7c0d3e | f3d8e21a... (和上面完全不同)
```

同样的密码 `password`，因为盐不同，哈希结果完全不同。攻击者的彩虹表废了（每个盐都要重新算一整张表），也看不出谁和谁密码相同了。

**盐不是秘密。** 它明文和哈希存在一起，验证密码时要读出来用。它的作用是打散，不是保密。使用要点：

- 每个用户独立生成，16 字节 CSPRNG 随机数起步
- 别用用户名、邮箱、自增 ID 这类可预测值当盐
- 改密码时重新生成

## 5.2 pepper：藏在数据库之外的秘密

pepper 可以理解成"全局的、保密的盐"。它不存在数据库里，而是放在应用配置、KMS 或 HSM 里。

为什么要多这一层？因为很多安全事故是"只拖了数据库"：SQL 注入、备份文件泄露、从库被人下载。如果密码哈希只靠盐保护，攻击者有了库就能开始爆破。但如果计算哈希时还混入了一个 pepper，攻击者只拿到数据库的话连起步都没法起步，因为他缺一个关键输入。

## 5.3 三者对照

| | 存哪儿 | 是否保密 | 每用户不同 | 防的是什么 |
| --- | --- | --- | --- | --- |
| 盐 salt | 和摘要一起进数据库 | 否 | 是 | 彩虹表、批量爆破、相同口令碰撞 |
| pepper | 应用配置 / KMS / HSM，不入库 | 是 | 否 | 只拖了数据库、没拿到应用配置的攻击者 |
| 密钥 key | 同上 | 是 | 否 | 消息伪造（这才是 HMAC 用的东西） |

pepper 的标准做法是在慢哈希外面套一层 HMAC：

```go
// pepper 从 KMS / 环境变量读，绝不入库
pre := hmac.New(sha256.New, pepper)
pre.Write([]byte(password))
hashed := argon2.IDKey(pre.Sum(nil), salt, 3, 64*1024, 4, 32)
```

顺序别写反：**HMAC 在里，慢哈希在外**。这样即使 pepper 泄露，Argon2 的成本还在，攻击者不会一夜回到解放前。反过来就没这个性质了。

先过一遍 HMAC 还顺手解决了 bcrypt 的一个老坑。bcrypt 只取密码的前 72 字节，后面的直接丢掉；先 HMAC 成 32 字节再喂给它，长密码就不会被静默截断了。

## 5.4 慢哈希：存密码为什么不能用 SHA-256 或 HMAC

上面的代码里出现了 Argon2，这就是所谓的"慢哈希"。先说为什么需要它。

SHA-256 算一次只要几十纳秒，一台普通机器每秒能算几千万次。这对验签来说是优点（快），但对存密码来说是灾难。攻击者拖库之后做的是离线爆破：拿着哈希值，把常见密码一个一个试。SHA-256 太快，一张显卡每秒能试几十亿个，六位纯数字密码几毫秒就破完。

慢哈希就是故意把这个过程变慢的算法。Argon2id 算一次要几十毫秒，而且占大块内存（几十 MB），GPU 想并行跑几千路就得有几千份内存，成本直接起飞。同样的时间，用 SHA-256 能试几十亿个密码，用 Argon2id 只能试十几个。

存用户密码请用这些算法（按推荐顺序）：

| 算法 | 推荐参数（OWASP） | 备注 |
| --- | --- | --- |
| Argon2id | m=19 MiB, t=2, p=1（或 m=47 MiB, t=1, p=1） | 首选，抗 GPU/ASIC |
| scrypt | N=2^17, r=8, p=1 | 次选，同样是内存硬 |
| bcrypt | cost ≥ 10 | 老系统兼容，注意 72 字节截断 |
| PBKDF2-HMAC-SHA256 | ≥ 600,000 轮 | FIPS 合规场景的选择；只是计算硬，不是内存硬 |

Argon2 和 scrypt 是内存硬（memory-hard）的：除了算得慢，还要占大块内存，GPU 和 ASIC 的并行优势因此大打折扣。PBKDF2 只是重复计算，一张显卡能同时跑几万路，所以同样是"63 毫秒"，它给出的实际保护比 Argon2 弱不少。没有 FIPS 包袱就直接上 Argon2id。

## 5.4 什么时候该用哪个

| 场景 | 用什么 |
| --- | --- |
| 存用户密码 | Argon2id / scrypt / bcrypt + 每用户随机盐（+ pepper） |
| API 请求签名、Webhook 验签 | HMAC-SHA256 |
| 会话 token、CSRF token 完整性 | HMAC-SHA256（或直接用不透明随机 token + 服务端存储） |
| 文件完整性校验（可信信道下发校验值） | 裸 SHA-256 / BLAKE3 |
| 缓存键、分片路由、去重 | 非加密哈希就够（xxHash、FNV），别浪费 SHA-256 |
| 需要对第三方举证 | 数字签名（Ed25519），HMAC 做不到不可否认 |

最后一行得多说一句。HMAC 是对称的，验证方拿着和签发方一模一样的密钥，所以验证方自己也能伪造出任意签名。这意味着 HMAC 签名在纠纷中当不了证据，需要不可否认性就得上非对称签名。

# 6. 时序攻击：算对了，栽在比较上

HMAC 用对了、盐加好了，最后一步 `if computed == received` 还能把你送走。

## 6.1 问题出在哪

绝大多数语言的默认字符串/字节比较都是短路的，发现第一个不同的字节就立即返回。于是比较耗时和"公共前缀长度"成正比，攻击者反复请求、观察响应时间，就能一个字节一个字节地把正确的 tag 试出来，把 `256^32` 次的暴力搜索压到 `256 × 32 = 8192` 次量级。

量一下到底有多明显。测法是拿一个 32 字节 tag，构造前 N 字节正确、其余错误的猜测值，每组跑 20 万次取中位数：

```go
// 一发现不同就返回，耗时和公共前缀长度成正比
func naiveEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
```

| 猜对的前缀字节数 | `naiveEqual` | `subtle.ConstantTimeCompare` | `hmac.Equal` |
| --- | --- | --- | --- |
| 0 | 1.71 ns | 11.78 ns | 11.46 ns |
| 1 | 1.76 ns | 11.88 ns | 11.75 ns |
| 2 | 3.23 ns | 11.74 ns | 11.70 ns |
| 4 | 3.71 ns | 11.67 ns | 12.04 ns |
| 8 | 4.73 ns | 11.92 ns | 11.75 ns |
| 16 | 7.04 ns | 12.27 ns | 12.47 ns |
| 24 | 9.62 ns | 11.73 ns | 11.48 ns |
| 31 | 11.53 ns | 11.74 ns | 11.48 ns |

信号非常干净。`naiveEqual` 从 1.71 ns 一路爬到 11.53 ns，猜对得越多就越慢，单调递增。两个常数时间实现则从头到尾稳在 11.5～12.5 ns，跟猜对几个字节完全无关。

有意思的是，常数时间版本在"一个都没猜对"时反而比朴素版慢 6 倍多。这正是它的工作方式：不管对错都把 32 个字节全跑完。安全就是拿这点开销换的，10 ns 而已。

## 6.2 这个几纳秒的差距，真能被利用吗

差距只有 10 ns 量级，而网络抖动是毫秒量级，看着完全淹没了。但有三点。

噪声可以靠采样次数压下去。时间差是固定偏置，噪声大体上零均值，采样量足够时均值会收敛。Crosby、Wallach 和 Riedi 在 2009 年的 *Opportunities and Limits of Remote Timing Attacks* 里给过实测：局域网内可以分辨到 100 ns 量级的差异，跨广域网也能做到 10 µs 量级。上表那 10 ns 确实偏小，但换成更长的 token，或者比较恰好发生在循环里被放大，就未必了。

攻击者也常常不在网络另一端。同一台物理机上的另一个容器、同一朵云上的邻居虚机、浏览器里的另一个标签页，拿到的时间分辨率比跨网高好几个数量级。

最要紧的是成本不对称。修好它只要改一行、多花 10 ns；不修则要赌"我的部署环境永远噪声够大"。这个赌注不值得下。Lucky 13（TLS CBC 的 MAC 校验时序）和 BREACH 都说明了同一件事：只要存在可测量的、和秘密相关的时间差，工业界总有人能把它变成实用攻击。

## 6.3 各语言的正确写法

```go
// Go：首选 hmac.Equal，语义最清楚
if !hmac.Equal(computed, received) {
    return errInvalidSignature
}
// 通用字节比较用 subtle.ConstantTimeCompare（返回 1 表示相等）
if subtle.ConstantTimeCompare(a, b) != 1 { ... }
```

```python
# Python
import hmac
if not hmac.compare_digest(computed, received):
    raise ValueError("invalid signature")
```

```javascript
// Node.js 注意：长度不同会直接 throw，要先自己判长度
const crypto = require("crypto");
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  throw new Error("invalid signature");
}
```

```java
// Java: MessageDigest.isEqual 在 JDK 6u17 之前不是常数时间（CVE-2009-3875），
// 现代 JDK 已修复，可以放心用
if (!MessageDigest.isEqual(computed, received)) { ... }
```

```php
// PHP
if (!hash_equals($computed, $received)) { ... }
```

有个小细节。几乎所有常数时间比较函数在长度不同时都会提前返回，也就是说长度是泄露的。对固定 32 字节的 HMAC tag 无所谓，但如果比较的是变长的秘密（比如 API key 本身），就要留意了。

## 6.4 兜底方案：Double HMAC

要是环境实在不好保证常数时间比较（某些 ORM、某些框架的封装、某些不受控的第三方库），有个能套在外面的通用技巧：用一个每次请求随机生成的密钥，把两边都再 HMAC 一次，然后随便怎么比。

```go
func doubleHMACEqual(a, b []byte) bool {
	nonce := make([]byte, 32)
	rand.Read(nonce) // 一次性随机密钥

	ha := hmac.New(sha256.New, nonce)
	ha.Write(a)
	hb := hmac.New(sha256.New, nonce)
	hb.Write(b)

	// 到这里两边都被随机化了，公共前缀长度不再泄露任何信息
	return bytes.Equal(ha.Sum(nil), hb.Sum(nil))
}
```

原理是攻击者无法预测本次的随机密钥，也就无法通过控制输入去影响两个 HMAC 结果的公共前缀，短路比较泄露的那点信息就没用了。代价是每次多两次 HMAC，按第 4 节的数据，几百纳秒。

## 6.5 泄露的不止是比较

时序侧信道不限于 MAC 比较，验签路径上常见的还有：

- 先查 secret 存不存在、不存在就早退。这会泄露 key ID 的有效性。正确做法是查不到也走一遍完整流程，用一个假密钥算完再返回失败。
- 登录时"用户不存在"比"密码错误"返回快，因为前者根本没走 bcrypt。修法是用户不存在时也对一个固定的假 hash 跑一遍。
- 按 IP / key 查限流表，命中和未命中耗时差异明显。
- 先解析 JSON 再验签。畸形 JSON 的解析耗时差异会泄露结构信息，而且这等于在验签之前就把攻击面暴露给了未认证的输入。**永远先验签，再解析。**

# 7. 实战：接口签名的正确姿势

## 7.1 拼接歧义：另一个容易忽略的洞

假设签名是这么拼的：

```go
mac := hmac.New(sha256.New, key)
mac.Write([]byte(userID + action + amount))
```

那么 `("1", "23", "45")` 和 `("12", "3", "45")` 拼出来是同一个字符串 `"12345"`，签名完全相同。攻击者拿一个合法请求的签名，换成另一组参数照样通过。这类问题叫 canonicalization（规范化）漏洞，毛病出在拼接不可逆。

修法是让拼接可逆。两种常见做法：

```go
// 方案一：长度前缀（最稳妥，任何字节都能装）
func writeField(mac hash.Hash, s string) {
	binary.Write(mac, binary.BigEndian, uint32(len(s)))
	mac.Write([]byte(s))
}

// 方案二：固定顺序 + 字段不可能出现的分隔符（要严格校验字段内容）
canonical := strings.Join([]string{userID, action, amount}, "\n")
```

方案二在字段可能包含换行时就废了，所以能用方案一就用方案一。

## 7.2 一个完整的签名 / 验签实现

```go
type Signer struct {
	keyID  string
	secret []byte
}

// canonical 构造带长度前缀的规范化串，杜绝拼接歧义
func canonical(method, path, ts, nonce string, body []byte) []byte {
	var buf bytes.Buffer
	for _, f := range [][]byte{
		[]byte(method), []byte(path), []byte(ts), []byte(nonce), body,
	} {
		binary.Write(&buf, binary.BigEndian, uint32(len(f)))
		buf.Write(f)
	}
	return buf.Bytes()
}

func (s *Signer) Sign(method, path string, body []byte) http.Header {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	nonce := make([]byte, 16)
	rand.Read(nonce)
	nonceHex := hex.EncodeToString(nonce)

	mac := hmac.New(sha256.New, s.secret)
	mac.Write(canonical(method, path, ts, nonceHex, body))

	h := http.Header{}
	h.Set("X-Key-Id", s.keyID)
	h.Set("X-Timestamp", ts)
	h.Set("X-Nonce", nonceHex)
	h.Set("X-Signature", hex.EncodeToString(mac.Sum(nil)))
	return h
}

func Verify(r *http.Request, body []byte, lookup func(keyID string) []byte) error {
	ts := r.Header.Get("X-Timestamp")
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return errBadRequest
	}

	// 1. 先卡时间窗，把重放的成本压到 5 分钟内
	if d := time.Since(time.Unix(sec, 0)); d > 5*time.Minute || d < -5*time.Minute {
		return errExpired
	}

	// 2. 查密钥；查不到也用假密钥走完全程，避免泄露 keyID 是否存在
	secret := lookup(r.Header.Get("X-Key-Id"))
	valid := secret != nil
	if !valid {
		secret = dummySecret
	}

	// 3. 算 HMAC
	nonce := r.Header.Get("X-Nonce")
	mac := hmac.New(sha256.New, secret)
	mac.Write(canonical(r.Method, r.URL.Path, ts, nonce, body))

	// 4. 常数时间比较
	got, err := hex.DecodeString(r.Header.Get("X-Signature"))
	if err != nil || !hmac.Equal(mac.Sum(nil), got) || !valid {
		return errInvalidSignature
	}

	// 5. nonce 查重，彻底堵死时间窗内的重放（Redis SETNX，TTL 略大于时间窗）
	if !nonceStore.SetNX(nonce, 6*time.Minute) {
		return errReplay
	}
	return nil
}
```

## 7.3 签名 checklist

- [ ] 用 HMAC，不用 `hash(secret + msg)`
- [ ] 密钥 32 字节 CSPRNG 随机，不是"公司名 + 年份"
- [ ] 规范化串带长度前缀或严格分隔符，杜绝拼接歧义
- [ ] body 参与签名（只签 URL 等于没签 POST）
- [ ] HTTP method 和 path 参与签名（否则 GET 签名可以拿去当 DELETE 用）
- [ ] 带时间戳 + 时间窗校验
- [ ] 带 nonce + 服务端查重（防时间窗内重放）
- [ ] 用 `hmac.Equal` 之类的常数时间比较
- [ ] 先验签、再解析 body
- [ ] 密钥能轮换：带 key ID，允许新旧密钥并存一段时间
- [ ] 失败时不要在错误信息里回显期望的签名值

# 8. 常见误区速查

| 说法 | 实际情况 |
| --- | --- |
| "HMAC 加密" | HMAC 不是加密，不可逆，不提供机密性 |
| "SHA-256 够安全了，不用 HMAC" | 安全的是算法，不安全的是"没有密钥"这件事 |
| "加了盐就不用 HMAC 了" | 盐防彩虹表，HMAC 防伪造，两码事 |
| "HMAC 太慢了" | 短消息 2 倍、长消息几乎无差；固定开销三次压缩函数 |
| "密钥越长越安全" | 超过 64 字节会被先哈希，32 字节随机数就够 |
| "盐要保密" | 盐是公开的，和摘要存一起；要保密的是 pepper 和密钥 |
| "用 HMAC 存密码更安全" | 反了，存密码要的是慢，用 Argon2id |
| "MD5 破了所以 HMAC-MD5 也不能用" | HMAC 安全性不依赖抗碰撞，HMAC-MD5 至今未被实用攻破；但新系统别用 |
| "时序攻击太理论了" | 上表的信号单调且干净；修它只要改一行 |
| "`==` 比较哈希没问题" | 短路比较泄露公共前缀长度，用常数时间比较 |
| "签名了就不会被重放" | 签名保证没被改，不保证没被重发；要靠时间戳 + nonce |
| "HMAC 能当证据" | 不能，双方共享密钥，验证方也能伪造；要不可否认性用 Ed25519 |

# 小结

回到开头那行代码。`sha256.Sum256([]byte(secret + payload))` 的问题不在 SHA-256，在密钥和消息的组合方式：Merkle-Damgård 结构把内部状态原样吐了出来，于是"知道摘要"就等于"能接着往下算"。HMAC 用两层嵌套堵住了这个口子，代价是三次额外的压缩函数调用，短消息慢一倍多，长消息几乎无差。

再往外一圈，密钥、盐、pepper 各管各的事：密钥防伪造，盐防批量爆破，pepper 防单点拖库。存密码时"快"从优点变成缺点，得换成 Argon2id 那种故意慢下来的算法。而就算前面全算对了，最后一步用 `==` 比较，秘密还是能从时间里漏出去。

真要浓缩成三条能贴在工位上的：有密钥就用 HMAC，别自己拼 `hash(key + msg)`；存密码用 Argon2id 加每用户随机盐，别用任何"快"的哈希；比较 MAC 一律走常数时间函数，`hmac.Equal` / `compare_digest` / `hash_equals` 随便挑一个。

# 参考

https://www.rfc-editor.org/rfc/rfc2104

https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

https://www.rfc-editor.org/rfc/rfc9106.html

https://pkg.go.dev/crypto/hmac

https://pkg.go.dev/crypto/subtle

https://docs.python.org/3/library/hmac.html

https://en.wikipedia.org/wiki/Length_extension_attack

https://github.com/iagox86/hash_extender

https://shattered.io/

时序攻击的可行性数据来自 Crosby、Wallach、Riedi 的 [*Opportunities and Limits of Remote Timing Attacks*](https://www.cs.rice.edu/~dwallach/pub/crosby-timing2009.pdf)（ACM TISSEC, 2009）。文中所有 benchmark 均在 Apple M2 / Go 1.26.5 上实测，数据会随硬件和版本浮动，绝对值仅供参考，重要的是量级关系。
