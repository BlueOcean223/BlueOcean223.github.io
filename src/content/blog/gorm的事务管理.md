---
title: gorm的事务管理
pubDate: 2025-06-04T22:15:37.000Z
tags: []
---

## 前言
go中操作数据库一般使用`gorm`框架进行，而较少用原生的`datebase/sql`包。标准库的`datebase/sql`包需要手写sql，对于简单的sql操作来说过于繁琐，因此平时开发更倾向于使用`gorm`。而说到数据库操作，就离不开事务管理，`gorm`支持事务管理，并且非常灵活、简单

## 介绍
开启事务

```go
tx := db.Begin()
if tx.Error != nil {
    return tx.Error
}
```



当发生错误时，回滚事务

```go
if err != nil {
    tx.Rollback()
}
```



提交事务

```go
if err := tx.Commit().Error;err != nil {
    // 提交事务发生异常
    tx.Rollback()
}
```


## 事务失效的情况
由于每次gorm操作数据库时，都会向连接池获取一个连接，这些连接不共享一个事务，因此在涉及多张表操作时，如果想由同一个事务控制，则需要使用由`db.Begin()`开启事务时返回的`tx`对象

```go
func (s *TaskService) AddTeamTask(task models.Task) error {
    // 开启事务
    tx := s.teamTaskRepository.Db.Begin()
    defer func() {
        if r := recover(); r != nil {
            tx.Rollback()
        }
    }()

    // 向任务表写数据
    if err := s.taskRepository.Create(&task); err != nil {
        tx.Rollback()
        return err
    }

    teamTask := models.TeamTask{
        TaskId: task.Id,  
        UserId: task.UserId,
        Status: 0,
    }

    // 向任务关系表写数据
    if err := s.teamTaskRepository.Create(&teamTask); err != nil {
        tx.Rollback()
        return err
    }

    // 提交事务
    return tx.Commit().Error
}
```

两张表插入数据时，都在使用自己的数据库连接，并没有用到`tx`，不共享同一个事务，此时即使`tx.Rollback()`也是无效的回滚。



## 直接操作

更加简单快速、适合快速开发

```go
func (s *TaskService) AddTeamTask(task models.Task) error {
    // 开启事务
    tx := s.teamTaskRepository.Db.Begin()
    defer func() {
        if r := recover(); r != nil {
            tx.Rollback()
        }
    }()

    // 向任务表写数据
    if err := tx.Create(&task); err != nil {
        tx.Rollback()
        return err
    }

    teamTask := models.TeamTask{
        TaskId: task.Id,  
        UserId: task.UserId,
        Status: 0,
    }

    // 向任务关系表写数据
    if err := tx.Create(&teamTask); err != nil {
        tx.Rollback()
        return err
    }

    // 提交事务
    return tx.Commit().Error
}
```





## 数据库层支持传入操作指针

更加灵活，而且保留了数据库操作的封装性。同时也保持了代码的可读性，可根据调用的对象和函数快速判断在向哪张数据库表进行什么操作。

```go
func (s *TaskService) AddTeamTask(task models.Task) error {
    // 开启事务
    tx := s.teamTaskRepository.Db.Begin()
    defer func() {
        if r := recover(); r != nil {
            tx.Rollback()
        }
    }()

    // 向任务表写数据
    if err := s.taskRepository.Create(&task,tx); err != nil {
        tx.Rollback()
        return err
    }

    teamTask := models.TeamTask{
        TaskId: task.Id,  
        UserId: task.UserId,
        Status: 0,
    }

    // 向任务关系表写数据
    if err := s.teamTaskRepository.Create(&teamTask,tx); err != nil {
        tx.Rollback()
        return err
    }

    // 提交事务
    return tx.Commit().Error
}
```

在不需要事务管理时，只需要传入`nil`即可。
