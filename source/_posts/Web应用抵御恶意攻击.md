---
title: Web应用抵御恶意攻击
date: 2025-08-15 17:23:25
tags:
cover: https://blueocean223.github.io/auto-music/img/gopher2.png
categories:
- 分享
---

# 前言
作为一个开发者，想必或多或少都有过开发Web的经历。Web应用由于其开放性和易用性，成为了攻击者的主要目标之一。常见的攻击方式包括SQL注入、跨站脚本（XSS）、跨站请求伪造（CSRF）等。恶意攻击可能会造成敏感数据泄露、服务崩溃等问题。最近，博主部署的Web应用就遭到了恶意攻击，并且还造成了`panic`异常，导致后端服务崩溃重启了。


# 攻击记录
以下是部分攻击记录
```log
[GIN] 2025/08/05 - 17:24:59 | 401 |      38.121µs |  43.129.179.168 | GET      "/1/site/content_store/item?url=%3Cscript%20xmlns%3D%22http%3A//www.w3.org/1999/xhtml%22%3Ealert(document.domain)%3C/script%3E"

[GIN] 2025/08/05 - 17:25:34 | 401 |      75.863µs |  43.129.179.168 | POST     "/v1/chart/data"

[GIN] 2025/08/05 - 17:25:53 | 401 |      40.156µs |  43.129.179.168 | GET      "/jobs/Job_PncsmN/logs"

[GIN] 2025/08/05 - 17:34:06 | 401 |      42.429µs |  43.129.179.168 | POST     "/v2/templates/"

[GIN] 2025/08/05 - 17:36:09 | 401 |      37.249µs |  43.129.179.168 | POST     "/v2/observables/extended"

[GIN] 2025/08/05 - 17:38:12 | 401 |      35.597µs |  43.129.179.168 | POST     "/v2/templates/render"

[GIN] 2025/08/05 - 18:02:20 | 500 |      4.4609ms |  43.129.179.168 | GET      "/v3/user/orgs"

2025/08/05 18:02:20 [Recovery] 2025/08/05 - 18:02:20 panic recovered:

GET /v3/user/orgs HTTP/1.0

Host: 101.34.246.32

Accept: */*

Accept-Encoding: gzip

Accept-Language: en

Authorization: *

Connection: close

User-Agent: Mozilla/5.0 (SS; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36

X-Forwarded-For: 43.129.179.168

X-Forwarded-Proto: http

X-Real-Ip: 43.129.179.168

runtime error: invalid memory address or nil pointer dereference

/usr/local/go/src/runtime/panic.go:262 (0x472898)

/usr/local/go/src/runtime/signal_unix.go:925 (0x472868)

/app/utils/jwt/jwt.go:42 (0xa13f11)

/app/utils/jwt/jwt.go:68 (0xa37904)

/go/pkg/mod/github.com/gin-gonic/gin@v1.10.0/context.go:185 (0xa068ee)

/go/pkg/mod/github.com/gin-gonic/gin@v1.10.0/recovery.go:102 (0xa068db)

/go/pkg/mod/github.com/gin-gonic/gin@v1.10.0/context.go:185 (0xa05a24)

/go/pkg/mod/github.com/gin-gonic/gin@v1.10.0/logger.go:249 (0xa05a0b)

/go/pkg/mod/github.com/gin-gonic/gin@v1.10.0/context.go:185 (0xa04f0a)

/go/pkg/mod/github.com/gin-gonic/gin@v1.10.0/gin.go:677 (0xa04ef7)

/go/pkg/mod/github.com/gin-gonic/gin@v1.10.0/gin.go:670 (0xa04a84)

/go/pkg/mod/github.com/gin-gonic/gin@v1.10.0/gin.go:589 (0xa04549)

/usr/local/go/src/net/http/server.go:3301 (0x6c3c6d)

/usr/local/go/src/net/http/server.go:2102 (0x6a5624)

/usr/local/go/src/runtime/asm_amd64.s:1700 (0x478180)
```

可以看到，攻击者尝试通过`<script>alert(document.domain)</script>`这样的脚本来进行XSS攻击以及多种API端点的探测。虽然应用已经做了基本的安全防护，但还是出现了`panic`异常，导致服务崩溃。

# 防御措施

## 代码安全性检查
首先是要检查代码中是否存在安全漏洞。例如下面的代码片段，为博主之前的JWT校验代码
```go
// ParseToken 解析并验证JWT令牌
func ParseToken(tokenString string) (*CustomClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		return JWTKey, nil
	})

	if claims, ok := token.Claims.(*CustomClaims); ok && token.Valid {
		return claims, nil
	} else {
		return nil, err
	}
}
```

可以看到，这个JWT校验代码防御性不足，而且有未处理的错误以及token指针可能为空。可能会造成空指针引用而导致`panic`

修改后的代码如下
```go
// ParseToken 解析并验证JWT令牌
func ParseToken(tokenString string) (*CustomClaims, error) {
	if tokenString == "" {
		return nil, errors.New("token不能为空")
	}
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		// 校验签名方法是否正确
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("意外的签名方法: %v", token.Header["alg"])
		}
		return JWTKey, nil
	})

	if err != nil {
		return nil, err
	}
	// 防止token为空，触发panic
	if token == nil {
		return nil, errors.New("无效的token")
	}

	if claims, ok := token.Claims.(*CustomClaims); ok && token.Valid {
		return claims, nil
	} else {
		return nil, errors.New("无效的token")
	}
}
```


## 添加安全中间件
还可以通过添加安全中间件来抵御恶意攻击。例如手动排除一些可疑路径、检查XSS攻击和限制访问频率等。
```go
// 请求频率限制
var (
	ipRequestCount = make(map[string][]time.Time)
	ipMutex        = sync.RWMutex{}
	maxRequests    = 100 // 每分钟最大请求数
	timeWindow     = time.Minute
)

// SecurityMiddleware 安全中间件
func SecurityMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 检查可疑路径
		path := c.Request.URL.Path
		if isSuspiciousPath(path) {
			log.Printf("可疑路径访问 - IP: %s, Path: %s, UA: %s", 
				c.ClientIP(), path, c.GetHeader("User-Agent"))
			c.JSON(http.StatusNotFound, gin.H{"error": "路径不存在"})
			c.Abort()
			return
		}

		// 检查XSS攻击
		if containsXSS(c.Request.URL.RawQuery) {
			log.Printf("XSS攻击尝试 - IP: %s, Query: %s", 
				c.ClientIP(), c.Request.URL.RawQuery)
			c.JSON(http.StatusBadRequest, gin.H{"error": "请求被拒绝"})
			c.Abort()
			return
		}

		// 设置安全头
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

		c.Next()
	}
}

// RateLimitMiddleware 频率限制中间件
func RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		
		ipMutex.Lock()
		now := time.Now()
		
		// 清理过期记录
		if requests, exists := ipRequestCount[ip]; exists {
			var validRequests []time.Time
			for _, reqTime := range requests {
				if now.Sub(reqTime) < timeWindow {
					validRequests = append(validRequests, reqTime)
				}
			}
			ipRequestCount[ip] = validRequests
		}
		
		// 检查请求频率
		if len(ipRequestCount[ip]) >= maxRequests {
			ipMutex.Unlock()
			log.Printf("频率限制触发 - IP: %s, 请求数: %d", ip, len(ipRequestCount[ip]))
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "请求过于频繁"})
			c.Abort()
			return
		}
		
		// 记录当前请求
		ipRequestCount[ip] = append(ipRequestCount[ip], now)
		ipMutex.Unlock()
		
		c.Next()
	}
}

// 检查可疑路径
func isSuspiciousPath(path string) bool {
	suspiciousPaths := []string{
		"/v1/", "/v2/", "/v3/", "/api/v",
		"/admin", "/wp-admin", "/phpmyadmin",
		"/jobs/", "/chart/", "/templates/",
		"/site/content_store", "/observables",
		"/.env", "/config", "/.git",
	}
	
	for _, suspicious := range suspiciousPaths {
		if strings.Contains(path, suspicious) {
			return true
		}
	}
	return false
}

// 检查XSS攻击
func containsXSS(query string) bool {
	xssPatterns := []string{
		"<script", "</script>", "javascript:",
		"alert(", "document.domain", "eval(",
		"onload=", "onerror=", "onclick=",
	}
	
	queryLower := strings.ToLower(query)
	for _, pattern := range xssPatterns {
		if strings.Contains(queryLower, pattern) {
			return true
		}
	}
	return false
}
```

# 结语
Web应用的安全问题是一个值得重视的问题，因为我们不仅需要保证服务的稳定运行，更需要保护每个使用我们应用的用户的隐私安全。