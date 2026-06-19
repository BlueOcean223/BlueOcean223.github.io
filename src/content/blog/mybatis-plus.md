---
title: mybatis-plus
pubDate: 2025-03-31T15:40:51.000Z
tags: []
---

Mybatisplus特性：

- **无侵入**：只做增强不做改变，引入它不会对现有工程产生影响，如丝般顺滑
- **损耗小**：启动即会自动注入基本 CURD，性能基本无损耗，直接面向对象操作
- **强大的 CRUD 操作**：内置通用 Mapper、通用 Service，仅仅通过少量配置即可实现单表大部分 CRUD 操作，更有强大的条件构造器，满足各类使用需求
- **支持 Lambda 形式调用**：通过 Lambda 表达式，方便的编写各类查询条件，无需再担心字段写错
- **支持主键自动生成**：支持多达 4 种主键策略（内含分布式唯一 ID 生成器 - Sequence），可自由配置，完美解决主键问题
- **支持 ActiveRecord 模式**：支持 ActiveRecord 形式调用，实体类只需继承 Model 类即可进行强大的 CRUD 操作
- **支持自定义全局通用操作**：支持全局通用方法注入（ Write once, use anywhere ）
- **内置代码生成器**：采用代码或者 Maven 插件可快速生成 Mapper 、 Model 、 Service 、 Controller 层代码，支持模板引擎，更有超多自定义配置等您来使用
- **内置分页插件**：基于 MyBatis 物理分页，开发者无需关心具体操作，配置好插件之后，写分页等同于普通 List 查询
- **分页插件支持多种数据库**：支持 MySQL、MariaDB、Oracle、DB2、H2、HSQL、SQLite、Postgre、SQLServer 等多种数据库
- **内置性能分析插件**：可输出 SQL 语句以及其执行时间，建议开发测试时启用该功能，能快速揪出慢查询
- **内置全局拦截插件**：提供全表 delete 、 update 操作智能分析阻断，也可自定义拦截规则，预防误操作



官方文档：https://baomidou.com/




# 快速开始

引入依赖：

```xml
<dependency>
	<groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-boot-starter</artifactId>
    <version>3.5.11</version>
</dependency>
```

注意：mybatis和mybatis-plus的依赖最好不要一起引入，不然可能造成重复依赖



在Spring Boot启动类中添加`@MapperScan`注解，扫描Mapper文件，路径为Mapper文件的路径

```java
@SpringBootApplication
@MapperScan("com.baomidou.mybatisplus.samples.quickstart.mapper")
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```



编写与数据库表对应的实体类

```java
@Data
@TableName("`user`") //指定操作的表
public class User {
    private Long id;
    private String name;
    private Integer age;
    private String email;
}
```



编写Mapper层接口

```java
public interface UserMapper extends BaseMapper<User> {
}
```

接下来便可以直接开始使用了!

如果Mybatis-plus提供的CRUD代码不能满足业务需求，还可以在Mapper层接口中自行添加新的功能，拓展性强。节约了写基础的CRUD代码的时间。



# 分布式系统的全局唯一id

mybatis-plus中，采用**雪花算法**生成全局唯一id。

雪花算法：snowflake是Twitter开源的分布式ID生成算法，结果是一个Long型的ID。其核心思想是：使用41bit作为毫秒数，10bit作为机器的ID（5个bit是数据中心，5个bit的机器ID），12bit作为毫秒内的流水号（意味着每个结点在每毫秒可以产生4096个ID），最后还有一个符号位，永远是0。可以保证几乎全球唯一



此外，mybatis-plus也支持其他的id生成策略

```java
public enum IdType{
    AUTO(0), //数据库id自增
    NONE(1), //未设置主键
    INPUT(2),// 手动输入
    ID_WORKER(3), //默认的雪花算法
    UUID(4), // uuid
    ID_WORKER_STR(5); //雪花算法的字符串表示法
}
```



只需要在实体类的字段上添加注释即可

```java
public class User{
    @TableId(type=IdType.AUTO)
    private Long id;
    private String name;
    .....
}
```



# 自动填充字段

实际项目开发中，数据库表基本要带上create_time,update_time等基本字段，因为是每张表都有的字段，因此可以在代码层配置自动填充。



在实体类字段使用`@TableField`注释来标记哪些字段需要自动填充

```java
public class User {
    @TableField(fill = FieldFill.INSERT)
    private String createTime;

    @TableField(fill = FieldFill.UPDATE)
    private String updateTime;

    // 其他字段...
}
```



创建一个类来实现`MetaObjectHandler`接口，并重写`insertFill`和`updateFill`方法

```java
@Slf4j
@Component  // 交给Springboot管理 也可以是@Bean注释
public class MyMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        log.info("开始插入填充...");
        this.strictInsertFill(metaObject, "createUserId", Long.class, 123456L)
        this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, LocalDateTime.now());
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        log.info("开始更新填充...");
        this.strictInsertFill(metaObject, "updateUserId", Long.class, 123456L)
        this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
    }
}
```



# 乐观锁

编写配置类

```java
@Configuration
@MapperScan("按需修改")
public class MybatisPlusConfig {
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        return interceptor;
    }
}
```



在实体类字段加上`@Version`注解

```java
import com.baomidou.mybatisplus.annotation.Version;

public class YourEntity {
    @Version
    private Integer version;
    // 其他字段...
}
```



# 查询操作



## 条件查询

mybatis-plus通过接收map类型的参数，实现条件查询，将需要筛选的条件放入map中

```java
@Test
public void testSelect(){
    HashMap<String,Object> map = new HashMap<>();
    // 需要设置的条件
    map.put("name","blueocean");
    map.put("age",18);
    
    List<User> users = userMapper.selectByMap(map);
}
```



## 分页查询

添加配置类即可

```java
@Configuration
@MapperScan("scan.your.mapper.package")
public class MybatisPlusConfig {
    /**
     * 添加分页插件
     */
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL)); // 如果配置多个插件, 切记分页最后添加
        // 如果有多数据源可以不配具体类型, 否则都建议配上具体的 DbType
        return interceptor;
    }
}
```

使用时需要传入page对象作为参数

```java
@Test
public void testPage(){
    Page<User> page = new Page<>(1,5); // 第一个参数为当前页，第二个参数为分页大小
    userMapper.selectPage(page,null);
    page.getRecords().forEach(System.out::println);
}
```



# 逻辑删除

逻辑删除是一种优雅的数据管理策略，它通过在数据库中标记记录为“已删除”而非物理删除，来保留数据的历史痕迹，同时确保查询结果的整洁性。一般为数据库表添加逻辑删除字段`deleted`



在`application.yml`中配置MyBatis-Plus的全局逻辑删除属性

```yml
mybatis-plus:
  global-config:
    db-config:
      logic-delete-field: deleted # 全局逻辑删除字段名
      logic-delete-value: 1 # 逻辑已删除值
      logic-not-delete-value: 0 # 逻辑未删除值
```



在实体类中为逻辑删除字段使用`@TableLogic`注解

```java
import com.baomidou.mybatisplus.annotation.TableLogic;

public class User {
    // 其他字段...

    @TableLogic
    private Integer deleted;
}
```



# 条件构造器

MyBatis-Plus 提供了一套强大的条件构造器（Wrapper），用于构建复杂的数据库查询条件。Wrapper 类允许开发者以链式调用的方式构造查询条件，无需编写繁琐的 SQL 语句，从而提高开发效率并减少 SQL 注入的风险。



主要的Wapper类型：

- AbstractWrapper：这是一个抽象基类，提供了所有 Wrapper 类共有的方法和属性。它定义了条件构造的基本逻辑，包括字段（column）、值（value）、操作符（condition）等。所有的 QueryWrapper、UpdateWrapper、LambdaQueryWrapper 和 LambdaUpdateWrapper 都继承自 AbstractWrapper。

- QueryWrapper：专门用于构造查询条件，支持基本的等于、不等于、大于、小于等各种常见操作。它允许你以链式调用的方式添加多个查询条件，并且可以组合使用 and 和 or 逻辑。

- UpdateWrapper：用于构造更新条件，可以在更新数据时指定条件。与 QueryWrapper 类似，它也支持链式调用和逻辑组合。使用 UpdateWrapper 可以在不创建实体对象的情况下，直接设置更新字段和条件。

- LambdaQueryWrapper：这是一个基于 Lambda 表达式的查询条件构造器，它通过 Lambda 表达式来引用实体类的属性，从而避免了硬编码字段名。这种方式提高了代码的可读性和可维护性，尤其是在字段名可能发生变化的情况下。

- LambdaUpdateWrapper：类似于 LambdaQueryWrapper，LambdaUpdateWrapper 是基于 Lambda 表达式的更新条件构造器。它允许你使用 Lambda 表达式来指定更新字段和条件，同样避免了硬编码字段名的问题。



Wrapper方法通常接受一个boolean类型的参数，用于决定是否将该条件加入到最终的SQL中，相当于动态sql的控制。

```java
queryWrapper.like(StringUtils.isNotBlank(name), Entity::getName, name)
            .eq(age != null && age >= 0, Entity::getAge, age);
```



常用方法：

- ne：设置单个字段不相等

```java
// 设置指定字段的不相等条件
ne(R column, Object val)

// 根据条件设置指定字段的不相等条件
ne(boolean condition, R column, Object val)
```

- gt：用于设置单个字段大于条件

```java
// 设置指定字段的大于条件
gt(R column, Object val)

// 根据条件设置指定字段的大于条件
gt(boolean condition, R column, Object val)
```

- ge：用于设置单个字段大于等于条件
- lt
- le
- between：用于设置单个字段的BETWEEN条件

```java
// 设置指定字段的 BETWEEN 条件
between(R column, Object val1, Object val2)

// 根据条件设置指定字段的 BETWEEN 条件
between(boolean condition, R column, Object val1, Object val2)
```

- like：模糊查询

```java
// 设置指定字段的 LIKE 条件
like(R column, Object val)

// 根据条件设置指定字段的 LIKE 条件
like(boolean condition, R column, Object val)
```

- inSql：MyBatis-Plus 中用于构建查询条件的高级方法之一，它用于设置单个字段的 IN 条件，并且允许直接使用sql语句生成IN子句中的集合（子查询）

```java
// 设置指定字段的 IN 条件，使用 SQL 语句
inSql(R column, String sqlValue)
inSql(boolean condition, R column, String sqlValue)
    
// 普通
QueryWrapper<User> queryWrapper = new QueryWrapper<>();
queryWrapper.inSql("age", "1,2,3,4,5,6");

// 子查询
QueryWrapper<User> queryWrapper = new QueryWrapper<>();
queryWrapper.inSql("id", "select id from other_table where id < 3");
```

上述子查询生成的SQL

```sql
SELECT * FROM user WHERE id IN (select id from other_table where id < 3)
```



# 代码生成器

可以快速生成 Entity、Mapper、Mapper XML、Service、Controller 等各个模块的代码，极大的提升了开发效率。



依赖注入

```xml
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-generator</artifactId>
    <version>3.5.11</version>
</dependency>
```



快速使用

```java
public static void main(String[] args) {
    FastAutoGenerator.create("url", "username", "password")
            .globalConfig(builder -> {
                builder.author("baomidou") // 设置作者
                        .enableSwagger() // 开启 swagger 模式
                        .outputDir(Paths.get(System.getProperty("user.dir")) + "/src/main/java"); // 指定输出目录
            })
            .dataSourceConfig(builder ->
                    builder.typeConvertHandler((globalConfig, typeRegistry, metaInfo) -> {
                        int typeCode = metaInfo.getJdbcType().TYPE_CODE;
                        if (typeCode == Types.SMALLINT) {
                            // 自定义类型转换
                            return DbColumnType.INTEGER;
                        }
                        return typeRegistry.getColumnType(metaInfo);
                    })
            )
            .packageConfig(builder ->
                    builder.parent("com.baomidou.mybatisplus") // 设置父包名
                           .moduleName("system") // 设置父包模块名
                           .entity("entity")
                		   .mapper("mapper")
                		   .service("service")
                		   .serviceImpl("service.impl")
               			   .xml("mapper.xml")
            )
            .strategyConfig(builder ->
                    builder.addInclude("t_simple") // 设置需要生成的表名
                           .addTablePrefix("t_", "c_") // 设置过滤表前缀
                           .enableLombok() // 使用lombok
            )
            .templateEngine(new FreemarkerTemplateEngine()) // 使用Freemarker引擎模板，默认的是Velocity引擎模板
            .execute();
}
```

