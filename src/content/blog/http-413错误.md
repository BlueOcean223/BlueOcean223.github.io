---
title: http 413错误
pubDate: 2025-07-04T23:38:43.000Z
tags: []
---

博主最近在开发自己项目的文件相关模块。在部署到docker，前后端交互测试时，提示文件上传异常，遇到了413错误。错误信息：`Request failed with status code 413`

这个错误 `Request failed with status code 413` 是 HTTP 协议中的一个状态码，表示 ​`​Payload Too Large`（请求实体过大）。发生该错误的原因通常是Web服务器（如Nginx）或后端服务对请求大小做了限制，而这次请求的负载超过了限制。

解决方法：
- 对于过大的文件选用分块上传方案，以及限制用户上传文件大小、数量。
- 调整Web服务器或后端服务对请求大小限制。

## Web服务器


- Nginx：修改 client_max_body_size（默认1MB）：

```nginx
http {
  client_max_body_size 10M;  # 例如限制为10MB
}
```

## 后端

- Spring Boot：在application.properties中添加配置：
```properties
spring.servlet.multipart.max-file-size=10MB
spring.servlet.multipart.max-request-size=10MB
```

- Gin框架：添加限制中间件
```go
func main() {
    r := gin.Default()

    // 限制所有请求体
    r.Use(func(c *gin.Context){
        c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 10<<20) // 10MB
        c.Next()
    })

    // 或者限制单个路由
    r.POST("/upload", func(c *gin.Context) {
        c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 10<<20)
    })
}
```

调整服务器与后端服务的请求体大小限制后，就可以正常上传文件了
