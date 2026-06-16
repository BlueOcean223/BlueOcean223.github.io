---
title: Go语言学习
date: 2025-03-16 14:41:37
tags:
cover: /img/BB1msIAu.jpg
categories:
- 笔记
---
# 变量

## 变量定义

```go
// 自动推断
var b = 22

//显式声明
var name string = "haha"
var a int = 1

//简短声明,Go会自动推断类型
a := 1

//同时声明多个变量
var a,b = 1,"hello"
a,b := 1,"hello"
var a,b,c int = 1,2,3

//匿名变量
var _ = 1
```

var为go中定义变量的固定关键字，当然也可以使用简短声明符：来声明变量。而变量的类型可以不指出。

go中声明的变量必须使用，不然会报错



go中的匿名变量不占用空间，不分配内存。任何赋给它的值都会被抛弃，因此不能在后续的代码中使用。并且匿名变量可以多次声明，甚至可以同时声明。表示符为  _

```go
//go中的函数可以直接返回多个值，匿名变量也常用于占位接收那些暂时用不到的返回值

func text()(int,int,int){
	return 1,2,3
}

func main(){
	a,_,_ = text()
}
```



## 交换变量

```go
var a,b int = 1,2
a,b = b,a
```

go中交换变量非常简单，不需要借助中间变量或者调用函数



## 变量类型

### 常量

``` go
// 声明常量
const a = 1
```

特殊常量  **iota**

iota是go语言的常量计数器。在const关键字出现时被置为0，每次新增一个const将使iota技术一次。即使没有使用。



### 布尔

``` go
var ok bool = true
```



### 数字类型

```go
var a int = 1
// 此外还有 int8 int 16 int32 int64 表示几位的整型
// uint为无符号整型，同样可以控制二进制位数
// 此外还有 byte rune uintptr 等类型

var c float32 = 1
var c float64 = 2
// go中没有 double 类型，float64 相当于是双精度浮点数 double
```



### 字符类型

```go
var str string = "haha"

// go中同样可以用 + 号拼接字符串，如：
str += "xixi"

var c = 'A'
// go中没有char类型，实际上上面的c为int32类型，即通过ASCII码来映射字符
```



go中的string类型与Java相同，是不可改的。如果想操作字符串，则需要转换类型

```go
s := "hello sysu"
tmp := []byte(s)
tmp[0] = 'a'
newStr = string(tmp)

// s=hello sysu
// newStr=aello sysu
```







**go语言中不支持隐式类型转换，需要类型转换时，必须显示转换**

```go
a := 1
b := 2.0

b = (int)a
```

由于不支持隐式类型转换，因此go语言中，不支持int类型和bool类型的混合运算，必须转换至同一类型才能够进行运算



## 位运算符

go中的关系运算符，算术运算符，逻辑运算符，赋值运算符都与c++，java一致。

```go
// 按位清除
&^

a := 60   //111100
b := 13   //001101

c := a&^b //110000   //48

// 其他的 & , | , ^ , <<, >> 与其它语言一致
```

按位清除的运算规则：

- 如果第二个操作数的某一位是1，那么结果中的对应位会被清除为0。

- 如果第二个操作数的某一位是0，那么结果中的对应位会保留第一个操作数的值。



## 输入与输出

```go
// go中fmt包内具有输入输出的函数
// 输出
fmt.Println()   // 打印换行
fmt.Print()     // 打印
fmt.Printf()    // 格式化打印

// 输出
fmt.Scanf()
fmt.Scanln()
fmt.Scan()
// fmt.Scanln(&x,&y)
```



## 指针

```go
// go中的指针，声明方式，使用方式都与c语言类似
var ptr *int = &a

// go中的空为 nil ，而非null
ptr = nil
```

- go中的指针为了安全性和简化语言，不支持指针运算（如：ptr++）
- go中具有垃圾回收机制，不需要手动释放指针



#   流程控制

```go
// go中的if else语句不用小括号
if a>0 {
    fmt.Println("haha")
}

// go中的if else语句还支持在语句中赋值，再判断
if a,ok := hash[i];ok{
    // 如果ok为true，则会进入
    ·····
}

// switch
switch val {
case val1:
case val2:
default:
}
```

go语言中，case语句会自动防穿透，不需要像c++那样显式break结束。

使用 `fallthrough` 可以实现贯穿效果，无论下一个case条件是否满足，都会强制执行。



```go
// for循环
for i:=0; i<len(nums); i++ {
    
}
// 或者类似于while
i:=0
for i<10 {
    i++
}
```

go语言中没有while关键字。break，continue功能一致



# 数组

```go
// 一维数组
var arr [5]int

arr := [5]int{1,2,3,4,5}
arr := []int{1,2,3,4,5}

// 遍历方式
for i:=0;i<len(nums);i++{}
// 或者
for index,val := range nums{}

//多维数组
var matrix [2][3]int

matrix := [2][3]int{ {1,2,3},{4,5,6},}

// 动态添加元素
arr = append(arr,3)
```



## 切片操作

go中的数组也支持切片操作

```go
arr := [5]int{1,2,3,4,5}
lmt.Println(arr[1:4])
// 输出2，3，4    切片范围为左闭右开
```



# 函数

```go
// go语言函数定义格式如下
func name([parameter list]) [return_type]{}

// go语言中，函数参数是先参数，再类型
func text(a int){}

//特别的，go语言支持有多个返回值，例如：
func text()(int,int){
    return 100,200
}

// 可变参数
func text(nums ...int){}
// ...int 代表可变参数，可以接收任意个参数，但是可变参数必须是最后一个参数

// 提前确定返回变量
func add(a,b int)(sum int){
    if a <= 1 {
        return 0   // 相当于把0赋值给sum
    }
    sum = a + b
    return
}
```



关键字defer，可用于延迟函数的执行

```go
func text1(){
    fmt.Println("hehe")
}
func text2(){
    fmt.Println("xixi")
}
func main(){
    defer text1()
    text2()
}
// 程序会先执行text2（），再执行text1（）
```

如果有多个defer，则可以把他们当作栈的结构，先进的后出，后进的先出



go中的函数也是一个变量，可以进行赋值。可以将函数看作一个指针

```go
func f1(a,b int){
    fmt.Println("haha")
}
func main(){
    var f2 = func(int,int)
    f2 = f1
}
```



## 匿名函数

```go
// 不带名字的函数即为匿名函数
func(){
    fmt.Println("hello")
}

// 可以类似于lambda表达式进行函数赋值
f1 := func(a int){
    fmt.Println(a)
}

// 可以在函数后加上（），表示立即执行
func(){
    fmt.Print("haha")
}()
// 同样可以进行赋值，初始化等
a := func() int{
    return 1
}()
```



## 函数式编程

go语言中，函数可以作为参数进行传参

```go
func main(){
    fmt.Println(oper(1,2,add))
}
func add(a,b int) int {
    return a+b
}
func oper(a,b int,f func(int,int) int) int {
    return f(a,b)
}
```

其中add被称为回调函数，oper称为高阶函数



# 结构体



## 结构体定义

```go
// 定义方式
type Person struct{
    name string
    Age int
}
// Go中的结构体字段和方法的访问权限由命名方式决定。
// 如果首字母大写，则相当于public，可以在任意包访问
// 如果首字母小写，则相当于private，只能在定义包访问

// 对象的声明方式
// 直接初始化
p := Person{name: "Alice", Age: 30}
// 按字段声明顺序初始化
p := Person{"Alice", 30}
// 使用new关键字
p := new(Person)
// 部分初始化
p := Person{name: "Tom"}  // 未初始化的字段会赋予类型零值
```



go中结构体指针的使用方法跟java类似，不像c和c++那样用 -> 访问。统一用 . 访问字段和方法



## 结构体字段tag

go中支持为结构体字段打tag，使得在不同的数据交互时更加方便，例如：

```go
var newPoll struct {
	Title   string   `json:"title" binding:"required"`
	Type    string   `json:"type" binding:"required"`
	Options []string `json:"options" binding:"required"`
}
```

- json: 用于json数据的序列化和反序列化，进行映射
- binding："required"  表示该字段在请求中是必需的，如果请求中没有该数据，则会返回错误



除了上述的两种标签外，还有其他的常用标签

```go
// xml
Name string `xml:"name"` 

// form
Username string `form:"username"`

// gorm
type User struct {
    ID   uint   `gorm:"primaryKey"`  // 主键
    Name string `gorm:"column:user_name"`  // 数据库列名为 "user_name"
    Age  int    `gorm:"default:18"`  // 默认值为 18
}

// yaml
Host string `yaml:"host"`
```





## 结构体中的方法

- go的结构体没有构造函数。因为go中有垃圾回收机制，因此也没有析构函数
- go的结构体方法分为
  - 值接收者方法，结构体的副本
  - 指针接收者方法，结构体本身

```go
// 值接收者
func (p Person) SayHello(){
    fmt.Println("hello")
}

// 指针接收者
func (p *Person) SetName(name string){
    p.name = name
}
```

- go中没有class关键字，因此结构体的方法通过在函数名前带有结构体对象或指针来区分（类似于py的sef）
- 由于值接收者和指针接收者在方法集上不一致，以及出于安全性考虑，一个结构体的方法最好统一。要么全部都是值接收者，要么全部都是指针接收者



## 接口

```go
// 定义形式
type 接口名 interface {
    方法名1(参数列表) 返回值列表
}

// 示例
type Person interface {
    Speak()
}

type Student struct {
    Name string
    Age string
}

func (st Student) Speak(){
    fmt.Println("haha")
}
```

在go中，接口的继承是隐式的，只要一个类实现了接口中定义的所有方法，就认为这个类实现了该接口，无需显示声明。



# map

```go
var m map[int]string      // 声明
m = make(map[int]string)  // 初始化
m[1] = "Tom"
fmt.Println("m :", m)

// 使用map装载json类型数据
mj := make(map[string]interface{})

// 对于固定类型的数据，不要使用map[string]interface{}，最好使用临时struct。

// map的初始化，类似于json格式
hash := map[byte]int {
    'a':0,
    'b':0
}
```



基于go语言支持多返回值的特性，map的访问会返回两个值

- 第一个返回值时key对应的value，如果不存在，则会返回对应类型的零值
- 第二个返回值为bool类型，为该key是否存在。

```go
m := make(hash[int]int)

m[1]=1
m[2]=2

// 可以只接收一个值，go会自动忽略第二个值
a := m[1]
// 也可以手动忽略第二个值
a,_ := m[1]
// 接收两个值，第二个返回值常常可以用于判断该键是否存在
a,ok := m[0]
```



# 并发编程

并发编程是一种编程范式，它允许程序中的多个任务**看似同时**执行（在单核处理器上是时间分片，在多核处理器上可以真正并行）。Go语言通过goroutine和channel提供了优雅的并发支持。

Go语言使用`go`关键字启动goroutine，而channel用于goroutine间的通信。

## 特点

1. **轻量级线程**：goroutine是轻量级的，由Go运行时管理，比操作系统线程更高效
2. **并发执行**：goroutine会并发执行，不阻塞主程序
3. **简单语法**：只需在函数调用前加`go`关键字即可



## 注意事项

1. **主goroutine退出**：如果主goroutine退出，所有其他goroutine也会立即终止
2. **参数求值**：`go`语句会在当前goroutine中对参数进行求值
3. **返回值**：goroutine中的函数返回值会被忽略，需要通过channel等方式传递结果
4. **调度顺序**：goroutine的**执行顺序是不确定的**

示例：

```go
func sum(s []int, c chan int) {
	sum := 0
	for _, v := range s {
		sum += v
	}
	c <- sum // 将结果发送到channel
}

func main() {
	s := []int{7, 2, 8, -9, 4, 0}
	c := make(chan int)
	go sum(s[:len(s)/2], c)
	go sum(s[len(s)/2:], c)
	x, y := <-c, <-c // 从channel接收
	fmt.Println(x, y, x+y)
}
```

每次接收操作(<-c)都会从channel获取一个新值



channel类型：

- chan<- int：只发送channel
- <-chan int：只接收channel



## 生产者与消费者模型

生产者-消费者模式是并发编程中一种经典的设计模式，用于解决不同执行速度的模块之间的协作问题。

工作流程: 生产者将数据放入缓冲区 -> 消费者从缓冲区取出数据 -> 当缓冲区满时，生产者等待 -> 当缓冲区空时，消费者等待



基础示例：

```go
package main

import (
	"fmt"
	"time"
)

func producer(ch chan<- int) {
	for i := 0; i < 5; i++ {
		fmt.Printf("生产: %d\n", i)
		ch <- i // 发送数据到channel
		time.Sleep(time.Second) // 模拟生产耗时
	}
	close(ch) // 生产完毕，关闭channel
}

func consumer(ch <-chan int) {
	for v := range ch { // 循环读取channel直到关闭
		fmt.Printf("消费: %d\n", v)
		time.Sleep(2 * time.Second) // 模拟消费耗时
	}
}

func main() {
	ch := make(chan int, 3) // 带缓冲的channel，容量为3
	
	go producer(ch)
	consumer(ch)
}
```

关闭channel：只有发送方可以关闭channel，关闭后接收方仍可读取剩余数据。for range会在channel关闭后自动退出。



### 实际应用场景

1. 日志处理系统（生产者生成日志，消费者处理日志）
2. 消息队列系统
3. 任务分发系统
4. 数据流水线处理



# Gin框架

go语言开发后端可以选择gin框架进行开发

``` go
// 使用go get命令安装Gin框架
go get -u github.com/gin-gonic/gin

// 并且需要导入相应包
import "github.com/gin-gonic/gin"
```



## 入门程序

```go
package main

import "github.com/gin-gonic/gin"

func main() {
	// 创建一个新的Gin路由器
	r := gin.Default()

	// 定义一个简单的GET路由
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Hello Golang",
		})
	})

	// 启动HTTP服务器，监听8080端口
	err := r.Run(":8080")
	if err != nil {
		return
	}
}
```

- ``c.JSON``返回一个JSON格式的响应
- ``gin.H``是一种快捷方式，用于创建一个``map[string]interface{}``的JSON数据



除了``c.JSON``外，还有其他的响应格式向前端返回数据

```go
// 返回字符串格式
c.String(200, "Hello Golang")

// 返回HTML格式
c.HTML(200, "index.html", gin.H{
    "title": "Home Page",
})

// 返回XML格式
c.XML(200, gin.H{
    "message": "Hello Golang",
})

// 返回文件
c.File("path/to/file.txt")

// 重定向
c.Redirect(301, "/new-location")

// 返回流式响应
c.Stream(func(w io.Writer) bool {
    fmt.Fprintf(w, "Chunk of data\n")
    return true // 继续发送
})
```



## 接收前端发送的数据

```go
// 接收JSON数据
c.ShouldBindJSON(&user)

// 接收表单数据 使用 PostForm 或 ShouldBind 
name := c.PostForm("name")
email := c.PostForm("email")

c.ShouldBind(&user)

// 接收查询参数 使用 Query 或 DefaultQuery
// 形如：https://example.com/user?name=John&age=30
name := c.Query("name")
email := c.DefaultQuery("email", "default@example.com")

// 接收路径参数
// 形如：https://example.com/user/{id}
name := c.Param("id")

// 接收文件
file, err := c.FormFile("file")
if err != nil {
	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
    return
}
```



## 中间件

### Logger

用于记录请求的相关日志信息

```go
r := gin.New()
r.Use(gin.Logger())
```

- 记录每个请求的路径、方法、处理时间等信息。

- 可以记录请求的状态码和响应时间，方便开发者分析请求的性能和错误。

- 有助于监控和调试，尤其是在生产环境中，查看请求日志可以帮助诊断问题。



### Recovery

用于捕获运行时的panic错误，防止程序崩溃

```go
r := gin.New()
r.Use(gin.Recovery())
```

- 当程序发生panic时，`Recovery`中间件会捕获异常并防止应用崩溃。

- 可以记录panic的错误信息，并恢复到正常的执行流程，通常会返回一个500的服务器错误响应。

- 在生产环境中，使用Recovery中间件可以保证即使出现错误，服务仍然可以继续运行。



### 自定义中间件

Gin框架中提供了非常方便的自定义中间件形式

```go
func MyLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		fmt.Println("Request received")
		c.Next()
	}
}
```

其中``c.Next()``是用来通知框架继续执行后续中间件的。它的作用是让请求处理流程继续向下传递



## 连接数据库

### 标准库 database/sql 

连接数据库

```go
import (
	"database/sql"

	"github.com/go-sql-driver/mysql"
)

func main() {
	// 构造 DSN（Data Source Name）
	dsn := "user:password@tcp(127.0.0.1:3306)/dbname？charset=utf8&parseTime=True&loc=Local"

	// 连接数据库
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	// 检查连接是否正常
	if err := db.Ping(); err != nil {
		log.Fatalf("数据库 ping 失败: %v", err)
	}
	defer db.Close()
}
```

增删改查

```go
// 查询
rows, err := db.Query("SELECT id, name FROM users WHERE age = ? AND city = ?", age, city)
if err != nil {
    log.Fatal(err)
}
defer rows.Close()

var users []map[string]interface{}
for rows.Next() {
    var id int
    var name string
    // 使用 rows.Scan 扫描一行数据
    err := rows.Scan(&id, &name)
    if err != nil {
        log.Fatal(err)
    }
    users = append(users, map[string]interface{}{"id": id, "name": name})
}
```

- `rows.Next()` 会遍历结果集中的每一行。
- `rows.Scan` 用来扫描查询结果的一行数据，并将数据填充到 Go 变量中。



查询数据使用`Query`方法，需要返回数据。增删改使用`Exec`方法，适用于没有返回结果的SQL语句

```go
// 插入
_, err := db.Exec("INSERT INTO users (name, age, city) VALUES (?, ?, ?)", "Alice", 25, "Shanghai")
if err != nil {
    log.Fatal(err)
}

// 更新
_, err := db.Exec("UPDATE users SET name = ? WHERE id = ?", "Bob", 1)

// 删除
_, err := db.Exec("DELETE FROM users WHERE id = ?", 1)
```



### GORM

```go
// 使用GORM前，需要先安装GORM及对应的数据库驱动
go get -u gorm.io/gorm
go get -u gorm.io/driver/mysql
```



连接示例

```go
package main

import (
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type User struct {
	ID   uint   `gorm:"primaryKey"`
	Name string `gorm:"size:255"`
}

func main() {
	// 构造 DSN
	dsn := "user:password@tcp(127.0.0.1:3306)/dbname?charset=utf8mb4&parseTime=True&loc=Local"
	// 连接数据库
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}

	// 自动迁移（可选）
	db.AutoMigrate(&User{})
}
```

`db.AutoMigrate(&User{})`用于自动创建一个与User结构相同的数据库表



增删改查

```go
// 查询，结果填充到users中
var users []User
result := db.Where("age = ? AND city = ?", 30, "Shanghai").Find(&users)

if result.Error != nil {
    log.Fatal(result.Error)
}

// 插入
user := User{Name: "Alice", Age: 25, City: "Shanghai"}
result := db.Create(&user)

// 更新
result := db.Model(&User{}).Where("id = ?", 1).Update("name", "Bob")
// db.Model(&User{}) 指定操作的目标模型是	User

// 删除
result := db.Where("id = ?", 1).Delete(&User{})
```



GROM中，指定SQL语句操作的数据库表

1. 默认命名规则

**默认映射规则**：如果没有额外配置，GORM 会将结构体名称转换成小写，并自动加上复数形式作为表名。例如：如果你的结构体名称是 `User`，默认对应的表名会是 `users`

2. 自定义表名,实现`TableName()`方法

```go
type User struct {
    ID   uint
    Name string
}

// 明确指定 User 模型对应的表名为 "user"
func (User) TableName() string {
    return "user"
}
```

3. 使用`db.Table`方法

```go
// 明确指定查询 user 表的数据
result := db.Table("user").Find(&users)
```





### 原生SQL与GORM对比

| 特性           | GORM                      | 原生 SQL             |
| :------------- | :------------------------ | :------------------- |
| **开发效率**   | 高（自动生成 SQL）        | 低（需要手写 SQL）   |
| **代码可读性** | 高（结构体和方法调用）    | 低（SQL 字符串拼接） |
| **灵活性**     | 中等（受限于 ORM 功能）   | 高（完全控制 SQL）   |
| **学习成本**   | 中等（需要学习 GORM API） | 低（直接使用 SQL）   |
| **适用场景**   | 快速开发、中小型项目      | 复杂查询、高性能场景 |



## 连接Redis

通常使用go-redis来连接Redis

```go
package main

import (
	"context"
	"github.com/go-redis/redis/v8"
)

var ctx = context.Background()

func main() {
	// 创建 Redis 客户端
	rdb := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "", 
		DB:       0,  // 默认数据库
	})

	// 检查连接
	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Redis 连接失败: %v", err)
	}
}
```



## 统一管理连接信息

在Gin框架中同样可以使用配置文件的方式来统一管理连接信息，便于维护



yml文件

```yaml
database:
  mysql:
    dsn: "username:password@tcp(127.0.0.1:3306)/dbname?charset=utf8mb4&parseTime=True&loc=Local"
  redis:
    addr: "localhost:6379"
    password: ""
    db: 0
```



读取配置文件的代码，需要使用`viper`库

```go
// 导入viper库
go get github.com/spf13/viper
```



confg包

```go
package config

import (
    "github.com/spf13/viper"
    "log"
)

func InitConfig() {
    viper.SetConfigName("config") // 配置文件名称（无扩展名）
    viper.SetConfigType("yml")   // 配置文件类型
    viper.AddConfigPath(".")     // 配置文件路径
    if err := viper.ReadInConfig(); err != nil {
        log.Fatalf("Error reading config file: %v", err)
    }
}

func GetMySQLDSN() string {
    return viper.GetString("database.mysql.dsn")
}

func GetRedisConfig() (string, string, int) {
    return viper.GetString("database.redis.addr"),
           viper.GetString("database.redis.password"),
           viper.GetInt("database.redis.db")
}
```



database包

```go
package database

import (
    "gorm.io/driver/mysql"
    "gorm.io/gorm"
    "github.com/go-redis/redis/v8"
    "context"
    "log"
)

var (
    DB  *gorm.DB
    RDB *redis.Client
)

func InitMySQL(dsn string) {
    var err error
    DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
    if err != nil {
        log.Fatalf("Failed to connect to MySQL: %v", err)
    }
    log.Println("Connected to MySQL!")
}

func InitRedis(addr, password string, db int) {
    RDB = redis.NewClient(&redis.Options{
        Addr:     addr,
        Password: password,
        DB:       db,
    })

    ctx := context.Background()
    _, err := RDB.Ping(ctx).Result()
    if err != nil {
        log.Fatalf("Failed to connect to Redis: %v", err)
    }
    log.Println("Connected to Redis!")
}
```



主函数

```go
package main

import (
    "github.com/gin-gonic/gin"
    "your_project/config"
    "your_project/database"
    "your_project/handlers"
)

func main() {
    // 初始化配置
    config.InitConfig()

    // 初始化数据库连接
    database.InitMySQL(config.GetMySQLDSN())
    database.InitRedis(config.GetRedisConfig())

    // 创建 Gin 实例
    r := gin.Default()

    // 注入数据库连接到路由或服务层
    handlers.InitHandlers(r, database.DB, database.RDB)

    // 启动服务
    r.Run(":8080")
}
```



